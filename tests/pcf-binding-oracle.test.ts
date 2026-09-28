import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolveOracleHosts,assessOracleCapture} from '../src/pcf/binding-oracle.js';
import {parseControlDescriptions,serializeObservedBindings} from '../src/pcf/binding-parser.js';
const xml=readFileSync('tests/pcf/binding/field-oracle.xml','utf8');
const installed=[{name:'pfx_PowerCanvas.ColorContrastField',platformId:'00000000-0000-0000-0000-000000000099',namespace:'PowerCanvas',constructor:'ColorContrastField',version:'1.0.0',manifestHash:'sanitized-test-evidence'}];
describe('Microsoft field oracle boundary',()=>{
 it('resolves the exact uniqueid and installed name separately',()=>{const r=resolveOracleHosts(xml,installed)[0]!;expect(r.host.datafieldname).toBe('sample_text');expect(r.controls.filter(c=>c.identityVerified)).toHaveLength(3);expect(r.controls[0]!.installed).toBeNull();});
 it('retains native fallback and opaque static/bound parameter structure',()=>{const r=resolveOracleHosts(xml,installed)[0]!;expect(r.binding.controls).toHaveLength(4);expect(serializeObservedBindings([r.binding])).toContain('static="true"');expect(serializeObservedBindings([r.binding])).toContain('sample_text');});
 it('round trips actual Microsoft-authored parameter trees',()=>{const b=parseControlDescriptions(xml);expect(parseControlDescriptions(serializeObservedBindings(b))).toEqual(b);});
 it('does not resolve by component label or constructor alone',()=>expect(resolveOracleHosts(xml,[{...installed[0]!,name:'ColorContrastField'}])[0]!.controls.every(c=>!c.identityVerified)).toBe(true));
 it('rejects duplicate installed identities',()=>expect(()=>resolveOracleHosts(xml,[...installed,...installed])).toThrow('Ambiguous'));
 it('rejects a missing host without adopting another field',()=>expect(()=>resolveOracleHosts(xml.replace('uniqueid=','otherid='),installed)).toThrow('exactly one'));
 it('rejects ambiguous base hosts',()=>{const host=xml.match(/<control\s[^>]+\/>/)![0];expect(()=>resolveOracleHosts(xml.replace('</form>',host+'</form>'),installed)).toThrow('exactly one');});
 it('does not infer publication from internal row state or query visibility',()=>expect(assessOracleCapture({componentName:installed[0]!.name,draftComponentState:0,ordinaryReadContainsBinding:true,bindings:parseControlDescriptions(xml),uiSelectedFormFactors:['Web'],verifiedFormFactorMap:{}}).blockers).toEqual(['UI_FORM_FACTOR_MAPPING_UNVERIFIED']));
 it('blocks a selected/observed form-factor mismatch even with a supplied map',()=>expect(assessOracleCapture({componentName:installed[0]!.name,draftComponentState:1,ordinaryReadContainsBinding:false,bindings:parseControlDescriptions(xml),uiSelectedFormFactors:['Web'],verifiedFormFactorMap:{Web:'0'}}).blockers).toContain('UI_SERIALIZATION_FORM_FACTOR_MISMATCH'));
 it('never converts capture checks into live write authorization',()=>expect(assessOracleCapture({componentName:installed[0]!.name,draftComponentState:1,ordinaryReadContainsBinding:false,bindings:[],uiSelectedFormFactors:[],verifiedFormFactorMap:{}}).mutationAuthorized).toBe(false));
});

