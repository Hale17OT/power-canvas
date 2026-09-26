import type { Project } from '../ir/schema.js';
import type { Plan } from '../state/models.js';
import { PowerCanvasError } from '../core/errors.js';

export function experimentIsolation(project: Project, _modelDriven = false): void {
  // Scope gates execution separately. Deferred app intent must still satisfy namespace isolation.
  void _modelDriven;
  const names = Object.values(project.dataverse.tables).flatMap(table => [table.schemaName, ...Object.values(table.columns).map(column => column.schemaName)]);
  names.push(...Object.values(project.dataverse.relationships).flatMap(relationship => [relationship.schemaName, relationship.lookup.schemaName]));
  names.push(...Object.values(project.dataverse.choices??{}).map(c=>c.schemaName),...Object.values(project.dataverse.keys??{}).map(k=>k.schemaName));
  if (project.solution.uniqueName !== 'pfx_PowerForgeExperiment' || project.solution.publisher.uniqueName !== 'PowerForgeExperimentPublisher' ||
      project.solution.publisher.prefix !== 'pfx' || !names.length || names.some(name => !name.startsWith('pfx_Experiment')) ||
      (Object.values(project.apps).some(app => !app.uniqueName.startsWith('pfx_Experiment') ||
        Object.values(app.forms).some(form => !form.displayName.startsWith('PowerCanvas Experiment ')) || Object.values(app.views).some(view => !view.displayName.startsWith('PowerCanvas Experiment '))) ||
        Object.values(project.security.roles).some(role => !role.displayName.startsWith('PowerCanvas Experiment ')))) {
    throw new PowerCanvasError('PF-SAFETY-005', 'Default-environment experiment isolation requirements are not satisfied.',
      'Use the dedicated pfx_PowerForgeExperiment unmanaged solution, PowerForgeExperimentPublisher/pfx, pfx_Experiment resource names and schema-only experiment project.');
  }
}
export function executionPolicy(organizationType: number, defaultExperiment: boolean, modelDriven = false, unified=false,publishModel=false): NonNullable<Plan['executionPolicy']> {
  const environmentType = organizationType === 12 ? 'Default' : organizationType === 13 ? 'Developer' : [5, 6].includes(organizationType) ? 'Sandbox' : 'Other';
  return { environmentType, mode: defaultExperiment ? 'defaultExperiment' : 'schemaDevelopment', nonDisposable: environmentType === 'Default', ...(modelDriven ? { modelDriven: true } : {}),...(unified?{unified:true}:{}),...(publishModel?{publishModel:true}:{}) };
}
