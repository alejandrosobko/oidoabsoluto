import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * Completa dist/sw.js con la lista de archivos a guardar para usar la app sin internet
 * y una versión que cambia con cada build distinto (así el teléfono baja la nueva).
 */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((path) => relative(outDir, path).split(sep).join('/'))
        .filter((path) => path !== 'sw.js' && !path.endsWith('.md'))
        .sort();
      const hash = createHash('sha256');
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      // index.html se pide como './': Cloudflare Pages redirige /index.html a /.
      const precache = files.map((file) => (file === 'index.html' ? './' : file));

      const swPath = join(outDir, 'sw.js');
      const source = readFileSync(swPath, 'utf8');
      const output = source
        .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('[] /* __PRECACHE__ */', JSON.stringify(precache));
      if (output.includes('__VERSION__') || output.includes('__PRECACHE__')) {
        throw new Error('No pude completar dist/sw.js: cambió el formato de public/sw.js');
      }
      writeFileSync(swPath, output);
    },
  };
}

export default defineConfig({
  // Rutas relativas: la app funciona servida desde cualquier carpeta (o GitHub Pages).
  base: './',
  plugins: [serviceWorker()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
