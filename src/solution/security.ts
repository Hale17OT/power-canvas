import type {Project} from '../ir/schema.js';
import type {SolutionSpec,Issue} from './schema.js';

const levels=['none','user','businessUnit','parentChildBusinessUnit','organization'];
export function securityAudit(project:Project,spec:SolutionSpec){
 const issues:Issue[]=[];const add=(code:string,message:string,resource:string,severity:Issue['severity']='error')=>issues.push({code,message,resource,severity});
 for(const [key,role]of Object.entries(project.security.roles))for(const [table,rights]of Object.entries(role.tables)){
  if(rights.write&&rights.write!=='none'&&(!rights.read||rights.read==='none'))add('WRITE_WITHOUT_READ',table+': write requires an explicit read privilege','rolePermissions:'+key);
  if(Object.entries(rights).some(([action,depth])=>action!=='read'&&depth==='organization'))add('BROAD_PRIVILEGE',table+': organization-wide mutations require a business justification','rolePermissions:'+key,'warning');
 }
 for(const [app,roles]of Object.entries(project.security.appAccess))for(const role of roles)for(const table of project.apps[app]?.tables??[]){const read=project.security.roles[role]?.tables[table]?.read;if(!read||read==='none')add('APP_WITHOUT_READ',`${role} can see ${app} but cannot read ${table}`,'appAccess:'+app);}
 const personas=(spec.personas??[]).map(persona=>{
  for(const req of persona.requiredBy)if(!spec.requirements.some(r=>r.id===req))add('PERSONA_REQUIREMENT','Unknown requirement '+req,'persona:'+persona.id);
  for(const role of persona.roles)if(!project.security.roles[role])add('PERSONA_ROLE','Unknown role '+role,'persona:'+persona.id);
  for(const app of persona.apps){const [kind,key]=app.split(':');if(kind==='app'){
   if(!project.apps[key!])add('PERSONA_APP','Unknown model app '+app,'persona:'+persona.id);
   if(!persona.roles.some(r=>project.security.appAccess[key!]?.includes(r)))add('PERSONA_NO_APP_ACCESS','Persona lacks explicit app-role access','persona:'+persona.id);
  }else if(kind!=='canvas'||!project.canvasApps?.[key!])add('PERSONA_APP','Unknown app '+app,'persona:'+persona.id);}
  for(const [table,required]of Object.entries(persona.tableAccess)){
   if(!project.dataverse.tables[table])add('PERSONA_TABLE','Unknown table '+table,'persona:'+persona.id);
   for(const action of ['read','create','write','append','appendTo','delete','assign','share'] as const){const actual=Math.max(0,...persona.roles.map(r=>levels.indexOf(project.security.roles[r]?.tables[table]?.[action]??'none'))),wanted=levels.indexOf(required[action]??'none');if(actual>wanted)add('OVERPRIVILEGED',`${table}.${action}: ${levels[actual]} exceeds required ${levels[wanted]}`,'persona:'+persona.id);if(actual<wanted)add('MISSING_PRIVILEGE',`${table}.${action}: required ${levels[wanted]}`,'persona:'+persona.id);}
  }
  for(const role of persona.roles)for(const table of Object.keys(project.security.roles[role]?.tables??{}))if(!persona.tableAccess[table])add('OVERPRIVILEGED','Role grants an undeclared persona table '+table,'persona:'+persona.id);
  for(const flow of persona.flowAccess){if(!project.resources?.flows[flow]&&!project.resources?.workflowRecipes?.[flow])add('PERSONA_FLOW','Unknown workflow '+flow,'persona:'+persona.id);else add('RUN_ONLY_UNPROVEN','Connection ownership and run-only persona authorization require runtime evidence','flow:'+flow,'warning');}
  if(!persona.apps.length&&Object.values(persona.tableAccess).some(r=>r.read&&r.read!=='none'))add('DATA_WITHOUT_APP','Persona has data access but no declared app access','persona:'+persona.id,'warning');
  return {...persona,userAssignments:'ENVIRONMENT_CONFIGURATION',runtime:'UNPROVEN',navigation:persona.apps.flatMap(a=>project.apps[a.replace(/^app:/,'')]?.navigation??[])};
 });
 return {issues,personas,productionReady:false,teamLifecycle:'PLANNED',humanAssignments:0};
}
