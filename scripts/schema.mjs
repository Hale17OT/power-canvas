import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { z } from 'zod';
import { projectSchema } from '../dist/ir/schema.js';
import { connectorSchema } from '../dist/connectors/compile.js';
import { canvasAppSchema } from '../dist/canvas/schema.js';
import { componentCatalog } from '../dist/canvas/registry.js';
import { themeSchema } from '../dist/canvas/tokens.js';
import { patternCatalog, patternRequestJsonSchema } from '../dist/canvas/patterns.js';
import { tasteSchema } from '../dist/canvas/taste/config.js';
import { recipes, recipeSchema } from '../dist/canvas/taste/registry.js';
import { compositions } from '../dist/canvas/taste/compositions.js';
import { productSchema, designSchema, referenceSchema } from '../dist/canvas/taste/memory.js';
import { critiqueInputSchema } from '../dist/canvas/taste/judgment.js';
import {flowResourcesSchema,deploymentSchema,workflowRecipeSchema} from '../dist/flows/schema.js';
import {recipeRegistry as workflowRecipeRegistry} from '../dist/flows/recipes.js';
import {actionRegistry} from '../dist/flows/registry.js';

await mkdir(new URL('../schemas/', import.meta.url), { recursive: true });
for(const [name,input]of [['powercanvas-flows.v3',flowResourcesSchema],['powercanvas-flow-deployment.v3',deploymentSchema],['powercanvas-workflow-recipe.v3',workflowRecipeSchema]])await writeFile(new URL(`../schemas/${name}.schema.json`,import.meta.url),JSON.stringify(z.toJSONSchema(input,{io:'input'}),null,2)+'\n');
await writeFile(new URL('../schemas/powercanvas-flow-actions.v3.json',import.meta.url),JSON.stringify(actionRegistry,null,2)+'\n');
await writeFile(new URL('../schemas/powercanvas-workflow-recipes.v3.json',import.meta.url),JSON.stringify(workflowRecipeRegistry,null,2)+'\n');
for (const [name, schema] of [['product', productSchema], ['design', designSchema], ['reference', referenceSchema], ['critique', critiqueInputSchema]]) await writeFile(new URL(`../schemas/powerapps-taste-${name}.v2.schema.json`, import.meta.url), JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2) + '\n');
const schema = z.toJSONSchema(projectSchema, { target: 'draft-2020-12', io: 'input' });
await writeFile(new URL('../schemas/powercanvas.v1alpha1.schema.json', import.meta.url), `${JSON.stringify({
  ...schema, $id: 'https://powercanvas.dev/schemas/v1alpha1', title: 'PowerCanvas v1alpha1 (offline specification)',
}, null, 2)}\n`);
for (const [name, input] of [['connector.v1alpha1', connectorSchema], ['canvas-app.v1alpha1', canvasAppSchema], ['pfds-theme.v1', themeSchema]]) {
  await writeFile(new URL(`../schemas/${name}.schema.json`, import.meta.url), `${JSON.stringify(z.toJSONSchema(input, { target: 'draft-2020-12', io: 'input' }), null, 2)}\n`);
}
await writeFile(new URL('../schemas/pfds-components.v0.1.json', import.meta.url), `${JSON.stringify(componentCatalog(), null, 2)}\n`);
await writeFile(new URL('../schemas/pfds-patterns.v0.2.json', import.meta.url), `${JSON.stringify(patternCatalog(), null, 2)}\n`);
await writeFile(new URL('../schemas/pfds-pattern-request.v0.2.schema.json', import.meta.url), `${JSON.stringify(patternRequestJsonSchema(), null, 2)}\n`);
await writeFile(new URL('../schemas/powerapps-taste.v1.schema.json', import.meta.url), JSON.stringify(z.toJSONSchema(tasteSchema, { io: 'input' }), null, 2) + '\n');
await writeFile(new URL('../schemas/powerapps-taste-recipe.v1.schema.json', import.meta.url), JSON.stringify(z.toJSONSchema(recipeSchema, { io: 'input' }), null, 2) + '\n');
await writeFile(new URL('../schemas/powerapps-taste-recipes.v1.json', import.meta.url), JSON.stringify(recipes(), null, 2) + '\n');
await writeFile(new URL('../schemas/powerapps-taste-compositions.v1.json', import.meta.url), JSON.stringify(compositions(), null, 2) + '\n');
