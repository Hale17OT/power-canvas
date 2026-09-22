/* global document, innerWidth, getComputedStyle */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve('output/design-v4');
const errors=new WeakMap();
test.beforeEach(async({page})=>{const list=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});
async function mount(page,path,width=1440,height=1000){await page.setViewportSize({width,height});await page.setContent(await readFile(resolve(root,path),'utf8'));}
const matrix=[
  ['operations-queue','desktop','light',1440],['executive-analytics','desktop','light',1440],['document-review','desktop','light',1440],['field-inspection','mobile','light',390],
  ['operations-queue','tablet','light',820],['document-review','mobile','dark',390],['executive-analytics','desktop','dark',1440],['field-inspection','mobile','dark',390],
];
for(const [product,device,theme,width]of matrix)test(`design V4 ${product} ${device} ${theme}`,async({page})=>{
  await mount(page,`${product}/${device}-${theme}/preview.html`,width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const tiny=await page.locator('button:visible').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height<44||!n.textContent.trim()).map(n=>n.id));expect(tiny).toEqual([]);
  await expect(page).toHaveScreenshot(`design-v4/${product}-${device}-${theme}.png`,{fullPage:true});
});
for(const direction of ['data-first','workspace-first','content-first'])test(`design V4 anonymous ${direction}`,async({page})=>{
  await mount(page,`directions/${direction}/structure.html`);
  await expect(page.locator('body')).toHaveClass(/anonymous/);
  await expect(page).toHaveScreenshot(`design-v4/anonymous-${direction}.png`,{fullPage:true});
});
test('preview sheet opens and closes with retained focus; no preview action contacts a tenant',async({page})=>{
  const network=[];page.on('request',r=>network.push(r.url()));await mount(page,'operations-queue/desktop-light/preview.html');
  await page.locator('[data-open]:visible').click();await expect(page.locator('.overlay')).toBeVisible();await expect(page.locator('.root')).toHaveAttribute('inert','');
  await page.keyboard.press('Escape');await expect(page.locator('.overlay')).toBeHidden();await expect(page.locator('[data-open]:visible')).toBeFocused();expect(network).toEqual([]);
});
test('same candidate switches navigation at a mobile viewport without another app or data model',async({page})=>{
  await mount(page,'executive-analytics/desktop-light/preview.html',1440);await expect(page.locator('#pc_navigation')).toBeVisible();
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#pc_navigation')).toBeHidden();await expect(page.locator('[data-drawer]')).toBeVisible();await page.locator('[data-drawer]').click();await expect(page.locator('#pc_mobileNavigation')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('preview palette has readable body text in both themes',async({page})=>{
  for(const theme of ['light','dark']){await mount(page,`executive-analytics/desktop-${theme}/preview.html`);const colors=await page.evaluate(()=>({fg:getComputedStyle(document.body).color,bg:getComputedStyle(document.body).backgroundColor}));
    const luminance=color=>{const rgb=color.match(/\d+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};const a=luminance(colors.fg),b=luminance(colors.bg);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThan(4.5);
  }
});

for(const [product,device,width] of [['operations-queue','desktop',1440],['executive-analytics','desktop',1440],['document-review','desktop',1440],['field-inspection','mobile',390]])test(`anonymous product structure ${product}`,async({page})=>{
  await mount(page,`${product}/${device}-light/structure.html`,width);
  await expect(page.locator('h1')).toHaveText('Application');
  await expect(page).toHaveScreenshot(`design-v4/structure-${product}.png`,{fullPage:true});
});
test('mobile wizard shows one full field, reachable dock and reversible steps',async({page})=>{
  await mount(page,'field-inspection/mobile-light/preview.html',390,844);
  await expect(page.locator('[data-field]:visible')).toHaveCount(1);
  await page.locator('[data-next]').click();await expect(page.locator('[data-field="1"]')).toBeVisible();await expect(page.locator('[data-field="0"]')).toBeHidden();
  await page.locator('[data-back]').click();await expect(page.locator('[data-field="0"]')).toBeVisible();
  const dock=await page.locator('.task-dock').boundingBox();expect(dock.y+dock.height).toBeLessThanOrEqual(844);
  await page.locator('[data-open]:visible').click();await expect(page.locator('.overlay')).toBeVisible();await page.locator('[data-close]:visible').click();await expect(page.locator('[data-open]:visible')).toBeFocused();
});

test('the same operational source changes from sidebar to tablet drawer',async({page})=>{
  await mount(page,'operations-queue/desktop-light/preview.html',1440);await expect(page.locator('#pc_navigation')).toBeVisible();
  await page.setViewportSize({width:820,height:1000});await expect(page.locator('#pc_navigation')).toBeHidden();
  await page.locator('[data-drawer]').click();await expect(page.locator('#pc_tabletNavigation')).toBeVisible();
  await page.locator('[data-close]:visible').click();await expect(page.locator('[data-drawer]')).toBeFocused();
});
