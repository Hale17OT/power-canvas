import { z } from 'zod';
import { control, text, stack, fxText, type Control } from './patterns.js';

export const fieldTypes=['text','multiline','number','currency','percentage','email','phone','url','boolean','toggle','singleChoice','multiChoice','date','datetime','lookup','person'] as const;
const fx=z.string().min(1).max(20000);
export const validationRuleSchema=z.discriminatedUnion('rule',[
  z.strictObject({rule:z.literal('range'),min:z.number().optional(),max:z.number().optional(),message:z.string()}),
  z.strictObject({rule:z.literal('length'),min:z.number().int().nonnegative().optional(),max:z.number().int().positive().optional(),message:z.string()}),
  z.strictObject({rule:z.literal('date'),after:z.iso.date().optional(),before:z.iso.date().optional(),message:z.string()}),
  z.strictObject({rule:z.literal('predicate'),expression:fx,message:z.string()}),
]);
export const formFieldSchema=z.strictObject({id:z.string().regex(/^[A-Za-z_]\w*$/).optional(),label:z.string().min(1),type:z.enum(fieldTypes).default('text'),value:fx,onChange:fx,required:z.boolean().default(false),readOnly:z.boolean().default(false),disabled:fx.default('false'),helpText:z.string().default(''),items:fx.optional(),timeZone:z.enum(['UTC','Local']).optional(),currencyCode:z.string().regex(/^[A-Z]{3}$/).optional(),validation:z.array(validationRuleSchema).max(12).default([]),sourceBinding:z.strictObject({table:z.string(),column:z.string(),dataType:z.string()}).optional()});
export type FormFieldIR=z.infer<typeof formFieldSchema>;
export const fieldControlMapping:Record<FormFieldIR['type'],string>={text:'TextInput',multiline:'TextInput',number:'NumberInput',currency:'NumberInput',percentage:'NumberInput',email:'TextInput',phone:'TextInput',url:'TextInput',boolean:'CheckBox',toggle:'Toggle',singleChoice:'ComboBox',multiChoice:'ComboBox',date:'DatePicker',datetime:'DatePicker+NumberInput',lookup:'ComboBox',person:'ComboBox'};
/** Bounded custom Power Fx: value placeholder, constants and a read-only function allowlist. No arbitrary behaviors. */
export function safeFieldPredicate(expression:string,value:string) {
  const stripped=expression.replace(/"(?:""|[^"])*"/g,'""').replaceAll('{value}','fieldValue');
  if(/[;{}!']|\/\/|\/\*|\.(?!\d)/.test(stripped)||stripped.replaceAll('""','').includes('"'))throw new Error('Custom validation permits only a bounded read-only value predicate');
  const allowed=new Set(['fieldValue','true','false','And','Or','Not','IsBlank','IsMatch','Len','Trim','Lower','Upper','IsNumeric','Abs']);
  for(const token of stripped.match(/[A-Za-z_]\w*/g)??[])if(!allowed.has(token))throw new Error('Unsupported validation identifier: '+token);
  return expression.replaceAll('{value}',`(${value})`);
}
export function mapDataverseField(metadata:{type:string;format?:string;targets?:string[]}) {
  const type=metadata.type.toLowerCase();
  const types:Record<string,FormFieldIR['type']>={string:'text',text:'text',memo:'multiline',multilinetext:'multiline',integer:'number',bigint:'number',decimal:'number',double:'number',money:'currency',boolean:'boolean',picklist:'singleChoice',choice:'singleChoice',multiselectpicklist:'multiChoice',date:'date'};
  if(type==='lookup'||type==='owner'){if(!metadata.targets?.length)throw new Error('Lookup target metadata required');return metadata.targets.length===1&&metadata.targets[0]==='systemuser'?'person':'lookup';}
  if(type==='datetime')return metadata.format==='DateOnly'?'date':'datetime';
  if(type==='string'||type==='text'){const format=metadata.format?.toLowerCase();if(format&&['email','phone','url'].includes(format))return format as FormFieldIR['type'];}
  const result=types[type];if(!result)throw new Error('Unsupported Dataverse input type: '+metadata.type);return result;
}
export function compileField(name:string,raw:unknown,showErrors='pc_validationAttempted') {
  const field=formFieldSchema.parse(raw),kind=fieldControlMapping[field.type],inputName=name+'_input';
  const numeric=['number','currency','percentage'].includes(field.type),choice=['singleChoice','multiChoice','lookup','person'].includes(field.type),date=['date','datetime'].includes(field.type),boolean=['boolean','toggle'].includes(field.type);
  if(choice&&!field.items)throw new Error(field.type+' requires a typed record table; display-name inference is forbidden');
  if(field.type==='datetime'&&!field.timeZone)throw new Error('datetime requires an explicit UTC/Local contract');
  if(field.type==='currency'&&!field.currencyCode)throw new Error('currency requires an explicit currencyCode');
  const value=field.type==='datetime'?`If(IsBlank(${inputName}.SelectedDate), Blank(), ${inputName}.SelectedDate + Time(${name}_hours.Value, ${name}_minutes.Value, 0))`:date?`${inputName}.SelectedDate`:boolean?`${inputName}.Checked`:choice?`${inputName}.${field.type==='multiChoice'?'SelectedItems':'Selected'}`:`${inputName}.Value`;
  const rules:{invalid:string;message:string}[]=[];
  if(field.required)rules.push({invalid:field.type==='multiChoice'?`IsEmpty(${value})`:`IsBlank(${value})`,message:field.label+' is required.'});
  if(field.type==='email')rules.push({invalid:`!IsBlank(${value}) && !IsMatch(${value}, "[^@\\s]+@[^@\\s]+\\.[^@\\s]+")`,message:'Enter a valid email address.'});
  if(field.type==='url')rules.push({invalid:`!IsBlank(${value}) && !IsMatch(${value}, "https?://[^\\s]+")`,message:'Enter an HTTP or HTTPS URL.'});
  if(field.type==='phone')rules.push({invalid:`!IsBlank(${value}) && !IsMatch(${value}, "[+0-9 ()-]{3,32}")`,message:'Enter a valid phone number.'});
  if(field.type==='percentage')rules.push({invalid:`!IsBlank(${value}) && (${value} < 0 || ${value} > 100)`,message:'Enter a percentage from 0 to 100.'});
  for(const r of field.validation){
    if(r.rule==='range'&&!numeric||r.rule==='length'&&(numeric||date||boolean||choice)||r.rule==='date'&&!date)throw new Error('Validation rule is incompatible with '+field.type);
    if(('min'in r&&r.min!==undefined&&r.max!==undefined&&r.min>r.max)||r.rule==='date'&&r.after&&r.before&&r.after>r.before)throw new Error('Invalid validation bounds');
    const checks=r.rule==='range'?[r.min===undefined?'false':`${value} < ${r.min}`,r.max===undefined?'false':`${value} > ${r.max}`]:r.rule==='length'?[r.min===undefined?'false':`Len(${value}) < ${r.min}`,r.max===undefined?'false':`Len(${value}) > ${r.max}`]:r.rule==='date'?[r.after?`${value} < DateValue(${fxText(r.after)}, "en-US")`:'false',r.before?`${value} > DateValue(${fxText(r.before)}, "en-US")`:'false']:[`!(${safeFieldPredicate(r.expression,value)})`];
    rules.push({invalid:`!IsBlank(${date?`${inputName}.SelectedDate`:value}) && (${checks.join(' || ')})`,message:r.message});
  }
  const invalid=rules.map(r=>'('+r.invalid+')').join(' || ')||'false';
  const common={AccessibleLabel:'='+fxText(field.label+(field.required?' (required)':'')),DisplayMode:`=If(${field.disabled}, DisplayMode.Disabled, ${field.readOnly?'DisplayMode.View':'DisplayMode.Edit'})`,Width:'=Parent.Width',Height:field.type==='multiline'?'=104':'=44',BasePaletteColor:'=PF_brand'};
  const enumName=numeric?'NumberInput':choice?'ComboboxCanvas':date?'DatePickerCanvas':'TextInputCanvas';
  const props={...common,...(!boolean?{ValidationState:`=If(${showErrors} && (${invalid}), '${enumName}.ValidationState'.Error, '${enumName}.ValidationState'.None)`}:{})};
  let input:Control;
  if(boolean)input=control(inputName,kind,{...props,FontColor:'=PF_text',Font:'=PF_font',Label:'='+fxText(field.label),Checked:'='+field.value,OnCheck:'='+field.onChange,OnUncheck:'='+field.onChange});
  else if(numeric)input=control(inputName,kind,{...props,Value:'='+field.value,OnChange:'='+field.onChange,...(field.type==='percentage'?{Min:'=0',Max:'=100'}:{})});
  else if(choice)input=control(inputName,kind,{...props,Items:'='+field.items,DefaultSelectedItems:'='+field.value,SelectMultiple:'='+(field.type==='multiChoice'),IsSearchable:'=true',Required:'='+field.required,OnChange:'='+field.onChange});
  // Date Only is a calendar date. UTC display conversion can show the preceding day while its output remains unchanged.
  else if(date)input=control(inputName,'DatePicker',{...props,SelectedDate:'='+field.value,DateTimeZone:`='DatePickerCanvas.DateTimeZone'.${field.type==='date'?'Local':field.timeZone!}`,OnChange:'='+field.onChange});
  else input=control(inputName,'TextInput',{...props,Value:'='+field.value,OnChange:'='+field.onChange,Required:'='+field.required,Mode:`='TextInputCanvas.Mode'.${field.type==='multiline'?'Multiline':'SingleLine'}`});
  const times=field.type==='datetime'?['hours','minutes'].map((part,i)=>control(`${name}_${part}`,'NumberInput',{...common,AccessibleLabel:'='+fxText(field.label+' '+part),Value:`=${i?'Minute':'Hour'}(${field.value})`,Min:'=0',Max:i?'=59':'=23',OnChange:'='+field.onChange})):[];
  const error=rules.length?`If(${rules.map(r=>`${r.invalid}, ${fxText(r.message)}`).join(', ')}, "")`:'""';
  return {field,value,invalid,error,control:stack(name,[text(name+'_label',fxText(field.label+(field.currencyCode?' ('+field.currencyCode+')':'')+(field.type==='percentage'?' (%)':'')+(field.required?' *':''))),input,...times,...(field.helpText.trim()?[text(name+'_help',fxText(field.helpText))]:[]),text(name+'_error',error,{Visible:`=${showErrors} && (${invalid})`,Color:'=PF_danger',AutoHeight:'=true'})],{Height:field.type==='datetime'?'=256':field.type==='multiline'?'=224':'=164'}),evidence:{control:kind,maturity:'IMPLEMENTED',nativeValidated:false,limitations:['Native focus/keyboard and data binding certification pending',...(field.type==='email'||field.type==='phone'?['Text input with explicit validation; no native email/phone keyboard claim']:[])]}};
}
export function validationSummary(name:string,fields:ReturnType<typeof compileField>[],visible:string) {
  return stack(name,[text(name+'_heading','"Correct the following fields"',{FontWeight:'=FontWeight.Semibold'}),...fields.map((f,i)=>text(name+'_'+i,fxText(f.field.label+': ')+' & '+f.error,{Visible:`=(${visible}) && (${f.invalid})`,AutoHeight:'=true',Color:'=PF_danger'}))],{Visible:`=(${visible}) && (${fields.map(f=>'('+f.invalid+')').join(' || ')||'false'})`,Height:`=${40+fields.length*36}`});
}
