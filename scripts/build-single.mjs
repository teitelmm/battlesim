// Packs the Vite build (dist/) into one standalone BattleSim.html at the repo root, with
// all CSS and JS inlined. That file opens straight from disk (double-click, or `start`
// from a terminal) without Node.js or a web server.
//
//   npm run build:single
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const html = readFileSync(`${dist}/index.html`, 'utf8');

const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/);
const jsMatch = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
if (!cssMatch || !jsMatch) throw new Error('Could not find the built CSS/JS in dist/index.html. Run `vite build` first.');

const css = readFileSync(`${dist}/${cssMatch[1]}`, 'utf8');
// A literal "</script" inside the bundle would end the inline script early.
const js = readFileSync(`${dist}/${jsMatch[1]}`, 'utf8').replace(/<\/script/gi, '<\\/script');
if (/\bimport\s*\(/.test(js)) throw new Error('Bundle has dynamic imports; it would not run as a single file.');

const out = html
  .replace(cssMatch[0], () => `<style>\n${css}\n</style>`)
  .replace(jsMatch[0], '')
  .replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`);

writeFileSync(`${root}BattleSim.html`, out);
console.log(`Wrote BattleSim.html (${(out.length / 1024).toFixed(0)} KB)`);
