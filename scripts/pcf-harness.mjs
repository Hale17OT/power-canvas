/* global window, document */
import {chromium} from '@playwright/test';
import {join} from 'node:path';
import assert from 'node:assert/strict';

// Equivalent local lifecycle harness: runs the Microsoft-built bundle with an explicit fake host.
// No Dataverse, authoring session, authentication or Power Apps runtime is involved.
export async function runPCFHarness(output,entries){
 const browser=await chromium.launch({headless:true});const tests=[];const accessibility=[];
 try{for(const [key]of entries){for(const width of [360,768,1280]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html lang="en"><title>PCF local lifecycle harness</title><body><main id="host"></main></body></html>');
  const artifact=join(output,'build-1',key,'out/controls',key);await page.addStyleTag({path:join(artifact,'style.css')});await page.addScriptTag({path:join(artifact,'bundle.js')});
  await page.evaluate(({key,width})=>{
   window.calls={notify:0,resize:0,refresh:0,next:0,previous:0,selected:[]};
   const date=new Date().toISOString();const row={getFormattedValue:name=>name==='title'?'Sample record':'Active',getValue:name=>name==='date'?date:'Sample record'};
   const dataset={loading:false,error:false,sortedRecordIds:['record-1'],records:{'record-1':row},columns:[{name:'title',displayName:'Title'},{name:'status',displayName:'Status'}],sorting:[],getSelectedRecordIds:()=>window.calls.selected,setSelectedRecordIds:ids=>{window.calls.selected=ids;},refresh:()=>{window.calls.refresh++;},paging:{hasPreviousPage:true,hasNextPage:true,loadNextPage:()=>window.calls.next++,loadPreviousPage:()=>window.calls.previous++}};
   window.context={parameters:{value:{raw:'#145C4F'},theme:{raw:'light'},readOnly:{raw:false},records:dataset},mode:{allocatedWidth:width-16,isControlDisabled:false,trackContainerResize:()=>{window.calls.resize++;}}};
   window.control=new window.PowerCanvas[key]();window.control.init(window.context,()=>{window.calls.notify++;},{},document.querySelector('#host'));
  },{key,width});
  assert.equal(await page.evaluate(()=>window.calls.resize),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  if(key==='ColorContrastField'){
   await page.getByLabel('Color (six-digit hex)').fill('#FFFFFF');assert.equal(await page.evaluate(()=>window.control.getOutputs().value),'#FFFFFF');assert.equal(await page.evaluate(()=>window.calls.notify),1);await page.evaluate(()=>{window.context.parameters.value.raw=window.control.getOutputs().value;window.control.updateView(window.context);});assert.equal(await page.getByLabel('Color (six-digit hex)').evaluate(el=>el===document.activeElement),true);
   await page.getByLabel('Color (six-digit hex)').fill('invalid');assert.equal(await page.getByLabel('Color (six-digit hex)').getAttribute('aria-invalid'),'true');assert.equal(await page.evaluate(()=>window.calls.notify),1);
  }else{
   await page.getByRole('button',{name:key==='AdvancedDataGrid'?'Select Sample record':'Sample record',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.calls.selected),['record-1']);
   if(key==='AdvancedDataGrid'){await page.getByRole('button',{name:'Title',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.refresh),1);await page.getByRole('button',{name:'Next page'}).click();await page.getByRole('button',{name:'Previous page'}).click();assert.equal(await page.evaluate(()=>window.calls.next+window.calls.previous),2);await page.getByLabel('Width: Title').fill('240');}
   else {await page.getByRole('button',{name:'Next month'}).click();assert.equal(await page.getByRole('status').innerText(),'No records in this month.');await page.getByRole('button',{name:'Previous month'}).click();}
   for(const state of ['loading','error','empty']){await page.evaluate(state=>{const d=window.context.parameters.records;d.loading=state==='loading';d.error=state==='error';d.sortedRecordIds=state==='empty'?[]:['record-1'];window.control.updateView(window.context);},state);assert.equal(await page.getByRole(state==='error'?'alert':'status').count(),1);}
  }
  await page.evaluate(()=>{const c=window.context;c.mode.allocatedWidth=300;c.mode.isControlDisabled=true;c.parameters.theme.raw='dark';c.parameters.records.loading=false;c.parameters.records.error=false;c.parameters.records.sortedRecordIds=['record-1'];window.control.updateView(c);});
  if(key==='ColorContrastField')assert.equal(await page.getByLabel('Color (six-digit hex)').isDisabled(),true);else assert.equal(await page.getByRole('button',{name:key==='AdvancedDataGrid'?'Select Sample record':'Sample record',exact:true}).isDisabled(),true);
  const a11y=await page.evaluate(()=>({unlabelledInputs:[...document.querySelectorAll('input')].filter(i=>!i.closest('label')&&!i.getAttribute('aria-label')).length,unnamedButtons:[...document.querySelectorAll('button')].filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')).length,unsafeHTML:!!document.querySelector('script[src^="http"]'),reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches}));
  assert.equal(a11y.unlabelledInputs,0);assert.equal(a11y.unnamedButtons,0);assert.equal(a11y.unsafeHTML,false);assert.equal(a11y.reducedMotion,true);accessibility.push({key,width,...a11y});
  await page.evaluate(()=>{window.context.mode.isControlDisabled=false;window.control.updateView(window.context);});await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true);
  await page.screenshot({path:join(output,key+'-'+width+'.png'),fullPage:true});await page.evaluate(()=>window.control.destroy());assert.equal(await page.locator('.pcf-provider').count(),0);tests.push({key,width,passed:true,lifecycle:['init','updateView','resize','destroy'],states:key==='ColorContrastField'?['normal','invalid','disabled','dark']:['normal','loading','empty','error','disabled','dark']});await page.close();
 }}return {passed:true,classification:'LOCAL_RUNTIME_VERIFIED',host:'Repository equivalent lifecycle harness with mock dataset API',tests,accessibility,limitations:['No Power Apps host, delegation, production virtualization or cross-browser host proof.','Automated labels/keyboard/reduced-motion checks do not replace manual assistive technology testing.']};}finally{await browser.close();}
}
