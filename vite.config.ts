import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Rutas relativas: la app funciona servida desde cualquier carpeta (o GitHub Pages).
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
