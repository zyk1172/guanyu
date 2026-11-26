export function hasToolCallMarkup(text: string) {
  // DeepSeek-compatible gateways can expose these protocol tokens as plain text.
  return /<\s*\/?\s*[|｜]\s*[|｜]\s*DSML\s*[|｜]\s*[|｜]/.test(text);
}
