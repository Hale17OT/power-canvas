import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { hasCode, PowerCanvasError } from '../core/errors.js';
import { forbiddenKeys, hashJson } from '../core/json.js';
import type { JsonInput } from '../core/json.js';
import { isSecretKey, redactText } from '../core/logging.js';
import { journalEventSchema, observationSchema, ownershipSchema, planSchema, targetSchema } from './models.js';
import type { JournalEvent, Observation, Ownership, Plan, Target } from './models.js';

type Bound = { projectId: string; target: Target };
export interface StateWriter {
  saveOwnership(value: Ownership): Promise<void>;
  saveObservation(value: Observation): Promise<void>;
  savePlan(value: Plan): Promise<void>;
  appendJournal(value: JournalEvent): Promise<void>;
}

function stateError(message: string, code = 'PF-STATE-001' as const): PowerCanvasError {
  return new PowerCanvasError(code, message, 'Inspect local state and target binding. Do not discard ownership or retry remote writes blindly.');
}

function assertSafeData(value: unknown, depth = 0): void {
  if (depth > 64) throw stateError('State exceeds the nesting limit.');
  if (typeof value === 'string' && redactText(value) !== value) throw stateError('Sensitive or control data is not allowed in state.');
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKeys.has(key) || isSecretKey(key) || key.split(/[./]/).some(isSecretKey)) throw stateError('Credential-shaped fields are not allowed in state.');
      assertSafeData(nested, depth + 1);
    }
  }
}

async function assertRegular(path: string, directory = false): Promise<void> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw stateError('State paths cannot be links or unexpected file types.');
  } catch (error) { if (!hasCode(error, 'ENOENT')) throw error; }
}

/** Single-host persistence. Every mutation requires an exclusive target lock. */
export class LocalStateStore {
  readonly root: string;
  readonly target: Target;
  readonly projectId: string;
  private readonly stateRoot: string;

  constructor(projectDirectory: string, projectId: string, target: Target) {
    this.projectId = z.uuid().parse(projectId).toLowerCase();
    this.target = Object.freeze(targetSchema.parse(target));
    this.stateRoot = resolve(projectDirectory, '.powercanvas');
    this.root = join(this.stateRoot, hashJson({ projectId: this.projectId, target: this.target }));
  }

  private parse<T extends Bound>(schema: z.ZodType<T>, value: unknown): T {
    assertSafeData(value);
    const result = schema.safeParse(value);
    if (!result.success) throw stateError('State record is invalid or has an unsupported version.');
    if (result.data.projectId !== this.projectId || hashJson(result.data.target) !== hashJson(this.target)) throw stateError('State belongs to another project or target.');
    return result.data;
  }

  private async paths(path: string): Promise<void> {
    await assertRegular(this.stateRoot, true);
    await assertRegular(this.root, true);
    await assertRegular(path);
  }

  private async read<T extends Bound>(name: string, schema: z.ZodType<T>): Promise<T | undefined> {
    const path = join(this.root, name);
    await this.paths(path);
    try { return this.parse(schema, JSON.parse(await readFile(path, 'utf8')) as unknown); }
    catch (error) {
      if (hasCode(error, 'ENOENT')) return undefined;
      if (error instanceof PowerCanvasError) throw error;
      throw stateError('State file cannot be read or contains corrupt JSON.');
    }
  }

  readOwnership(): Promise<Ownership | undefined> { return this.read('ownership.json', ownershipSchema); }
  readObservation(id: string): Promise<Observation | undefined> { return this.read(`observation-${z.uuid().parse(id)}.json`, observationSchema); }
  async readPlan(id: string): Promise<Plan | undefined> {
    const plan = await this.read(`plan-${z.uuid().parse(id)}.json`, planSchema);
    if (plan) this.verifyPlanHash(plan);
    return plan;
  }

  private verifyPlanHash(plan: Plan): void {
    const { contentHash, ...body } = plan;
    if (hashJson(body) !== contentHash) throw stateError('Saved plan content hash does not match.');
  }

