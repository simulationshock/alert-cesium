import { createServer } from 'node:https';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from 'selfsigned';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8443;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.wasm': 'application/wasm',
  '.map':  'application/json',
};

const PROXY_ALLOWED_ORIGIN = 'https://cameras.alertcalifornia.org/';

async function handleProxy(req, res) {
  const qs = new URL(req.url, 'https://localhost').searchParams;
  const target = qs.get('url');
  if (!target || !target.startsWith(PROXY_ALLOWED_ORIGIN)) {
    res.writeHead(400);
    res.end('Bad request: url must start with ' + PROXY_ALLOWED_ORIGIN);
    return;
  }
  try {
    const upstream = await fetch(target);
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    res.writeHead(upstream.status, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    const buf = await upstream.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (err) {
    res.writeHead(502);
    res.end('Proxy error: ' + err.message);
  }
}

function handler(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/proxy') {
    handleProxy(req, res);
    return;
  }

  const filePath = join(ROOT, urlPath === '/' ? '/web-demo' : urlPath);

  // Prevent path traversal outside project root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let resolvedPath = filePath;
  if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
    resolvedPath = join(resolvedPath, 'index.html');
  }

  if (!existsSync(resolvedPath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const contentType = MIME[extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(resolvedPath).pipe(res);
}

const pems = await generate(
  [{ name: 'commonName', value: 'localhost' }],
  { days: 365, keySize: 2048 }
);

createServer({ key: pems.private, cert: pems.cert }, handler).listen(PORT, () => {
  console.log(`HTTPS server: https://localhost:${PORT}/web-demo/`);
  console.log('Note: Accept the self-signed certificate warning in your browser.');
});
