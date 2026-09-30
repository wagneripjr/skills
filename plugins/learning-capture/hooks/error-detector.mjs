#!/usr/bin/env node
import { statSync } from 'node:fs';

const ERROR_PATTERNS = [
  'error:', 'Error:', 'ERROR:', 'failed', 'FAILED', 'command not found', 'No such file',
  'Permission denied', 'fatal:', 'Exception', 'Traceback', 'npm ERR!', 'ModuleNotFoundError',
  'SyntaxError', 'TypeError', 'exit code', 'non-zero',
];

function emitEmpty() {
  process.stdout.write('{}\n');
  process.exit(0);
}

function learningsDir() {
  try {
    return statSync('.learnings').isDirectory();
  } catch {
    return false;
  }
}

async function readStdin() {
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

async function main() {
  if (!learningsDir()) emitEmpty();

  const obj = await readStdin();
  if (obj && typeof obj === 'object' && (obj.agent_id || obj.agent_type)) emitEmpty();
  const tr = obj && typeof obj === 'object' ? obj.tool_response : undefined;
  const ti = obj && typeof obj === 'object' && obj.tool_input && typeof obj.tool_input === 'object' ? obj.tool_input : {};

  let stdout = '';
  if (tr && typeof tr === 'object' && typeof tr.stdout === 'string') stdout = tr.stdout;
  else if (typeof tr === 'string') stdout = tr;
  const stderr = tr && typeof tr === 'object' && typeof tr.stderr === 'string' ? tr.stderr : '';
  const command = typeof ti.command === 'string' ? ti.command : '';

  if (command.includes('.learnings/')) emitEmpty();

  const trObj = tr && typeof tr === 'object' ? tr : {};
  const exitField = trObj.exit_code ?? trObj.exitCode;
  const errorFlag = trObj.isError ?? trObj.is_error;
  const hasExit = exitField !== undefined && exitField !== null && exitField !== '';
  const hasFlag = errorFlag === true || errorFlag === 'true' || errorFlag === false || errorFlag === 'false';

  if (hasExit) {
    if (String(exitField) === '0') emitEmpty();
  } else if (hasFlag) {
    if (errorFlag === false || errorFlag === 'false') emitEmpty();
  }

  const output = `${stdout}${stderr}`;
  if (!output) emitEmpty();

  if (!ERROR_PATTERNS.some((p) => output.includes(p))) emitEmpty();

  if (!hasExit && !hasFlag && /(^|[^0-9])(0 failed|0 failures|0 errors|all tests passed)/i.test(output)) emitEmpty();

  const cmdShort = command.split('\n')[0].slice(0, 200);
  const running = cmdShort ? ` while running: ${cmdShort}` : '';
  const nudge =
    '<error-detected>\n' +
    `A command error was detected${running}. Consider logging this to .learnings/ERRORS.md if:\n` +
    '- The error was unexpected or non-obvious\n' +
    '- It required investigation to resolve\n' +
    '- It might recur in similar contexts\n' +
    '- The solution could benefit future sessions\n\n' +
    'Use the learning-capture skill format: [ERR-YYYYMMDD-XXX]\n' +
    'If a skill\'s text should have prevented it, record **Skill**: <plugin>:<name> | none, **Fix-type**: rule | skill | verifier | refactor, and **Review**: <job-id> when it came from an adversarial review\n' +
    '</error-detected>';

  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: nudge } })}\n`,
  );
  process.exit(0);
}

main();