  async readJournal(executionId: string): Promise<JournalEvent[]> {
    const id = z.uuid().parse(executionId);
    const path = join(this.root, `journal-${id}.jsonl`);
    await this.paths(path);
    let content: string;
    try { content = await readFile(path, 'utf8'); }
    catch (error) { if (hasCode(error, 'ENOENT')) return []; throw stateError('Cannot read journal.'); }
    if (!content.endsWith('\n')) throw stateError('Journal has an incomplete trailing event; recovery review is required.');
    try {
      return content.slice(0, -1).split('\n').map(line => {
        const event = this.parse(journalEventSchema, JSON.parse(line) as unknown);
        if (event.executionId !== id) throw stateError('Journal execution does not match its file.');
        return event;
      });
    } catch (error) { if (error instanceof PowerCanvasError) throw error; throw stateError('Journal contains corrupt JSON.'); }
  }

  private async atomic(name: string, value: JsonInput): Promise<void> {
    const path = join(this.root, name);
    await this.paths(path);
    const temporary = join(this.root, `.write-${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch(error => { if (!hasCode(error, 'ENOENT')) throw error; });
    }
  }

  async withLock<T>(work: (writer: StateWriter) => Promise<T>): Promise<T> {
    await assertRegular(this.stateRoot, true);
    await mkdir(this.stateRoot, { recursive: true, mode: 0o700 });
    await assertRegular(this.root, true);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const lockPath = join(this.root, 'writer.lock');
    await this.paths(lockPath);
    const lock = await open(lockPath, 'wx', 0o600).catch(error => {
      if (hasCode(error, 'EEXIST')) throw new PowerCanvasError('PF-STATE-002', 'This project and target already have a writer lock.', 'Wait for the writer. For a crashed process, inspect the journal and reconcile before manually removing its lock.');
      throw stateError('Cannot acquire local writer lock.');
    });
    let active = true;
    let tail: Promise<void> = Promise.resolve();
    let writeFailure: unknown;
    const enqueue = (operation: () => Promise<void>): Promise<void> => {
      if (!active) return Promise.reject(stateError('Writer lease has ended.'));
      const pending = tail.then(async () => {
        if (writeFailure) throw writeFailure;
        await operation();
      });
      tail = pending.catch((error: unknown) => { writeFailure = error; });
      return pending;
    };
    const writer: StateWriter = {
      saveOwnership: value => enqueue(async () => {
        const parsed = this.parse(ownershipSchema, value);
        const current = await this.readOwnership();
        if (parsed.revision !== (current ? current.revision + 1 : 0)) throw stateError('Ownership revision must advance by exactly one, starting at zero.');
        await this.atomic('ownership.json', parsed);
      }),
      saveObservation: value => enqueue(async () => {
        const parsed = this.parse(observationSchema, value);
        await this.atomic(`observation-${parsed.snapshotId}.json`, parsed);
      }),
      savePlan: value => enqueue(async () => {
        const parsed = this.parse(planSchema, value); this.verifyPlanHash(parsed);
        await this.atomic(`plan-${parsed.planId}.json`, parsed);
      }),
      appendJournal: value => enqueue(async () => {
        const parsed = this.parse(journalEventSchema, value);
        const path = join(this.root, `journal-${parsed.executionId}.jsonl`);
        await this.paths(path);
        const previous = await this.readJournal(parsed.executionId);
        if (previous.some(event => event.eventId === parsed.eventId)) throw stateError('Journal event IDs must be unique.');
        const file = await open(path, 'a', 0o600);
        try { await file.writeFile(`${JSON.stringify(parsed)}\n`, 'utf8'); await file.sync(); }
        finally { await file.close(); }
      }),
    };
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      await lock.sync();
      const result = await work(writer);
      active = false;
      await tail;
      if (writeFailure) throw writeFailure;
      return result;
    } finally {
      active = false;
      await tail;
      await lock.close();
      await unlink(lockPath);
    }
  }
}
