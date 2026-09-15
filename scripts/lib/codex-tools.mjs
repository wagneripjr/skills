import { resolve } from 'node:path';

export function normalizeToolName(name) {
  return String(name ?? '').replace(/^(?:(?:functions|collaboration|multi_agent_v[12])[.:_]*|mcp__codex__)+/, '');
}

export function patchEdits(patch, cwd = process.cwd()) {
  if (typeof patch !== 'string') throw new Error('apply_patch input must contain a patch string');
  const lines = patch.trim().split(/\r?\n/);
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') {
    throw new Error('apply_patch input has no complete patch envelope');
  }
  const edits = [];
  let edit;
  let hunk;
  for (const line of lines.slice(1, -1)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header) {
      edit = { file_path: resolve(cwd, header[2]), operation: header[1].toLowerCase(), content: '', new_string: '' };
      hunk = undefined;
      edits.push(edit);
    } else if (line.startsWith('*** Move to: ') && edit?.operation === 'update') {
      edit.old_path = edit.file_path;
      edit.file_path = resolve(cwd, line.slice('*** Move to: '.length));
      edit.operation = 'move';
    } else if (line.startsWith('@@') && edit && ['update', 'move'].includes(edit.operation)) {
      hunk = { anchor: line.slice(2).trim(), before: [], after: [], atEnd: false };
      (edit.hunks ??= []).push(hunk);
    } else if (line.startsWith('+') && edit && edit.operation !== 'delete') {
      edit.content += `${line.slice(1)}\n`;
      edit.new_string = edit.content;
      hunk?.after.push(line.slice(1));
    } else if (hunk && line.startsWith('-')) {
      hunk.before.push(line.slice(1));
    } else if (hunk && line.startsWith(' ')) {
      hunk.before.push(line.slice(1));
      hunk.after.push(line.slice(1));
    } else if (hunk && line === '*** End of File') {
      hunk.atEnd = true;
    } else if (edit && line === '') {
      continue;
    } else {
      throw new Error('Unrecognized apply_patch section');
    }
  }
  return edits;
}

export function projectedContent(edit, source) {
  if (!edit.hunks?.length) return source;
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const replacements = [];
  let cursor = 0;
  for (const hunk of edit.hunks) {
    let start = cursor;
    if (hunk.anchor) {
      const anchor = lines.findIndex((line, index) => index >= cursor && line.trim() === hunk.anchor.trim());
      if (anchor < 0) throw new Error('Cannot locate moved-file patch anchor');
      start = anchor + 1;
    }
    if (!hunk.before.length) {
      const index = lines.at(-1) === '' ? lines.length - 1 : lines.length;
      replacements.push({ index, count: 0, after: hunk.after });
      continue;
    }
    let found = -1;
    for (const normalize of [(line) => line, (line) => line.trimEnd(), (line) => line.trim()]) {
      for (let index = start; index <= lines.length - hunk.before.length; index++) {
        if (hunk.atEnd && index + hunk.before.length !== lines.length) continue;
        if (hunk.before.every((line, offset) => normalize(line) === normalize(lines[index + offset]))) {
          found = index;
          break;
        }
      }
      if (found >= 0) break;
    }
    if (found < 0) throw new Error('Cannot locate moved-file patch context');
    replacements.push({ index: found, count: hunk.before.length, after: hunk.after });
    cursor = found + hunk.before.length;
  }
  for (const replacement of replacements.sort((a, b) => a.index - b.index).reverse()) {
    lines.splice(replacement.index, replacement.count, ...replacement.after);
  }
  return lines.at(-1) === '' ? lines.join('\n') : `${lines.join('\n')}\n`;
}

export function toolEdits(event) {
  const tool = normalizeToolName(event?.tool_name);
  const input = event?.tool_input;
  const cwd = typeof event?.cwd === 'string' && event.cwd ? event.cwd : process.cwd();
  if (tool === 'apply_patch') {
    const patch = typeof input === 'string' ? input : input?.command ?? input?.patch ?? input?.input ?? input?.cmd;
    return patchEdits(patch, cwd);
  }
  if (!['Write', 'Edit', 'write_file', 'edit_file'].includes(tool) || typeof input?.file_path !== 'string') return [];
  return [{ ...input, file_path: resolve(cwd, input.file_path), operation: tool === 'Write' || tool === 'write_file' ? 'add' : 'update' }];
}
