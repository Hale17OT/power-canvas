import { PowerCanvasError } from '../core/errors.js';

// Microsoft documents these nine defaults in the Web API Functions and Actions sample.
// Their Global depth was read back from the new experiment role. This bounded adapter
// rejects other default sets; it never grants, removes or silently ignores unknown rights.
export const PLATFORM_ROLE_DEFAULTS = ['prvCreateSharePointData', 'prvReadPluginAssembly', 'prvReadPluginType', 'prvReadSdkMessage',
  'prvReadSdkMessageProcessingStep', 'prvReadSdkMessageProcessingStepImage', 'prvReadSharePointData', 'prvReadSharePointDocument', 'prvWriteSharePointData'];
export type Grant = { privilegeName: string; depth: string };
export function normalizeGrants(actual: Grant[], requested: Grant[]): { grants: Grant[]; platformDefaultGrants: Grant[] } {
  const platformDefaultGrants = actual.filter(item => PLATFORM_ROLE_DEFAULTS.includes(item.privilegeName)).sort((a, b) => a.privilegeName.localeCompare(b.privilegeName));
  if (platformDefaultGrants.length !== PLATFORM_ROLE_DEFAULTS.length || platformDefaultGrants.some(item => item.depth !== 'Global') ||
      new Set(platformDefaultGrants.map(item => item.privilegeName)).size !== PLATFORM_ROLE_DEFAULTS.length) {
    throw new PowerCanvasError('PF-MDA-010', 'Platform-created role defaults differ from the verified nine-privilege baseline.', 'Stop and inspect the complete role. Do not grant replacements or discard unexplained permissions.');
  }
  const grants = actual.filter(item => !PLATFORM_ROLE_DEFAULTS.includes(item.privilegeName)).map(item => ({ ...item,
    privilegeName: requested.find(wanted => wanted.privilegeName.toLowerCase() === item.privilegeName.toLowerCase())?.privilegeName ?? item.privilegeName,
  })).sort((a, b) => a.privilegeName.localeCompare(b.privilegeName));
  return { grants, platformDefaultGrants };
}
