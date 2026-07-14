export function shouldBootstrapRuntimeSchema(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}
