import {hashJson,type JsonInput} from '../core/json.js';
/** Shared desired/baseline/observed comparison. Projection is caller-defined and never suppresses drift. */
export function ownedComparison(desired:unknown,baseline:unknown,observedBaseline:unknown,observedDesired:unknown){
 const hash=(v:unknown)=>hashJson(v as JsonInput);
 return {drift:hash(baseline)!==hash(observedBaseline),equal:hash(desired)===hash(observedDesired)};
}
