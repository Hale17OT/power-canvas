import type { CredentialBroker, VerifiedTarget } from '../auth/contracts.js';
import type { Diagnostic } from '../core/errors.js';
import type { Project } from '../ir/schema.js';
import type { Observation, Ownership, Plan, PlannedOperation, Target, JournalEvent } from '../state/models.js';
import type { Capability } from './capabilities.js';

export type ProviderOutcome<T> =
  | { status: 'available'; value: T }
  | { status: 'manualPrerequisite' | 'unsupported' | 'preview' | 'experimental'; diagnostics: readonly Diagnostic[] };

export interface ReadContext { readonly target: VerifiedTarget; readonly credentials: CredentialBroker; readonly signal: AbortSignal }
export interface WriteContext extends ReadContext {
  readonly executionId: string;
  readonly planHash: string;
  readonly journal: (event: JournalEvent) => Promise<void>;
}
export interface DiscoveryRequest { readonly project: Project; readonly target: Target }
export interface Verification { passed: boolean; observed: Observation; diagnostics: readonly Diagnostic[] }

/** TOperation is a provider's bounded union, not arbitrary HTTP or generic CRUD. */
export interface Provider<TOperation extends PlannedOperation> {
  readonly id: string;
  readonly version: string;
  readonly capabilities: readonly Capability[];
  discover(request: DiscoveryRequest, context: ReadContext): Promise<ProviderOutcome<Observation>>;
  validate(project: Project): readonly Diagnostic[];
  plan(input: { project: Project; observed: Observation; ownership: Ownership }): ProviderOutcome<Plan>;
  apply(operation: TOperation, context: WriteContext): Promise<ProviderOutcome<{ remoteId: string; serviceOperationId?: string }>>;
  observe(request: DiscoveryRequest, context: ReadContext): Promise<ProviderOutcome<Observation>>;
  verify(operation: TOperation, context: ReadContext): Promise<Verification>;
}
