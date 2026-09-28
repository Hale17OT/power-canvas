import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseControlDescriptions as parse,serializeObservedBindings as serialize,inspectBindingXML,bindingSemanticHash} from '../src/pcf/binding-parser.js';
const fixture=readFileSync('tests/pcf/binding/platform-observed.xml','utf8');
const wrap=(body:string)=>`<controlDescriptions><controlDescription forControl="host">${body}</controlDescription></controlDescriptions>`;
describe('PCF binding observation (not a lowering certificate)',()=>{
 it('binds sanitized fixture to provenance',()=>{const provenance=JSON.parse(readFileSync('tests/pcf/binding/provenance.json','utf8'));expect(createHash('sha256').update(fixture).digest('hex')).toBe(provenance.sha256);expect(provenance.pcfContractVerified).toBe(false);});
 it('round trips observed field and dataset shaped configurations',()=>expect(parse(serialize(parse(fixture)))).toEqual(parse(fixture)));
 it('retains separate form factors',()=>expect(parse(fixture)[0]!.controls.map(c=>c.attributes.formFactor)).toEqual(['2','0','1']));
 it('retains native fallback alongside first-party field control',()=>{const c=parse(fixture)[1]!.controls;expect(c).toHaveLength(4);expect(c[0]!.attributes.id).toBeDefined();expect(c[0]!.attributes.name).toBeUndefined();expect(c[1]!.attributes.name).toContain('OptionSet');});
 it('does not generalize first-party observations into PCF proof',()=>expect(inspectBindingXML(fixture).semanticBindingVerified).toBe(false));
 it('does not derive installed identity from arbitrary names',()=>expect(parse(wrap('<customControl name="Example.Control"/>'))[0]!.controls[0]!.classification).toBe('UNCLASSIFIED'));
 it('preserves unknown parameters without asserting validity',()=>{const s=wrap('<customControl><parameters><unknown x="y">opaque</unknown></parameters></customControl>');expect(parse(serialize(parse(s)))).toEqual(parse(s));expect(inspectBindingXML(s).semanticBindingVerified).toBe(false);});
 it('normalizes indentation and attribute ordering only',()=>{const a=wrap('<customControl name="X" formFactor="0"><parameters><value type="x" static="true">a</value></parameters></customControl>');const b=wrap('<customControl formFactor="0" name="X"><parameters>\n <value static="true" type="x">a</value>\n</parameters></customControl>');expect(bindingSemanticHash(parse(a))).toBe(bindingSemanticHash(parse(b)));});
 it('preserves parameter text whitespace',()=>expect(parse(wrap('<customControl><parameters><value> a </value></parameters></customControl>'))).not.toEqual(parse(wrap('<customControl><parameters><value>a</value></parameters></customControl>'))));
 it('preserves unknown type differences',()=>expect(parse(wrap('<customControl><parameters><v type="A"/></parameters></customControl>'))).not.toEqual(parse(wrap('<customControl><parameters><v type="B"/></parameters></customControl>'))));
 it('preserves namespace URIs on nested parameters',()=>{const s=wrap('<customControl><parameters xmlns:p="urn:example"><p:value p:mode="a">x</p:value></parameters></customControl>');expect(parse(serialize(parse(s)))).toEqual(parse(s));});
 it('preserves version without treating it as manifest semver',()=>expect(parse(wrap('<customControl version="platform-value"/>'))[0]!.controls[0]!.attributes.version).toBe('platform-value'));
 it('does not manufacture parameter or component IDs',()=>expect(serialize(parse(wrap('<customControl/>')))).not.toContain('parameters'));
 it('returns no bindings for an ordinary form',()=>expect(parse('<form/>')).toEqual([]));
 it.each([
  '<controlDescriptions><controlDescription/></controlDescriptions>',
  '<form><controlDescriptions/><controlDescriptions/></form>',
  wrap('<customControl formFactor="web"/>'),
  wrap('<customControl><parameters/><parameters/></customControl>'),
  wrap('<customControl><unknown/></customControl>'),
  '<!DOCTYPE form><form/>',
  wrap('<customControl><parameters>'+ '<x>'.repeat(66)+'</x>'.repeat(66)+'</parameters></customControl>')
 ])('rejects malformed/unsafe/ambiguous observation %#',xml=>expect(()=>parse(xml)).toThrow());
 it('rejects contradictory host identity during serialization',()=>{const b=parse(fixture);b[0]!.forControl='changed';expect(()=>serialize(b)).toThrow('Conflicting forControl');});
});
