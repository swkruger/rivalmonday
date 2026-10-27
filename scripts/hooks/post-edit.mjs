// PostToolUse(Edit|Write|NotebookEdit): LF + UTF-8 always; design-system literals in UI code (advisory).
import { existsSync, readFileSync } from 'node:fs';
import { emit, readInput } from './lib.mjs';

const input = readInput();
const file = String(input.tool_input?.file_path ?? input.tool_response?.filePath ?? '');
if (!file || !existsSync(file)) emit({});
const norm = file.replaceAll('\\', '/');
if (/\/(node_modules|\.next|\.superpowers|\.claude)\//.test(norm) || /\.(png|jpe?g|webp|gif|ico|pdf|zip|woff2?)$/i.test(norm)) emit({});

const problems = [];
const buf = readFileSync(file);
try {
  new TextDecoder('utf-8', { fatal: true }).decode(buf);
} catch {
  problems.push('not valid UTF-8 (a cp1252 byte breaks `next build`) — rewrite the file as UTF-8');
}
if (buf.includes('\r\n')) problems.push('has CRLF line endings — the repo is LF-only; convert to LF');

// Design-system v1 literals (packages/ui/CLAUDE.md "Tokens only"), checked only in the text this edit added.
const notes = [];
if (/\/(apps\/web\/src|packages\/ui\/src)\/.*\.(tsx|ts)$/.test(norm) && !/\.test\.tsx?$/.test(norm)) {
  const added = String(input.tool_input?.new_string ?? input.tool_input?.content ?? '');
  const rules = [
    [/\brounded-\[[^\]]+\]/g, 'radius literal (use rounded-xs/sm/md/lg/full)'],
    [/\btext-\[\d+px\]/g, 'font-size literal (use text-11/text-13/scale)'],
    [/\b(bg|text|border|ring|outline|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g, 'hex colour literal (use a token)'],
    [/\bshadow-card\b/g, 'shadow-card (static surfaces have no shadow)'],
    [/\bfont-extrabold\b/g, 'font-extrabold (weights 400/500/600)'],
    [/\bring-primary\b|\boutline-primary\b/g, 'agency-coloured focus (use outline-ring)'],
  ];
  for (const [re, why] of rules) {
    const hits = [...new Set(added.match(re) ?? [])];
    if (hits.length) notes.push(`${hits.join(', ')}: ${why}`);
  }
}

if (problems.length) emit({ decision: 'block', reason: `${norm}: ${problems.join('; ')}.` });
if (notes.length) {
  emit({ hookSpecificOutput: { hookEventName: 'PostToolUse',
    additionalContext: `Design-system check on ${norm} (advisory; fix unless the playbook allows it, e.g. chart files or layout widths): ${notes.join(' | ')}` } });
}
emit({});
