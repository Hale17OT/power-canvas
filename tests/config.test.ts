import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initProject } from '../src/config/init.js';
import { loadProject, MAX_CONFIG_BYTES, parseProject } from '../src/config/load.js';
import { PowerCanvasError } from '../src/core/errors.js';
import { hashJson } from '../src/core/json.js';
import { resourceId } from '../src/ir/identity.js';
import { validateCapabilities } from '../src/providers/capabilities.js';
import { asYaml, clean, fixture, fixtureSource, temporary } from './helpers.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(clean)); });

describe('IR parsing and semantics', () => {
  it('validates the real template with a relationship-owned lookup and system view column', () => {
    const project = fixture();
    expect(Object.keys(project.dataverse.tables)).toHaveLength(2);
    expect(project.dataverse.tables.complaint?.columns.category).toBeUndefined();
    expect(project.dataverse.relationships.complaintCategory?.lookup.schemaName).toBe('pf_Category');
    expect(project.dataverse.tables.category?.auditing).toBe(false);
  });
  it.each([
    `${fixtureSource}\nflows: { notification: {} }`,
    fixtureSource.replace('type: text', 'type: formula'),
    fixtureSource.replace('maxLength: 200', 'maxLength: 200\n          maxLenght: 300'),
    fixtureSource.replace('maxLength: 200', 'maxLength: 200\n          maxLength: 300'),
    `${fixtureSource}\n---\nother: document`,
    `${fixtureSource}\nunknown: !untrusted value`,
    `${fixtureSource}\nunknown: &anchor [*anchor]`,
    `${fixtureSource}\n__proto__: { polluted: true }`,
    `${fixtureSource}\nclientSecret: secret-value`,
    fixtureSource.replace('powercanvas.dev/v1alpha1', 'powercanvas.dev/v1alpha2'),
  ])('rejects unavailable sections, misspellings, unsafe YAML and versions (%#)', source => {
    expect(() => parseProject(source)).toThrow(PowerCanvasError);
  });
  it('rejects oversized and deeply nested input', () => {
    expect(() => parseProject(' '.repeat(MAX_CONFIG_BYTES + 1))).toThrow('1 MiB');
    expect(() => parseProject(`${fixtureSource}\nunknown: ${'['.repeat(70)}0${']'.repeat(70)}`)).toThrow('nesting');
  });
  it('does not put parser input or secret unknown keys in diagnostics', () => {
    try { parseProject(`${fixtureSource}\nclientSecret: never-print-this`); }
    catch (error) { expect(JSON.stringify(error)).not.toContain('never-print-this'); }
  });
  it('rejects invalid primary names, table references and name collisions', () => {
    const project = fixture();
    project.dataverse.tables.complaint!.primaryName = 'priority';
    expect(() => parseProject(asYaml(project))).toThrow('semantics');
    const badRelationship = fixture();
    badRelationship.dataverse.relationships.complaintCategory!.toTable = 'missing';
    expect(() => parseProject(asYaml(badRelationship))).toThrow('semantics');
    const collision = fixture();
    collision.dataverse.tables.complaint!.columns.description!.schemaName = 'pf_Title';
    expect(() => parseProject(asYaml(collision))).toThrow('semantics');
  });
  it('allows circular table relationships while rejecting duplicate lookup identities', () => {
    const project = fixture();
    const rel = project.dataverse.relationships.complaintCategory!;
    project.dataverse.relationships.categoryComplaint = { ...rel, schemaName: 'pf_Complaint_Category', fromTable: 'category', toTable: 'complaint', lookup: { ...rel.lookup, key: 'complaint', schemaName: 'pf_Complaint' } };
    expect(() => parseProject(asYaml(project))).not.toThrow();
    project.dataverse.relationships.duplicate = { ...rel, schemaName: 'pf_Duplicate' };
    expect(() => parseProject(asYaml(project))).toThrow('semantics');
  });
  it('checks bounds, publisher names and numeric choice identity', () => {
    for (const mutate of [
      (p: ReturnType<typeof fixture>) => { p.solution.version = '65536.0.0.0'; },
      (p: ReturnType<typeof fixture>) => { p.dataverse.tables.complaint!.schemaName = 'wrong_Complaint'; },
      (p: ReturnType<typeof fixture>) => { const c = p.dataverse.tables.complaint!.columns.priority!; if (c.type === 'choice') c.default = 12; },
      (p: ReturnType<typeof fixture>) => { const c = p.dataverse.tables.complaint!.columns.priority!; if (c.type === 'choice') c.choices[1]!.value = c.choices[0]!.value; },
      (p: ReturnType<typeof fixture>) => { const c = p.dataverse.tables.complaint!.columns.priority!; if (c.type === 'choice') c.choices[1]!.value = 123; },
    ]) {
      const project = fixture(); mutate(project);
      expect(() => parseProject(asYaml(project))).toThrow('semantics');
    }
  });
  it('checks app references and explicit role access', () => {
    const project = fixture();
    project.apps.complaintDesk!.forms.complaintMain!.fields.push('createdon');
    expect(() => parseProject(asYaml(project))).toThrow('semantics');
    const noRole = fixture();
    noRole.security.appAccess = {};
    expect(() => parseProject(asYaml(noRole))).toThrow('semantics');
    const wrongDepth = fixture();
    wrongDepth.security.roles.complaintAgent!.tables.category!.read = 'user';
    expect(() => parseProject(asYaml(wrongDepth))).toThrow('semantics');
  });
});

