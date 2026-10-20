import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Build the optional visual demo independently so its Three.js imports do not
// split the main game's startup bundle or change its network waterfall.
export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    manifest: '.vite/embarcadero-manifest.json',
    rollupOptions: {
      input: fileURLToPath(new URL('./experiments/embarcadero/index.html', import.meta.url)),
    },
  },
});
