// SessionStart: the shell part of /rm-start, injected as context (startup, resume, clear, compact).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emit, git, readInput } from './lib.mjs';

const input = readInput();
const cwd = input.cwd || process.cwd();
const root = git(cwd, ['rev-parse', '--show-toplevel']) || cwd;
const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
const status = git(root, ['status', '--short']).split('\n').filter(Boolean);
const worktrees = git(root, ['worktree', 'list']);
const unmerged = git(root, ['branch', '--no-merged', 'main', '--format=%(refname:short)']).split('\n').filter(Boolean);

/** `## Status` and `## Next` of a work file (first 1,500 chars each). */
function sections(text) {
  const pick = (name) => {
    const m = new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(text);
    return m ? m[1].trim().slice(0, 1500) : '';
  };
  return [`Status: ${pick('Status')}`, `Next: ${pick('Next')}`].join('\n');
}

const lines = [`[rm-start hook] ${root} on ${branch} (${status.length ? `${status.length} changed` : 'clean'}) — main @ ${git(root, ['rev-parse', '--short', 'main'])}`];
if (status.length) lines.push(`Uncommitted: ${status.slice(0, 10).join(' | ')}`);
lines.push(`Worktrees:\n${worktrees}`);

const workFile = join(root, 'docs', 'work', `${branch.replaceAll('/', '-')}.md`);
if (branch !== 'main' && existsSync(workFile)) lines.push(`This branch's work file:\n${sections(readFileSync(workFile, 'utf8'))}`);

for (const b of unmerged.filter((b) => b !== branch)) {
  const text = git(root, ['show', `${b}:docs/work/${b.replaceAll('/', '-')}.md`]);
  lines.push(text ? `Other branch ${b}:\n${sections(text)}` : `Other branch ${b}: no work file`);
}

// The most recently touched SDD ledger in this checkout: where a running plan stands after a compaction or "continue".
const sdd = join(root, '.superpowers', 'sdd');
if (existsSync(sdd)) {
  const ledgers = readdirSync(sdd)
    .map((d) => join(sdd, d, 'progress.md'))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (ledgers[0]) {
    const text = readFileSync(ledgers[0], 'utf8').split('\n');
    lines.push(`Latest SDD ledger (${ledgers[0]}), first line + last 12:\n${[text[0], ...text.filter(Boolean).slice(-12)].join('\n')}`);
  }
}

lines.push('Trust the ledger and git log over memory; a task with a "complete" line is done.');
emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n\n') } });
