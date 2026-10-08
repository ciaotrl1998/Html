// ESM ignores NODE_PATH. Preserve the project's own dependency resolution first, then
// offer the APK's bundled ws package for otherwise dependency-free ESM game servers.
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (specifier !== 'ws' || error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return nextResolve(specifier, { ...context, parentURL: new URL('./prelude.js', import.meta.url).href });
  }
}
