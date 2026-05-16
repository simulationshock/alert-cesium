import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function injectFirebaseConfig() {
  return {
    name: 'inject-firebase-config',
    transformIndexHtml(html) {
      const config = process.env.VITE_FIREBASE_CONFIG ?? 'null';
      return html.replace(
        '</head>',
        `<script>window.FIREBASE_CONFIG = ${config};</script></head>`
      );
    },
  };
}

export default defineConfig({
  root: 'web-demo',
  base: process.env.VITE_BASE ?? '/alert-cesium/',
  plugins: [injectFirebaseConfig()],
  resolve: {
    alias: {
      cesium: resolve(__dirname, 'web-demo/cesium-esm-shim.js'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist-site'),
    emptyOutDir: true,
  },
});
