#!/usr/bin/env node
// doc-this-describe-only-gate.mjs — PreToolUse hook on Edit|Write (BLOCKING, multilingual best-effort).
//
// Purpose: enforce the doc-this describe-only pact at write time. Blocks Edit|Write
// operations that target the doc-this STAGING tree (.doc-this-sdd/**; legacy _doc_this_sdd/**
// still matched for in-flight runs) and contain pact violations (🟡 markers, judgment
// phrasing, fabricated ADR sections, technical-debt headers, NFR-from-pattern phrases,
// sampling-phrases that disclose unread source — Total Source Coverage).
//
// Scope is the staging tree ONLY. The promoted docs/ tree (docs/requirements, docs/adr,
// docs/bugs) is the SHARED SDLC namespace co-owned by normal forward-design work — forward
// ADRs legitimately carry ## Consequences / ## Alternatives considered, requirements
// legitimately say "should be", bug files describe bugs — so describe-only rules are wrong
// there. doc-this agents write only to .doc-this-sdd/ (hidden + gitignored); promote copies
// from already-gated staging. (BUG-005)
//
// This hook is a BEST-EFFORT MULTILINGUAL SAFETY NET (en + pt-BR), not the primary
// enforcement. Primary enforcement lives in the SKILL prose policy
// (skills/doc-this/references/describe-only-pact.md) — agents apply it semantically
// across all output languages. This hook catches the most common literal patterns
// before they reach disk.
//
// Per-artifact escape (when content has a legitimate edge case):
//   <!-- DOC-THIS-EXEMPT : reason="explain" -->
//
// Logs to ~/.claude/logs/doc-this-gates.log.

import { isAbsolute, join } from 'node:path';

import {
  readHookInput,
  parseInput,
  bypassActive,
  statePath,
  resolveProject,
  log,
  allow,
  deny,
  failOpen,
} from './lib/doc-this-checks.mjs';

const EXEMPT_MARKER = /<!--[\t ]*DOC-THIS-EXEMPT[\t ]*:/;
const EXEMPT_REASON = /<!--[\t ]*DOC-THIS-EXEMPT[\t ]*:[\t ]*reason="([^"]*)"/;