describe('identity and capability boundaries', () => {
  it('keeps identity through display label changes and preserves explicit choices', () => {
    const project = fixture();
    const before = resourceId(project.project.id, 'dataverse', 'column', ['complaint', 'priority']);
    const column = project.dataverse.tables.complaint!.columns.priority!;
    if (column.type !== 'choice') throw new Error('Fixture is not a choice');
    column.displayName = 'Urgency';
    column.choices.reverse();
    column.choices[0]!.label = 'Critical';
    const roundtrip = parseProject(asYaml(project));
    expect(resourceId(roundtrip.project.id, 'dataverse', 'column', ['complaint', 'priority'])).toBe(before);
    expect(roundtrip.dataverse.tables.complaint!.columns.priority).toEqual(column);
  });
  it('hashes object order independently but preserves meaningful array order', () => {
    expect(hashJson({ b: 2, a: 1 })).toBe(hashJson({ a: 1, b: 2 }));
    expect(hashJson(['a', 'b'])).not.toBe(hashJson(['b', 'a']));
    expect(() => hashJson(NaN)).toThrow();
  });
  it('does not confuse supported APIs with executable PowerCanvas providers', () => {
    expect(validateCapabilities(fixture()).every(item => item.severity === 'warning')).toBe(true);
    expect(validateCapabilities(fixture(), true).every(item => item.severity === 'error')).toBe(true);
  });
});

describe('project files', () => {
  it('initializes, reloads and preserves existing config and ignore content', async () => {
    const dir = await temporary(); dirs.push(dir);
    await writeFile(join(dir, '.gitignore'), 'important-existing-rule');
    const result = await initProject(dir, { template: 'complaint-management', name: 'new-complaints' });
    const loaded = await loadProject(dir);
    expect(loaded.project.project.id).toBe(result.projectId);
    expect(loaded.project.project.name).toBe('new-complaints');
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toContain('important-existing-rule\n.powercanvas/');
    const before = await readFile(result.path, 'utf8');
    await expect(initProject(dir, { template: 'complaint-management' })).rejects.toThrow('already exists');
    expect(await readFile(result.path, 'utf8')).toBe(before);
  });
  it('does not accept invalid overrides or silently load another directory', async () => {
    const dir = await temporary(); dirs.push(dir);
    await expect(initProject(dir, { template: 'complaint-management', name: '../bad' })).rejects.toThrow('structure');
    await expect(loadProject(dir)).rejects.toThrow('No powercanvas.yaml');
    await expect(initProject(dir, { template: 'canvas' })).rejects.toThrow('unavailable');
  });
  it('rejects a nonregular ignore path before creating config and overrides unsafe ignore negations', async () => {
    const bad = await temporary(); dirs.push(bad);
    await mkdir(join(bad, '.gitignore'));
    await expect(initProject(bad, { template: 'complaint-management' })).rejects.toThrow('regular file');
    await expect(loadProject(bad)).rejects.toThrow('No powercanvas.yaml');
    const dir = await temporary(); dirs.push(dir);
    await writeFile(join(dir, '.gitignore'), '.powercanvas/\n!.powercanvas/\n');
    await initProject(dir, { template: 'complaint-management' });
    const ignored = await readFile(join(dir, '.gitignore'), 'utf8');
    expect(ignored.lastIndexOf('\n.powercanvas/')).toBeGreaterThan(ignored.indexOf('!.powercanvas/'));
  });
});
