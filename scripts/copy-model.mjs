// Copia el modelo de Basic Pitch (Apache 2.0, Spotify) desde node_modules a public/model,
// para servirlo como archivo estático sin versionarlo en el repo.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@spotify', 'basic-pitch', 'model');
const target = join(root, 'public', 'model');

if (!existsSync(source)) {
  console.error(`No encontré el modelo en ${source}. ¿Corriste npm install?`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log('Modelo de Basic Pitch copiado a public/model');
