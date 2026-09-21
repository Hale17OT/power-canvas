import { loadProject } from '../config/load.js';
import { publicError } from '../core/errors.js';
import { VERSION } from '../core/version.js';
import { capabilities } from '../providers/capabilities.js';
import { connect } from './remote.js';
import { assertWritePreflight } from '../dataverse/preflight.js';
import { DataverseDiscovery } from '../dataverse/discovery.js';
import { observeModel } from '../model-driven/discovery.js';
import { LocalStateStore } from '../state/local.js';

export async function doctor(directory: string, environmentAlias?: string, live = false, defaultExperiment = false, modelDriven = false) {
  const checks: { name: string; status: 'pass' | 'fail' | 'notRun'; detail: string }[] = [];
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  checks.push({ name: 'Node', status: major > 22 || (major === 22 && minor >= 18) ? 'pass' : 'fail', detail: process.version });
  checks.push({ name: 'PowerCanvas', status: 'pass', detail: VERSION });
  try {
    await loadProject(directory);
    checks.push({ name: 'Project', status: 'pass', detail: 'Structure and semantic references validated locally.' });
  } catch (error) {
    const safe = publicError(error);
    checks.push({ name: 'Project', status: 'fail', detail: `${safe.code}: ${safe.message} ${safe.remediation}` });
  }
  let readyForRemote = false;
  checks.push({ name: 'PAC', status: 'notRun', detail: 'Not required: this schema adapter uses documented Dataverse Web API calls.' });
  if (live || environmentAlias) {
    try {
      const connected = await connect(directory, environmentAlias);
      for (const name of ['Authentication', 'Tenant', 'Environment', 'Dataverse']) checks.push({ name, status: 'pass', detail: 'Authenticated discovery and WhoAmI agree with the bound tenant/environment/organization.' });
      const loaded = await loadProject(directory);
      await assertWritePreflight(connected.http, connected.identity.UserId, connected.environment.organizationType, connected.binding.target.organizationId, loaded.project, defaultExperiment, modelDriven);
      checks.push({ name: 'Permissions', status: 'pass', detail: 'Bounded customization privilege presence checked. Service authorization still applies per operation.' });
      const ownership = await new LocalStateStore(directory, loaded.project.project.id, connected.binding.target).readOwnership();
      const base = await new DataverseDiscovery(connected.http).observe(loaded.project, connected.binding.target, ownership);
      if (modelDriven) await observeModel(loaded.project, base, connected.http, ownership);
      checks.push({ name: 'Provider compatibility', status: 'pass', detail: 'Scoped read-only queries and normalization succeeded. This preflight does not verify application runtime or effective user access.' });
      readyForRemote = checks.every(check => check.status !== 'fail');
    } catch (error) {
      const safe = publicError(error);
      checks.push({ name: 'Live preflight', status: 'fail', detail: `${safe.code}: ${safe.message} ${safe.remediation}` });
    }
  } else for (const name of ['Authentication', 'Tenant', 'Environment', 'Dataverse', 'Permissions', 'Provider compatibility']) {
    checks.push({ name, status: 'notRun', detail: 'Use doctor --env <alias> or --live for read-only live checks.' });
  }
  return { ok: checks.every(check => check.status !== 'fail'), scope: live || environmentAlias ? 'live' : 'local', readyForRemote,
    checks, capabilities, manualPrerequisites: [defaultExperiment ? 'Default is non-disposable: dedicated experiment namespace, no adoption or destructive writes, and no UAT/production ALM claim.' : 'Remote schema work requires an approved developer/sandbox target or the explicit isolated Default experiment policy.'] };
}
