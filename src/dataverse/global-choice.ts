import {nameSchema} from '../ir/schema.js';
import {ApiError,type DataverseHttp} from './http.js';
import {guidValue,rawObject,type Raw} from './normalize.js';

/** Global OptionSetMetadata.Name only. Public schemaName remains an authoring identity. */
export function canonicalGlobalChoiceName(name:unknown):string {
 return nameSchema.parse(name).replace(/[A-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+32));
}

/** Owned reads are anchored on MetadataId; an absent owned ID never falls back to a name. */
export async function readGlobalChoice(http:DataverseHttp,name:string,remoteId?:string):Promise<Raw|undefined>{
 const path=remoteId?`GlobalOptionSetDefinitions(${guidValue(remoteId)})`:`GlobalOptionSetDefinitions(Name='${canonicalGlobalChoiceName(name)}')`;
 try {const raw=rawObject((await http.request(path)).data);if(remoteId&&guidValue(raw.MetadataId)!==remoteId)throw Error('Global choice MetadataId differs');return raw;}
 catch(error){
  const failure=error instanceof ApiError?error.transportEvidence?.failure:undefined;
  if(!remoteId&&error instanceof ApiError&&error.status===404&&failure?.kind==='http'&&['0x80040217','0x80060888'].includes(failure.serviceErrorCode??''))return undefined;
  throw error;
 }
}
