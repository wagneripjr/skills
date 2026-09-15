#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeToolName, patchEdits, projectedContent, toolEdits } from '../scripts/lib/codex-tools.mjs';
import { Harness } from './lib/harness.mjs';

const h = new Harness('Codex native tool transport');
const root = fileURLToPath(new URL('..', import.meta.url));
const cwd = h.mkTemp('codex-tools-');
const patch = `*** Begin Patch
*** Add File: first file.md
+# First
+Recommended fix
*** Update File: second.md
@@
-We should refactor this.
+Observed behavior.
 context remains
*** Delete File: obsolete.md
*** Update File: before.md
*** Move to: after.md
@@
-before
+after
*** End Patch`;
const edits = patchEdits(patch, cwd);
h.equal('all four files are retained', edits.length, 4);
h.equal('paths with spaces resolve against hook cwd', edits[0].file_path, join(cwd, 'first file.md'));
h.equal('new file content is preserved', edits[0].content, '# First\nRecommended fix\n');
h.equal('removed and context lines are not proposed content', edits[1].new_string, 'Observed behavior.\n');
h.equal('deletion contains no proposed content', edits[2].content, '');
h.equal('move retains the original path', edits[3].old_path, join(cwd, 'before.md'));
h.equal('move exposes the destination path', edits[3].file_path, join(cwd, 'after.md'));
h.equal('move projection replaces removed content without dropping unchanged content', projectedContent(edits[3], 'heading\nbefore\ntail\n'), 'heading\nafter\ntail\n');
const noChange = patchEdits('*** Begin Patch\n*** Update File: old.md\n*** Move to: new.md\n@@\n Recommend a change\n*** End Patch', cwd)[0];
h.equal('move projection retains existing content even when no lines are added', projectedContent(noChange, 'Recommend a change\n'), 'Recommend a change\n');
let uncertain = false;
try { projectedContent(edits[3], 'different\n'); } catch { uncertain = true; }
h.check('a mismatched move is reported instead of fabricating projected content', uncertain);
const append = patchEdits('*** Begin Patch\n*** Update File: old.md\n*** Move to: new.md\n@@\n+appended\n*** End Patch', cwd)[0];
h.equal('a context-free insertion appends, matching the native patch engine', projectedContent(append, 'heading\n'), 'heading\nappended\n');
for (const input of [patch, { command: patch }, { patch }, { input: patch }]) {
  h.equal('native patch payload is normalized', toolEdits({ tool_name: 'functions.apply_patch', tool_input: input, cwd }).length, 4);
}
for (const [given, expected] of [
  ['collaboration.spawn_agent', 'spawn_agent'], ['multi_agent_v1send_input', 'send_input'],
  ['multi_agent_v1resume_agent', 'resume_agent'], ['functions.apply_patch', 'apply_patch'], ['Edit', 'Edit'],
]) h.equal(`normalizes ${given}`, normalizeToolName(given), expected);
h.equal('ordinary native edit resolves its path', toolEdits({ tool_name: 'Edit', cwd, tool_input: { file_path: '../other.md', new_string: 'new' } })[0].file_path, resolve(cwd, '../other.md'));
h.equal('unrelated tools are ignored', toolEdits({ tool_name: 'exec_command', tool_input: { command: patch }, cwd }).length, 0);
for (const bad of ['', '*** Begin Patch\n*** Add File: a.md\n+hi', '*** Begin Patch\nnot a patch\n*** End Patch']) {
  let rejected = false;
  try { patchEdits(bad, cwd); } catch { rejected = true; }
  h.check('malformed patches are reported rather than partly parsed', rejected);
}
const canonical = readFileSync(join(root, 'scripts/lib/codex-tools.mjs'), 'utf8');
for (const plugin of ['doc-this', 'okf-maintain']) {
  h.equal(`${plugin} ships the canonical transport independently`, readFileSync(join(root, 'plugins', plugin, 'hooks/lib/codex-tools.mjs'), 'utf8'), canonical);
}
h.done();
