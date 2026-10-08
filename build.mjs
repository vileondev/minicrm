import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/fonts', { recursive: true });
await build({
  entryPoints: { content: 'src/content/index.ts' },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome110',
  loader: { '.svg': 'text' }, // ícones Phosphor entram no bundle como string
});
cpSync('manifest.json', 'dist/manifest.json');
if (existsSync('public')) cpSync('public', 'dist', { recursive: true });
console.log('Build OK -> dist/');
