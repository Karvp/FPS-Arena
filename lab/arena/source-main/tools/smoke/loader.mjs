import { pathToFileURL, fileURLToPath } from 'node:url'; import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), here = path.dirname(fileURLToPath(import.meta.url));
export async function resolve(spec, ctx, next) {
  if (spec === 'three' || spec.startsWith('three/')) return { url: pathToFileURL(path.join(here, 'three-stub.mjs')).href, shortCircuit: true };
  if (spec.startsWith('/shared/') || spec.startsWith('/maps/')) return { url: pathToFileURL(path.join(root, spec)).href, shortCircuit: true };
  if (ctx.parentURL && ctx.parentURL.includes('/client/') && /^\.\/(assets|weaponmodel)\.js$/.test(spec)) return { url: pathToFileURL(path.join(here, 'stubs.mjs')).href, shortCircuit: true };
  return next(spec, ctx);
}
