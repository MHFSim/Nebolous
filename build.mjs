import { build } from 'esbuild';
import fs from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !process.argv.includes('--dev'),
  target: 'es2019',
  write: false,
});
const js = res.outputFiles[0].text;
const peer = fs.readFileSync('node_modules/peerjs/dist/peerjs.min.js', 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
const css = fs.readFileSync('src/style.css', 'utf8');
let html = fs.readFileSync('src/index.html', 'utf8');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
html = html
  .replace('/*CSS*/', () => css)
  .replace('/*PEER*/', () => esc(peer))
  .replace('/*APP*/', () => esc(js));
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'icon.svg']) fs.copyFileSync('src/pwa/' + f, 'dist/' + f);
fs.writeFileSync('dist/sw.js', fs.readFileSync('src/pwa/sw.js', 'utf8').replace('__BUILD__', Date.now().toString(36)));
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
