import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { applicationPurposes, planApplicationOperation } from '../src/canvas/application-boundary.js';
import { loadProject } from '../src/config/load.js';
import { compileCanvas } from '../src/canvas/compile.js';
import { compileNativeCanvas } from '../src/canvas/native.js';
import { controls, dependencies } from '../src/canvas/taste/audit.js';
import { compositions } from '../src/canvas/taste/compositions.js';
import { authoringPrerequisites } from '../src/canvas/adapter.js';

const {project}=await loadProject('examples/canvas-native-complaints');
const bindings=JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json','utf8'));
const policy=project.canvasApps!.complaintPortal!.application!;
const explicit={requiresNewApplication:true,requirement:{kind:'explicit-application',statement:'User explicitly requests a separate inventory application.'}};

it('defaults to one existing application and blocks implicit creation for every purpose',()=>{
  expect(planApplicationOperation()).toMatchObject({applicationCount:1,requiresNewApplication:false,applicationCreates:0,remoteWrites:0});
  for(const purpose of applicationPurposes) expect(()=>planApplicationOperation({}, {operation:'create-new',purpose})).toThrow('blocked');
});
it('requires an explicit application-level request, never a design or benchmark purpose',()=>{
  expect(()=>planApplicationOperation({requiresNewApplication:true},{operation:'create-new'})).toThrow();
  expect(planApplicationOperation(explicit,{operation:'create-new'})).toMatchObject({applicationCreates:1,remoteWrites:0});
  for(const purpose of applicationPurposes.filter(p=>p!=='application')) expect(()=>planApplicationOperation(explicit,{operation:'create-new',purpose})).toThrow('blocked');
});
it('generates all device compositions in one package with one form, source and commit path',()=>{
  const generated=compileNativeCanvas(project,'complaintPortal',bindings);
  expect(generated.manifest.applicationBoundary).toMatchObject({appId:bindings.appId,applicationCount:1,applicationCreates:0});
  expect(Object.keys(generated.files).filter(n=>n==='App.pa.yaml')).toHaveLength(1);
  expect(controls(generated.files).filter(n=>n.node.Control==='Form')).toHaveLength(1);
  const formulas=dependencies(generated.files);
  expect(formulas.filter(d=>d.calls.includes('SubmitForm'))).toHaveLength(1);
  expect(new Set(formulas.filter(d=>d.property==='DataSource').map(d=>d.formula))).toEqual(new Set(["='Complaints'"]));
  const nodes=controls(generated.files);
  expect(nodes.find(n=>n.name.endsWith('_body'))!.node.Properties.LayoutDirection).toContain('App.Width >= 960');
  expect(nodes.find(n=>n.name.endsWith('_recordBack'))!.node.Properties.Visible).toContain('PF_tablet && App.Width < 960');
  for(const purpose of ['desktop','tablet','mobile'] as const) expect(planApplicationOperation(policy,{purpose})).toMatchObject({applicationCount:1,appId:bindings.appId,applicationCreates:0});
});
it('rejects retargeted bindings and duplicated app declarations before native generation',()=>{
  expect(()=>compileNativeCanvas(project,'complaintPortal',{...bindings,appId:'11111111-1111-4111-8111-111111111112'})).toThrow('identity mismatch');
  const duplicate=structuredClone(project);duplicate.canvasApps!.tablet=structuredClone(duplicate.canvasApps!.complaintPortal!);
  expect(()=>compileCanvas(duplicate,'complaintPortal')).toThrow();
  delete duplicate.canvasApps!.tablet.application;
  expect(()=>compileCanvas(duplicate,'complaintPortal')).toThrow();
});
it('rejects an authoring session for a different app even with matching session ownership',()=>{
  const compiled=compileCanvas(project,'complaintPortal');
  const appId='11111111-1111-4111-8111-111111111112';
  const result=authoringPrerequisites(compiled,{appId,solution:'pfx_PowerForgeExperiment',environmentType:'Default',nonDisposable:true,saved:true,studioOpen:true,coauthoring:true,preparedSources:['complaint'],revision:'r',controls:{}},{appId,solution:'pfx_PowerForgeExperiment',observedRevision:'r'});
  expect(result.blockers).toContain('Canvas session differs from the project-pinned application ID.');
});
it('keeps composition contracts scoped within an application without a creation requirement',()=>{
  for(const c of compositions()) expect(c).toMatchObject({applicationScope:'within-application',requiresNewApplication:false,desktopStrategy:{scope:'within-application'},tabletStrategy:{scope:'within-application'},mobileStrategy:{scope:'within-application'}});
});
it('blocks real CLI creation plans for benchmark, critique and device work before any remote execution',()=>{
  for(const purpose of ['benchmark','critique','mobile']) {
    const result=spawnSync(process.execPath,['dist/cli/index.js','--project','examples/canvas-native-complaints','canvas','application-plan','--app','complaintPortal','--operation','create-new','--purpose',purpose],{encoding:'utf8'});
    expect(result.status).toBe(1);expect(result.stderr+result.stdout).toContain('New Canvas App blocked');
  }
});
