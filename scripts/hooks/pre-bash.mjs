// PreToolUse(Bash): enforce the CLAUDE.md "Essentials" that prose alone kept missing.
// Override any rule for one command by putting RM_HOOK_OVERRIDE=1 in it (say why in the reply).
import { execFileSync } from 'node:child_process';
import { commandDir, deny, emit, git, readInput } from './lib.mjs';

const input = readInput();
const cmd = String(input.tool_input?.command ?? '');
if (!cmd || /\bRM_HOOK_OVERRIDE=1\b/.test(cmd)) emit({});

// 1. Secrets: never source or print the root .env (reading one key with grep '^KEY=' stays allowed).
if (/(^|[;&|]\s*)(source|\.)\s+\S*\.env\b/.test(cmd)) deny('Blocked: never `source .env` (values contain `&`). Read one value with `grep \'^KEY=\' .env | cut -d= -f2-`.');
if (/\b(cat|type|less|more|head|tail|Get-Content|gc)\s+("?[^\s"]*[\\/])?\.env\b(?!\.)/.test(cmd)) deny('Blocked: never print the root .env. Read only the key you need with `grep \'^KEY=\' .env | cut -d= -f2-` and do not echo secrets.');

// 2. Git staging and history rules.
// Only the arguments of each `git add` segment (up to the next ;, &&, ||, |) count — not later commands.
for (const m of cmd.matchAll(/\bgit\b(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))?\s+add\b([^;&|]*)/g)) {
  const args = m[1];
  if (/\s(-f|--force)\b/.test(args)) deny('Blocked: `git add -f` would stage an ignored file (.env, .claude/, .superpowers/, App/).');
  const bad = /(^|[\s"'/])(\.env(?![\w.])|App\/|\.superpowers(\/|\b)|\.claude\/(?!skills\/rm-))/.exec(args);
  if (bad) deny(`Blocked: never stage ${bad[2]} (CLAUDE.md Essentials; only .claude/skills/rm-* may be staged).`);
}
if (/\bgit\b[^;&|]*\bcommit\b/.test(cmd)) {
  if (/--amend\b/.test(cmd)) deny('Blocked: never amend — make a new commit.');
  if (/--no-verify\b/.test(cmd)) deny('Blocked: never skip hooks (--no-verify).');
  if (/\s-m\s|\s-m"|\s-m'|<<\s*['"]?EOF/.test(cmd) && !/Co-Authored-By:/i.test(cmd)) deny('Blocked: the commit message needs the `Co-Authored-By: <model> <noreply@anthropic.com>` trailer.');
  const dir = commandDir(cmd, input.cwd);
  const staged = git(dir, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  if (staged.length) {
    const eol = git(dir, ['ls-files', '--eol', '--', ...staged.slice(0, 400)]);
    const crlf = eol.split('\n').filter((l) => /\bi\/crlf\b/.test(l)).map((l) => l.split('\t').pop());
    if (crlf.length) deny(`Blocked: staged files have CRLF in the index (repo is LF-only): ${crlf.join(', ')}. Convert to LF, re-add, retry.`);
  }
}
if (/\bgit\b[^;&|]*\bpush\b[^;&|]*(--force|-f\b)/.test(cmd)) deny('Blocked: force push needs the owner\'s explicit go-ahead.');

// 3. One test run per test database: refuse a second DB-capable run in the same checkout.
const isTestRun = /\b(vitest\s+run|playwright\s+test|turbo\s+run\s+test|test:affected|pnpm(\s+-s)?(\s+--filter\s+\S+)?\s+(test|e2e|e2e:affected|shots)\b)/.test(cmd) && !/vitest\.scripts\.config/.test(cmd);
if (isTestRun) {
  const top = git(commandDir(cmd, input.cwd), ['rev-parse', '--show-toplevel']).toLowerCase();
  const roots = top ? [`${top.replaceAll('/', '\\')}\\`, `${top}/`] : [];
  if (roots.length) {
    let running = [];
    try {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"],
        { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
      running = out.split('\n').map((l) => l.trim()).filter((l) => {
        const low = l.toLowerCase();
        return roots.some((r) => low.includes(r)) &&/(vitest|playwright|turbo)/.test(low) && !/vitest\.scripts\.config|--ui\b/.test(low);
      });
    } catch {
      // process listing unavailable: don't block
    }
    if (running.length) {
      deny(`Blocked: a test run is already using this checkout's test DB (${running.length} process(es), e.g. PID ${running[0].split('\t')[0]}). ` +
        'Wait for its completion notice, or stop it first. Two runs on one DB collide (CLAUDE.md). DB-free runs: add RM_HOOK_OVERRIDE=1.');
    }
  }
}

emit({});
