import {readdir,readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import process from 'node:process';
const source=resolve('.agents/skills'),destination=resolve('plugins/powercanvas/skills'),check=process.argv.includes('--check');
const inventory=[];
async function visit(directory){for(const entry of await readdir(directory,{withFileTypes:true})){
 const path=join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Skill packaging rejects symlinks');
 if(entry.isDirectory()){await visit(path);continue;}
 const key=relative(source,path).replaceAll('\\','/'),data=await readFile(path),target=join(destination,key);
 if(check){if(!data.equals(await readFile(target)))throw Error('Generated skill drift: '+key);}
 else{await mkdir(dirname(target),{recursive:true});if((await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;}))?.isSymbolicLink())throw Error('Generated skill target is a symlink');await writeFile(target,data);}
 inventory.push({path:key,sha256:createHash('sha256').update(data).digest('hex')});
}}
await visit(source);inventory.sort((a,b)=>a.path.localeCompare(b.path));
async function extras(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Plugin skill symlink rejected');if(entry.isDirectory())await extras(path);else if(!inventory.some(i=>i.path===relative(destination,path).replaceAll('\\','/')))throw Error('Unexpected plugin skill file; inspect manually: '+path);}}
await extras(destination);
const manifest=JSON.stringify({version:'1.0.0',authority:'.agents/skills',files:inventory},null,2)+'\n',path=resolve('plugins/powercanvas/skills-manifest.json');
if(check){if(await readFile(path,'utf8')!==manifest)throw Error('Skill package manifest drift');}else await writeFile(path,manifest);
console.log(JSON.stringify({skills:5,files:inventory.length,mode:check?'verified':'generated',remoteWrites:0}));