const RULES = [
  {
    name: 'inference-emoji-forbidden',
    pattern: /🟡/,
  },
  {
    name: 'inferred-tag-forbidden',
    pattern: /\b(inferred|assumed):/i,
  },
  {
    name: 'judgment-verb-at-line-start',
    pattern:
      /^[\t ]*[-*#>]?[\t ]*(should be|recommend|recommendation|propose|we suggest|consider refactoring|this could be improved|better approach)\b/i,
  },
  {
    name: 'technical-debt-header-forbidden',
    pattern: /^[\t ]*#{1,6}[\t ]+technical[\t ]+debt\b/i,
  },
  {
    name: 'fabricated-adr-section',
    pattern:
      /^[\t ]*#{1,6}[\t ]+(alternatives[\t ]+considered|consequences)[\t ]*$/i,
    pathFilter: (relative) =>
      /adr\/ADR-.*\.md$/.test(relative) ||
      /adrs\/.*\.md$/.test(relative) ||
      /^(\.doc-this-sdd|_doc_this_sdd)\/decision-traces\/.*\.md$/.test(relative),
  },
  {
    name: 'nfr-from-pattern-forbidden',
    pattern:
      /inferred[\t ]+from[\t ]+(middleware|timeout|rate[\t ]*limit(er)?|retry|circuit[\t ]*breaker)/i,
  },
  {
    // Total Source Coverage: a coverage failure may not be written down as a
    // disclosure ("read by sampling", "skimmed") — the fix is reading the file,
    // not phrasing the skip honestly. Scoped to the staging tree, which is this
    // gate's entire scope; promoted human docs that legitimately discuss
    // sampling live outside it, and DOC-THIS-EXEMPT covers staged edge cases.
    name: 'sampling-phrase-forbidden',
    pattern:
      /not[\t ]+read[\t ]+in[\t ]+full|read[\t ]+(only[\t ]+)?by[\t ]+(sampling|outline|grep)|sampled[\t ]+(only|a[\t ]+few|[0-9]+[\t ]+of)|skimmed/i,
    pathFilter: (relative) => /^(\.doc-this-sdd|_doc_this_sdd)\//.test(relative),
  },
];

// Strip ```fenced code blocks``` and lines starting with > (markdown quotes —
// evidence excerpts). Stripped lines become blank so line numbers stay accurate.
function buildScanLines(content) {
  let inFence = false;
  return content.split('\n').map((line) => {
    if (/^[\t ]*```/.test(line)) {
      inFence = !inFence;
      return '';
    }
    if (inFence) return '';
    if (/^[\t ]*>/.test(line)) return '';
    return line;
  });
}

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (bypassActive(ctx.sessionId)) {
    log(ctx, 'exempt', 'session-bypass', 'per-session marker');
    return allow();
  }

  const filePath = ctx.toolInput.file_path || '';
  if (!filePath) {
    return allow();
  }

  // Resolve the doc-this project root from the TARGET FILE's path (walk up to
  // the nearest .doc-this/state.json), so the gate fires even when the session
  // cwd != analyzed project root (monorepo package, analyzed subdirectory,
  // tooling/subagent with a different cwd). Fall back to cwd-based detection
  // for backward compatibility. When neither yields a doc-this project, allow
  // SILENTLY — never log here, or every Edit|Write in a non-doc-this session
  // would pollute the gate log.
  let projectRoot = resolveProject(filePath, ctx.cwd);
  if (!projectRoot && statePath(ctx.cwd)) {
    projectRoot = ctx.cwd;
  }
  if (!projectRoot) {
    return allow();
  }

  const absFilePath = isAbsolute(filePath) ? filePath : join(ctx.cwd, filePath);
  const rootPrefix = `${projectRoot.replace(/\/+$/, '')}/`;
  const relative = absFilePath.startsWith(rootPrefix)
    ? absFilePath.slice(rootPrefix.length)
    : absFilePath;

  if (!/^(\.doc-this-sdd|_doc_this_sdd)\//.test(relative)) {
    log(ctx, 'skip', relative, 'out-of-scope path');
    return allow();
  }

  const rawContent =
    ctx.toolInput.content ?? ctx.toolInput.new_string ?? '';
  const content = typeof rawContent === 'string' ? rawContent : '';
  if (content === '') {
    log(ctx, 'allow', relative, 'empty content');
    return allow();
  }

  if (EXEMPT_MARKER.test(content)) {
    const reasonMatch = content.match(EXEMPT_REASON);
    log(ctx, 'exempt', relative, `DOC-THIS-EXEMPT: ${reasonMatch ? reasonMatch[1] : 'unspecified'}`);
    return allow();
  }

  const scanLines = buildScanLines(content);
  for (const rule of RULES) {
    if (rule.pathFilter && !rule.pathFilter(relative)) continue;
    for (let i = 0; i < scanLines.length; i++) {
      if (rule.pattern.test(scanLines[i])) {
        const lineNo = i + 1;
        const excerpt = scanLines[i].slice(0, 160);
        const reason =
          `describe-only pact violation [${rule.name}] at ${relative}:${lineNo} — ${excerpt}. ` +
          `The /doc-this pipeline is strictly descriptive (en, pt-BR, or any language by meaning). ` +
          `See \${CLAUDE_PLUGIN_ROOT}/skills/doc-this/references/describe-only-pact.md. ` +
          `To override for a single legitimate edge case, add: <!-- DOC-THIS-EXEMPT : reason="..." -->`;
        log(ctx, 'deny', relative, `${rule.name}@${lineNo}`);
        return deny(reason);
      }
    }
  }

  log(ctx, 'allow', relative, 'no pact violation detected');
  return allow();
});
