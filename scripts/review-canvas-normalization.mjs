// Local review only. A later explicit batch command performs the guarded compile.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import process from 'node:process';
import {stringify} from 'yaml';
import {readNativeSource} from '../dist/canvas/source-provider.js';
import {hashJson} from '../dist/core/json.js';
import {validateHarnessCandidate} from '../dist/canvas/certification-harness.js';
const [generated,observed,out]=process.argv.slice(2);
const a=await readNativeSource(generated),b=await readNativeSource(observed),base=await readNativeSource('output/canvas/native/v42-focus-review');
validateHarnessCandidate(base,b);
const omissions=[];
function compare(x,y,path=[]){
 if(hashJson(x??null)===hashJson(y??null))return;
 if(x&&y&&typeof x==='object'&&typeof y==='object'){for(const k of new Set([...Object.keys(x),...Object.keys(y)]))compare(x[k],y[k],[...path,k]);return;}
 if(y!==undefined||path.at(-2)!=='Properties'||!path.includes('pc_certification_preview.pa.yaml'))throw Error('Non-omission source difference: '+path.join('/'));
 const permitted={LayoutMinWidth:['=0'],LayoutMinHeight:['=0'],FillPortions:['=0'],AlignInContainer:['=AlignInContainer.Stretch'],X:['=0'],Y:['=0'],Icon:['=""'],AutoHeight:['=false'],Height:['=32'],Visible:['=true'],Value:['=""'],AccessibleLabel:['=""'],Checked:['=false'],SelectMultiple:['=false'],IsSearchable:['=true'],Required:['=false'],Text:['=""']};
 if(!permitted[path.at(-1)]?.includes(x))throw Error('Unreviewed default omission: '+path.join('/')+' '+x);
 omissions.push({path:path.join('/'),generated:x,observed:'omitted by native authoring'});
}
compare(a,b);await mkdir(out,{recursive:true});
for(const [n,v]of Object.entries(b))await writeFile(out+'/'+n,stringify(v,{lineWidth:0}),{flag:'wx'});
await writeFile(out+'/instances.json',await readFile(generated+'/instances.json'));
await writeFile(out+'/normalization-review.json',JSON.stringify({generatedHash:hashJson(a),observedHash:hashJson(b),omissions,semanticClaim:'Only the listed observed native default omissions; no general formula equivalence or mutation retry'},null,2));
await writeFile(out+'/revision-review.json',JSON.stringify({currentHash:hashJson(b),candidateHash:hashJson(b),reason:'Explicitly review listed native default-property omissions, then require a second exact readback of that source. Original business source is byte-semantically unchanged.'},null,2));
console.log(JSON.stringify({omissions:omissions.length,expectedHash:hashJson(b),out}));
