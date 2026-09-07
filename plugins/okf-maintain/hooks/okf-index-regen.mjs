#!/usr/bin/env node
// okf-index-regen.mjs — regenerate a bundle's index.md files when a document under it changes.
//
// A generated projection that is only refreshed by hand goes stale the first time somebody
// forgets, and nothing reports it until `coverage` runs. This makes every OKF repository a
// mechanical client of the generator instead of a manual one (FR-OKF-6).
//
// PostToolUse Write|Edit. Zero dependencies: node:fs, node:path, node:child_process, node:url,
// plus the generator core it is a client of. `git` is the one executable a runtime hook may
// spawn (ADR-014), and it is spawned with an argv array, never through a shell.
//
// Fail-open by construction: every path emits `{}` and exits 0. A hook that can block an edit
// because an index could not be written would trade a stale projection for a stuck session.

import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  OKF_VERSION, cmdIndex, declaredOkfVersion, ignoredFile, readIgnores,
} from '../skills/okf-maintain/scripts/okf.mjs';

const MANIFESTS = [join('docs', 'okf.yaml'), 'okf.yaml'];

async function readInput() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

// The repository the EDITED FILE lives in, never the one the session happens to sit in.
//
// A cwd default is how an Edit aimed into a linked worktree or a submodule rewrites the session
// repository's indexes while the edited repository's stay stale — the wrong tree written, the
// right one untouched, and no error either side. So git is asked from the file's own directory
// and the answer is only accepted if the file is inside it.
// git answers with a path it has resolved through every symlink; the payload's file_path has
// not been. On macOS that alone is the whole difference between /var and /private/var, and the
// containment test below would read a file inside the repository as outside it and refuse.
function realOf(path) {
  try { return realpathSync(path); } catch { /* the file may not exist yet */ }
  try { return join(realpathSync(dirname(path)), path.slice(path.lastIndexOf(sep) + 1)); } catch { return path; }
}

export function repoRootFor(filePath) {
  let out;
  try {
    out = execFileSync('git', ['-C', dirname(filePath), 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
  const root = resolve(out.trim());
  if (!root) return null;
  const rel = relative(root, realOf(filePath));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  return root;
}

const relFrom = (root, path) => relative(root, path).split(sep).join('/');

const higher = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

// [shouldRun, reason]. Pure, so the acceptance matrix can assert every refusal without a
// git work tree or a hook payload for each one.
export function decide(root, filePath) {
  if (!root) return [false, 'the edited file is not inside a git work tree'];
  if (!filePath.endsWith('.md')) return [false, 'not a markdown document'];
  if (!MANIFESTS.some((m) => existsSync(join(root, m)))) {
    return [false, `no okf.yaml at ${root} - this repository has not adopted OKF`];
  }
  const rel = relFrom(root, filePath);
  if (rel.split('/').pop().toLowerCase() === 'index.md') {
    return [false, 'the edited file is an index; regenerating on its own write would recurse'];
  }
  if (ignoredFile(readIgnores(root), rel)) return [false, `${rel} is named in .okfignore`];

  // Refused before any write, not repaired after one. The generation marker already stops this
  // tool overwriting an index it did not write, but nothing stopped an OLDER installed plugin
  // regenerating a repository that declares a NEWER dialect - every row that dialect carries and
  // v0.2 does not project would be silently dropped, which is the same lossy downgrade in a
  // second spelling. The marker is versionless, so the declaration is the only evidence there is.
  const [source, declared] = declaredOkfVersion(root);
  if (declared && higher(declared, OKF_VERSION)) {
    return [false,
      `${source} declares OKF v${declared}; this generator writes v${OKF_VERSION}. Regenerating `
      + 'would drop every row the newer dialect carries. Update the wagner-skills plugin.'];
  }
  return [true, ''];
}

async function main() {
  const raw = await readInput();
  const payload = raw && typeof raw === 'object' ? raw : {};
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const given = typeof input.file_path === 'string' ? input.file_path : '';
  if (!given) return;

  const filePath = isAbsolute(given) ? given : resolve(cwd, given);
  const root = repoRootFor(filePath);
  const [run, reason] = decide(root, filePath);
  if (!run) {
    if (reason.includes('declares OKF v')) process.stderr.write(`okf-index-regen: ${reason}\n`);
    return;
  }

  // Never gated on `check`: a repository can carry frontmatter violations and still owe its
  // readers an accurate index. The two questions are independent and the gate belongs to `check`.
  cmdIndex(root, false, new Map(), readIgnores(root));
}

try {
  await main();
} catch (err) {
  process.stderr.write(`okf-index-regen: ${err && err.message ? err.message : err}\n`);
}
process.stdout.write('{}\n');
