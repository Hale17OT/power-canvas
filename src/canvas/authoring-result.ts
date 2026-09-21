/** Some official MCP validation failures arrive with isError=false. Inspect the explicit validation verdict. */
export function compileSucceeded(result: { isError?: boolean; content?: { type: string; text?: string }[] }): boolean {
  const text = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
  return !result.isError && /Validation PASSED/.test(text) && !/Validation FAILED|\berror:/i.test(text);
}
