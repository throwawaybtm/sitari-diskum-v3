#!/usr/bin/env node
// SITARI PreToolUse guard for Claude Code (Bash tool).
// Exit 2 = block (stderr is shown to Claude). Exit 0 = allow normal permission flow.
// No dependencies, no network, reads only the hook payload on stdin.
// git and clasp commands are not blocked (owner decision, 2026-11-17).
'use strict';

const RULES = [
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
