#!/usr/bin/env node
// doc-this-viewer launcher — frozen invocation path (the skill never assembles the
// server command itself; it calls this script).
//
// Builds the viewer manifest, copies the prebuilt Svelte app into .doc-this/viewer/,
// starts a localhost-only static server in the background, and opens the browser.
// Strictly read-only against the project except for .doc-this/viewer/**.
//
// Usage:
//   launch.mjs [PROJECT_ROOT]     start the viewer (default root: cwd)
//   launch.mjs --stop [ROOT]      stop a viewer started here (reads the pidfile)
//   launch.mjs --no-open [ROOT]   start without opening the browser
//   launch.mjs --port N [ROOT]    (reserved — server auto-picks a free port; honored if free)
//
// Output contract: prints a single  VIEWER_URL=...  line on success.

import { existsSync, mkdirSync, cpSync, readFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(SCRIPT_DIR, '..');
const DIST_DIR = join(SKILL_DIR, 'assets', 'dist');
const BUILD_MANIFEST = join(SCRIPT_DIR, 'build-manifest.mjs');
const SERVE_JS = join(SCRIPT_DIR, 'serve.mjs');

const HELP = `doc-this-viewer launcher

Usage:
  launch.mjs [PROJECT_ROOT]     start the viewer (default root: cwd)
  launch.mjs --stop [ROOT]      stop a viewer started here (reads the pidfile)
  launch.mjs --no-open [ROOT]   start without opening the browser
  launch.mjs --port N [ROOT]    (reserved — server auto-picks a free port; honored if free)

Prints a single  VIEWER_URL=...  line on success.`;

const die = (msg, code = 1) => { process.stderr.write(msg + '\n'); process.exit(code); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  let noOpen = false, doStop = false, root = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stop') doStop = true;
    else if (a === '--no-open') noOpen = true;
    else if (a === '--port') i++;              // reserved; server self-selects a free port
    else if (a === '-h' || a === '--help') { process.stdout.write(HELP + '\n'); process.exit(0); }
    else if (!root) root = a;
  }
  return { noOpen, doStop, root };
}

export function browserOpenCommand(platform, url) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] };
  return { command: 'xdg-open', args: [url] };
}

function openBrowser(url) {
  const { command, args } = browserOpenCommand(process.platform, url);
  try {
    spawnSync(command, args, { stdio: 'ignore' });
  } catch { /* best effort */ }
}

function killPid(pid) {
  try { process.kill(pid); return true; } catch { return false; }
}

async function main() {
  const { noOpen, doStop, root: rootArg } = parseArgs(process.argv.slice(2));

  let root = rootArg || process.cwd();
  try {
    if (!statSync(root).isDirectory()) die(`error: not a directory: ${root}`);
  } catch {
    die(`error: not a directory: ${root}`);
  }
  root = resolve(root);

  const viewerDir = join(root, '.doc-this', 'viewer');
  const pidfile = join(viewerDir, 'serve.pid');
  const portfile = join(viewerDir, 'serve.port');
  const logfile = join(viewerDir, 'serve.log');

  if (doStop) {
    if (existsSync(pidfile)) {
      const pid = Number(readFileSync(pidfile, 'utf8').trim());
      if (pid && killPid(pid)) process.stdout.write(`stopped doc-this viewer (pid ${pid})\n`);
      else process.stdout.write(`no running viewer for pid ${pid || '?'} (already stopped?)\n`);
      rmSync(pidfile, { force: true });
      rmSync(portfile, { force: true });
    } else {
      process.stdout.write(`no viewer pidfile at ${pidfile} — nothing to stop\n`);
    }
    return 0;
  }

  if (!existsSync(join(DIST_DIR, 'index.html'))) {
    process.stderr.write(`error: prebuilt viewer missing at ${join(DIST_DIR, 'index.html')}\n`);
    process.stderr.write(`  Run ${join(SCRIPT_DIR, 'build.mjs')} to compile the Svelte app, then retry.\n`);
    return 1;
  }

  mkdirSync(viewerDir, { recursive: true });

  // Build the manifest — also the existence check: exit 2 = no doc-this output.
  const built = spawnSync(process.execPath, [BUILD_MANIFEST, root], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (built.status !== 0) {
    if (built.status === 2) {
      process.stderr.write(`No doc-this output found in ${root}.\n`);
      process.stderr.write('Run /doc-this first, or point at a project that has .doc-this-sdd/ or docs/.\n');
    }
    return built.status ?? 1;
  }

  // Copy the prebuilt app into the served scratch dir, preserving the manifest just written.
  try {
    cpSync(DIST_DIR, viewerDir, { recursive: true, force: true });
  } catch {
    process.stderr.write(`error: failed to copy viewer assets into ${viewerDir}\n`);
    return 1;
  }

  // Single instance per project: stop any previous server first.
  if (existsSync(pidfile)) {
    const oldpid = Number(readFileSync(pidfile, 'utf8').trim());
    if (oldpid) killPid(oldpid);
  }
  rmSync(portfile, { force: true });

  const logfd = openSync(logfile, 'a');
  const child = spawn(
    process.execPath,
    [SERVE_JS, '--root', root, '--bind', '127.0.0.1', '--portfile', portfile, '--pidfile', pidfile],
    { detached: true, stdio: ['ignore', logfd, logfd] },
  );
  child.unref();
  closeSync(logfd);

  // Wait for the server to publish its port (max ~5s).
  let port = '';
  for (let i = 0; i < 50 && !port; i++) {
    await sleep(100);
    try {
      const v = readFileSync(portfile, 'utf8').trim();
      if (v) port = v;
    } catch { /* not written yet */ }
  }

  if (!port) {
    process.stderr.write(`error: viewer server did not start. See ${logfile}\n`);
    return 1;
  }

  const url = `http://127.0.0.1:${port}/.doc-this/viewer/index.html`;
  process.stdout.write(`VIEWER_URL=${url}\n`);
  process.stdout.write(`Stop it with: ${process.argv[1]} --stop\n`);

  if (!noOpen) openBrowser(url);
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`error: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
