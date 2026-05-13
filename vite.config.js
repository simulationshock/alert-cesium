import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'web-demo',
  base: '/alert-cesium/',
  resolve: {
    alias: {
      // Redirect ESM `import ... from 'cesium'` to the shim that reads window.Cesium
      cesium: resolve(__dirname, 'web-demo/cesium-esm-shim.js'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist-site'),
    emptyOutDir: true,
  },
});
