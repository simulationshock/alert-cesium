import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function injectFirebaseConfig() {
  return {
    name: 'inject-firebase-config',
    transformIndexHtml(html) {
      const firebaseConfig = process.env.VITE_FIREBASE_CONFIG ?? 'null';
      const signalingUrl = process.env.VITE_SIGNALING_URL ?? 'null';
      return html.replace(
        '</head>',
        `<script>window.FIREBASE_CONFIG = ${firebaseConfig};window.SIGNALING_URL = ${signalingUrl ? JSON.stringify(signalingUrl) : 'null'};</script></head>`
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
