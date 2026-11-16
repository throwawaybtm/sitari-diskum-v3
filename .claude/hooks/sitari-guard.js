#!/usr/bin/env node
// SITARI PreToolUse guard for Claude Code (Bash tool).
// Blocks actions that AGENTS.md reserves for explicit owner approval.
// Exit 2 = block (stderr is shown to Claude). Exit 0 = allow normal permission flow.
// No dependencies, no network, reads only the hook payload on stdin.
'use strict';

const CLASP_READ_ONLY = new Set([
  'status', 'show-file-status', 'list-versions', 'versions', 'list-deployments', 'deployments',
  'show-authorized-user', 'help', '--help', '-h', '--version', '-v', 'version',
]);

const RULES = [
  {
    // Any clasp subcommand not on the read-only list (push, deploy, pull, run, create, setting, ...).
    test: (c) => {
      const re = /(?:^|[\s;&|(`])(?:npx\s+(?:-y\s+)?(?:@google\/)?clasp|clasp)(?:@[\w.-]+)?\s+([^\s;&|)]+)/g;
      let m;
      while ((m = re.exec(c)) !== null) {
        if (!CLASP_READ_ONLY.has(m[1].toLowerCase())) return `clasp ${m[1]}`;
      }
      return null;
    },
    why: 'clasp write/deploy/run/pull actions need explicit owner approval (AGENTS.md: never deploy Apps Script without approval). Ask the user to run it themselves.',
  },
  {
    test: (c) => (/\bgit\s+push\b[^;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/.test(c) ? 'git push --force' : null),
    why: 'Force push is never allowed without explicit approval.',
  },
  {
    test: (c) => (/\bgit\s+push\b[^;&|]*(\smain\b|:main\b|refs\/heads\/main\b)/.test(c) ? 'git push to main' : null),
    why: 'Pushing to main is a merge-to-main action and needs explicit approval.',
  },
  {
    test: (c) => (/\bgit\s+(merge|rebase)\b[^;&|]*\bmain\b/.test(c) ? 'git merge/rebase involving main' : null),
    why: 'Merging into main needs explicit approval.',
  },
  {
    test: (c) => (/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f[a-z]*|filter-branch|filter-repo|commit\s+--amend|push\s+--delete)\b/.test(c) ? 'history-rewriting or destructive git command' : null),
    why: 'Git history and the working tree must stay unchanged unless the owner approves.',
  },
  {
    test: (c) => (/\bmaintenance\/build-public\.js\b/.test(c) ? 'Public regeneration' : null),
    why: 'Public/ regeneration is a release activity (AGENTS.md / handover book). Ask first.',
  },
  {
    test: (c) => (/fonnte\.com|api\.fonnte/i.test(c) ? 'live Fonnte request' : null),
    why: 'Live WhatsApp/Fonnte sends are not allowed during development. Use mocks.',
  },
  {
    test: (c) => (/(script\.google\.com|sheets\.googleapis\.com|www\.googleapis\.com\/(drive|script))/i.test(c) && /\b(curl|wget|Invoke-WebRequest|iwr|http)\b/i.test(c) ? 'direct Google API/Apps Script call' : null),
    why: 'Live Sheets/Drive/Apps Script resources must not be touched during development.',
  },
  {
    test: (c) => (/\.clasprc\.json\b/.test(c) ? 'clasp credentials file access' : null),
    why: 'clasp OAuth credentials must never be read or copied.',
  },
];

function check(command) {
  const c = ` ${String(command || '')}`;
  for (const r of RULES) {
    const hit = r.test(c);
    if (hit) return { blocked: true, hit, why: r.why };
  }
  return { blocked: false };
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let payload;
    try { payload = JSON.parse(raw || '{}'); } catch { process.exit(0); }
    if (payload.tool_name !== 'Bash') process.exit(0);
    const res = check(payload.tool_input && payload.tool_input.command);
    if (res.blocked) {
      process.stderr.write(`SITARI guard blocked: ${res.hit}. ${res.why}\n`);
      process.exit(2);
    }
    process.exit(0);
  });
}

module.exports = { check };
