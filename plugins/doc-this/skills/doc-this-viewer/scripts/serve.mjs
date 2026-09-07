#!/usr/bin/env node
// Localhost-only static file server for the doc-this viewer. Zero-dependency Node.
//
// Rooted at the project directory so the prebuilt SPA (served from
// `.doc-this/viewer/index.html`) can fetch the doc-this output trees by absolute,
// same-origin paths — which sidesteps Chrome's block on `fetch()` over `file://`.
//
// Binds 127.0.0.1 only, picks a free port (tries 8787-8789, then an OS-assigned one),
// sends `Cache-Control: no-store` so a re-run of doc-this shows up on refresh, and writes
// the chosen port + its pid to small files so the launcher can report the URL and stop it.
//
// Usage: serve.mjs --root DIR [--bind 127.0.0.1] [--portfile PATH] [--pidfile PATH]
import { createServer } from 'node:http';
import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';

const PREFERRED_PORTS = [8787, 8788, 8789, 0];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.feature': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function parseArgs(argv) {
  const out = { root: null, bind: '127.0.0.1', portfile: null, pidfile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in out)) {
      process.stderr.write(`error: unknown argument: ${argv[i]}\n`);
      process.exit(2);
    }
    i += 1;
    if (i >= argv.length) {
      process.stderr.write(`error: ${argv[i - 1]} needs a value\n`);
      process.exit(2);
    }
    out[key] = argv[i];
  }
  return out;
}

function safePath(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); }
  catch { return null; }
  const parts = [];
  for (const seg of decoded.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  const target = join(root, ...parts);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root) {
    process.stderr.write('usage: serve.mjs --root DIR [--bind ADDR] [--portfile PATH] [--pidfile PATH]\n');
    return 2;
  }
  const root = resolve(args.root);
  try {
    if (!statSync(root).isDirectory()) throw new Error('not a dir');
  } catch {
    process.stderr.write(`error: not a directory: ${root}\n`);
    return 1;
  }

  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let target = safePath(root, req.url || '/');
    if (target === null) { res.writeHead(403).end(); return; }
    let info;
    try { info = statSync(target); } catch { res.writeHead(404).end(); return; }
    if (info.isDirectory()) {
      target = join(target, 'index.html');
      try { info = statSync(target); } catch { res.writeHead(404).end(); return; }
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(target).on('error', () => res.destroy()).pipe(res);
  });

  const listen = (index) => {
    if (index >= PREFERRED_PORTS.length) {
      process.stderr.write('error: could not bind any port\n');
      process.exit(1);
    }
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') listen(index + 1);
      else { process.stderr.write(`error: ${err.message}\n`); process.exit(1); }
    });
    server.listen(PREFERRED_PORTS[index], args.bind, () => {
      const port = server.address().port;
      if (args.portfile) writeFileSync(args.portfile, String(port), 'utf8');
      if (args.pidfile) writeFileSync(args.pidfile, String(process.pid), 'utf8');
      process.stdout.write(`serving ${root} on http://${args.bind}:${port}\n`);
    });
  };
  listen(0);

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { server.close(); process.exit(0); });
  }
  return 0;
}

const rc = main();
if (rc) process.exit(rc);
