import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { certifyNative, nativeCertificationV43Schema } from './certification.js';
import { readNativeSource } from './source-provider.js';
import { capabilityFingerprint, factoryFingerprint, certifiedVariant, type VariantCertificate } from './variant-certification.js';
const verified=new WeakSet<object>();
export interface CertifiedSelection {readonly certificates:readonly VariantCertificate[];readonly current:Readonly<Record<string,{factoryHash:string;capabilityHash:string}>>;readonly confidence:'native'|'published'}
/** Only this evidence-verifying loader can issue an accepted production selection context. */
export async function loadCertifiedSelection(manifestFile:string,root=process.cwd()):Promise<CertifiedSelection>{
  const manifest=z.strictObject({capabilities:z.string(),confidence:z.enum(['native','published']).default('native'),certificates:z.array(z.strictObject({evidence:z.string(),source:z.string(),metadata:z.string()}))}).parse(JSON.parse(await readFile(manifestFile,'utf8')));
  const base=resolve(manifestFile,'..'),capabilityHash=capabilityFingerprint(JSON.parse(await readFile(resolve(base,manifest.capabilities),'utf8')));
  const certificates:VariantCertificate[]=[],current:Record<string,{factoryHash:string;capabilityHash:string}>={};
  for(const entry of manifest.certificates){
    const evidencePath=resolve(base,entry.evidence),raw=nativeCertificationV43Schema.parse(JSON.parse(await readFile(evidencePath,'utf8')));
    const report=await certifyNative(raw,await readNativeSource(resolve(base,entry.source)),raw.planHash,resolve(evidencePath,'..'),JSON.parse(await readFile(resolve(base,entry.metadata),'utf8')));
    if(!report.passed||!report.factoryHash||!report.capabilityHash||!report.evidenceHash)throw new Error('Certificate is not accepted: '+report.failures.join('; '));
    current[report.component]={factoryHash:await factoryFingerprint(report.component,root),capabilityHash};
    const certificate={...report,factoryHash:report.factoryHash,capabilityHash:report.capabilityHash,evidenceHash:report.evidenceHash};
    if(!certifiedVariant(report.component,report.variant,[certificate],current[report.component]!,manifest.confidence))throw new Error('Certificate is stale or below required confidence');
    certificates.push(Object.freeze(certificate));
  }
  const selection=Object.freeze({certificates:Object.freeze(certificates),current:Object.freeze(current),confidence:manifest.confidence});verified.add(selection);return selection;
}
export function productionVariant(selection:CertifiedSelection|undefined,component:string,variant:string){
  if(!selection||!verified.has(selection)||!selection.current[component])return undefined;
  return certifiedVariant(component,variant,selection.certificates,selection.current[component]!,selection.confidence);
}
/** Restrict an evidence-verified context to a reviewed production core. No maturity promotion. */
export function restrictCertifiedSelection(selection:CertifiedSelection,variants:readonly string[]):CertifiedSelection{
  if(!verified.has(selection))throw new Error('Production core requires verified native evidence');
  const certificates=variants.map(id=>{
    const split=id.lastIndexOf('.'),component=id.slice(0,split),variant=id.slice(split+1);
    const certificate=productionVariant(selection,component,variant);
    if(!certificate)throw new Error('Uncertified production core variant: '+id);
    return certificate;
  });
  const restricted=Object.freeze({...selection,certificates:Object.freeze(certificates)});verified.add(restricted);return restricted;
}
