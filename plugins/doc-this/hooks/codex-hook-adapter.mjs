#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { normalizeToolName, projectedContent, toolEdits } from './lib/codex-tools.mjs';
import { allow, deny, parseInput, resolveProject, runStandalone, statePath } from './lib/doc-this-checks.mjs';
import { evaluate as dispatch } from './doc-this-dispatch-gate.mjs';
import { evaluate as phase } from './doc-this-phase-gate.mjs';
import { evaluate as checkpoint } from './doc-this-checkpoint-gate.mjs';
import { evaluate as coverage } from './doc-this-coverage-gate.mjs';
import { evaluate as artifacts } from './doc-this-artifact-completeness-gate.mjs';
import { evaluate as describe } from './doc-this-describe-only-gate.mjs';
import { evaluate as promote } from './doc-this-promote-warning.mjs';
import { evaluate as lspBudget } from './doc-this-lsp-budget.mjs';
import { evaluate as lspTiming } from './doc-this-lsp-timing.mjs';

const WORKERS = new Set(['scout', 'code-analyst', 'archaeologist', 'detective', 'architect', 'writer', 'reviewer', 'tracer', 'visor', 'data-master', 'design-system'].map((name) => `doc-this-${name}`));
const CONTINUATIONS = new Set(['send_input', 'send_message', 'followup_task', 'resume_agent']);
const DISPATCH_CHECKS = [dispatch, phase, checkpoint, coverage, artifacts];

function marker(input) {
  const message = typeof input.message === 'string' ? input.message : '';
  const line = message.split(/\r?\n/, 1)[0];
  const match = /^DOC_THIS_WORKER=(doc-this-[a-z-]+)$/.exec(line);
  if (match && WORKERS.has(match[1])) return { worker: match[1] };
  if (/^[\t ]*DOC_THIS_WORKER=/.test(line)) return { error: 'Put DOC_THIS_WORKER=<worker skill name> on the first line with a supported doc-this worker name.' };
  const named = String(input.task_name || input.agent_type || '').replaceAll('_', '-').split('/').at(-1);
  if (WORKERS.has(named)) return { error: `Dispatch ${named} with DOC_THIS_WORKER=${named} as the first message line.` };
  return {};
}

function registryPath(session, target) {
  if (!session || typeof target !== 'string' || !target) return null;
  const hash = createHash('sha256').update(`${session}\0${target}`).digest('hex');
  return join(tmpdir(), 'codex-doc-this-agents', `${hash}.json`);
}

function registered(session, target) {
  const path = registryPath(session, target);
  if (!path) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return WORKERS.has(value.worker) && typeof value.cwd === 'string' ? value : null;
  } catch {
    return null;
  }
}

function responseObject(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' ? value : null;
}

function remember(event, ctx, worker) {
  const response = responseObject(event.tool_response);
  if (!response || response.error || response.isError) return;
  const targets = [response.agent_id, response.task_name, response.id];
  if (!targets.some((target) => typeof target === 'string' && target)) return;
  targets.push(ctx.toolInput.task_name);
  for (const target of targets) {
    const path = registryPath(ctx.sessionId, target);
    if (!path) continue;
    mkdirSync(join(tmpdir(), 'codex-doc-this-agents'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ worker, cwd: ctx.cwd }), { mode: 0o600 });
    renameSync(temporary, path);
  }
}

function native(decision) {
  return { ...decision, code: 0 };
}

function merge(decisions, eventName) {
  const blocked = decisions.find((decision) => decision.code === 2);
  if (blocked) return native(blocked);
  const context = decisions.map((decision) => decision.output?.hookSpecificOutput?.additionalContext).filter(Boolean);
  return context.length ? { code: 0, output: { hookSpecificOutput: { hookEventName: eventName, additionalContext: context.join('\n\n') } } } : allow();
}

export async function evaluate(event) {
  const ctx = { ...parseInput(event), host: 'codex' };
  const tool = normalizeToolName(event?.tool_name);
  const eventName = event?.hook_event_name;
  if (!['PreToolUse', 'PostToolUse'].includes(eventName)) return allow();
  const before = eventName === 'PreToolUse';
  const continuation = CONTINUATIONS.has(tool);
  if (tool === 'spawn_agent' || continuation) {
    const tag = marker(ctx.toolInput);
    const previous = continuation ? registered(ctx.sessionId, ctx.toolInput.target || ctx.toolInput.id) : null;
    if (before && tag.error) return native(deny(`doc-this Codex dispatch: ${tag.error}`));
    if (before && previous && tag.worker && previous.worker !== tag.worker) {
      return native(deny(`doc-this Codex dispatch: this agent was started as ${previous.worker}; its worker identity cannot change on continuation.`));
    }
    const worker = previous?.worker || tag.worker;
    if (!worker) return allow();
    if (!before) {
      if (tool === 'spawn_agent') remember(event, ctx, worker);
      return allow();
    }
    const workerCtx = { ...ctx, cwd: previous?.cwd || ctx.cwd, toolInput: { skill: `doc-this:${worker}` } };
    const decisions = [];
    for (const check of DISPATCH_CHECKS) {
      const decision = await check(workerCtx);
      decisions.push(decision);
      if (decision.code === 2) break;
    }
    return merge(decisions, eventName);
  }
  if (tool === 'LSP') return native(await (before ? lspBudget : lspTiming)(ctx));
  if (!before) return allow();
  let edits;
  try { edits = toolEdits(event); } catch (error) {
    if (!statePath(ctx.cwd)) return allow();
    return native(deny(`doc-this cannot inspect this patch: ${error.message}`));
  }
  const decisions = [];
  for (const edit of edits) {
    if (edit.operation === 'move') {
      const root = resolveProject(edit.file_path, ctx.cwd) || (statePath(ctx.cwd) ? ctx.cwd : null);
      if (root && /^(\.doc-this-sdd|_doc_this_sdd)\//.test(relative(root, edit.file_path).split(sep).join('/'))) {
        try {
          edit.content = projectedContent(edit, readFileSync(edit.old_path, 'utf8'));
          edit.new_string = edit.content;
        } catch (error) {
          return native(deny(`doc-this cannot verify the moved document: ${error.message}. Use an explicit Write with the complete destination content, then delete the old file.`));
        }
      }
      decisions.push(await promote({ ...ctx, toolInput: { file_path: edit.old_path } }));
    }
    const editCtx = { ...ctx, toolInput: edit };
    const decision = await describe(editCtx);
    decisions.push(decision);
    if (decision.code === 2) break;
    decisions.push(await promote(editCtx));
  }
  return merge(decisions, eventName);
}

await runStandalone(import.meta.url, evaluate, (raw) => raw);
