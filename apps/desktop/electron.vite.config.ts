import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Workspace packages ship TypeScript source, so they are bundled rather than externalized.
const bundleWorkspace = { exclude: ['@nss/engine', '@nss/io', '@nss/data-forge'] };
// Electron and Node built-ins are provided by the runtime and must never be bundled.
const external = ['electron', /^node:/, /^electron\//];

export default defineConfig({
  main: {
    build: {
      externalizeDeps: bundleWorkspace,
      rollupOptions: {
        external,
        input: {
          index: resolve(import.meta.dirname, 'src/main/index.ts'),
          'engine-host': resolve(import.meta.dirname, 'src/engine-host/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: bundleWorkspace,
      rollupOptions: {
        external,
        input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    build: {
      rollupOptions: { input: { index: resolve(import.meta.dirname, 'src/renderer/index.html') } },
    },
    plugins: [react()],
  },
});
