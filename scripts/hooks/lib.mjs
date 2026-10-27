// Shared helpers for the Claude Code hooks in scripts/hooks/ (wired in .claude/settings.json).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The hook payload Claude Code sends on stdin (JSON). */
export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

/** Runs git in `cwd`; returns trimmed stdout, or '' on any failure. */
export function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

/** Prints a hook JSON result and exits 0. */
export function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

/** PreToolUse refusal: the tool call is not run and `reason` goes back to Claude. */
export function deny(reason) {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

/** The directory a Bash command runs in: a leading `cd <dir> &&` or `git -C <dir>`, else the session cwd. */
export function commandDir(command, fallback) {
  const m = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;)/.exec(command) ?? /\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(command);
  return m ? (m[1] ?? m[2] ?? m[3]) : fallback;
}
