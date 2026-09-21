/* global window, document, innerWidth */
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const built = await build({ entryPoints: ['pcf/Timeline/Timeline/index.ts'], bundle: true, write: false, format: 'iife', globalName: 'PowerCanvasControl' });
const css = await readFile('pcf/Timeline/Timeline/css/Timeline.css', 'utf8');
const events = [ { id: 'opened', timestamp: '2026-09-18T08:00:00Z', actor: 'Test agent', kind: 'created', title: 'Complaint opened', description: 'Synthetic delivery complaint.' }, { id: 'escalated', timestamp: '2026-09-18T12:00:00Z', actor: 'PowerCanvas SLA worker', kind: 'escalated', title: 'SLA deadline reached', description: 'Four elapsed hours. Review the next action.', before: 'Active', after: 'Escalated' } ];
async function mount(page, theme = 'light', data = events) {
  await page.setContent('<html><head><style>body{margin:0;font-family:Arial,sans-serif}main{max-width:900px;margin:0 auto}button{font-family:inherit}</style></head><body><main id="control"></main><output aria-label="Selected event"></output></body></html>');
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: built.outputFiles[0].text });
  await page.evaluate(({ theme, data }) => {
    window.control = new window.PowerCanvasControl.Timeline();
    window.context = { parameters: { eventsJson: { raw: JSON.stringify(data) }, theme: { raw: theme } }, mode: { isControlDisabled: false, trackContainerResize: () => {} } };
    window.control.init(window.context, () => { document.querySelector('output').textContent = window.control.getOutputs().selectedEventId; }, {}, document.querySelector('#control'));
    window.control.updateView(window.context);
  }, { theme, data });
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) test(`timeline ${width} ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 }); await mount(page, theme);
  await expect(page.getByRole('heading', { name: 'Activity timeline' })).toBeVisible();
  await expect(page.locator('#control')).toHaveScreenshot(`timeline-${width}-${theme}.png`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('keyboard selection, retained focus, disabled state, safe text, errors and destroy', async ({ page }) => {
  await mount(page); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'SLA deadline reached' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByLabel('Selected event')).toHaveText('escalated');
  await page.evaluate(() => { window.context.parameters.theme.raw = 'dark'; window.control.updateView(window.context); });
  await expect(page.getByRole('button', { name: 'SLA deadline reached' })).toBeFocused();
  await page.evaluate(() => { window.context.mode.isControlDisabled = true; window.control.updateView(window.context); });
  await expect(page.getByRole('button', { name: 'SLA deadline reached' })).toBeDisabled();
  await mount(page, 'light', [{ ...events[0], title: '<img src=x onerror=alert(1)>' }]); await expect(page.locator('#control img')).toHaveCount(0);
  await page.evaluate(() => { window.context.parameters.eventsJson.raw = '{bad'; window.control.updateView(window.context); }); await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(() => window.control.destroy()); await expect(page.locator('#control')).toBeEmpty();
});
