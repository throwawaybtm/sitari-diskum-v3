#!/usr/bin/env node
// Function index for SITARI sources, including <script> code inside .html files.
// Cheap orientation without reading whole files.
//   node .claude/skills/sitari-knowledge/scripts/code-index.mjs Admin/Index.html Admin/Code.js
//   node .claude/skills/sitari-knowledge/scripts/code-index.mjs --grep upload        (all tracked app files)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const gi = args.indexOf('--grep');
const filter = gi >= 0 ? new RegExp(args[gi + 1], 'i') : null;
let files = args.filter((a, i) => !a.startsWith('--') && (gi < 0 || i !== gi + 1));
if (!files.length) {
  files = execFileSync('git', ['ls-files', 'Admin', 'Public', 'Tamu-FO', 'Tamu-Luar', 'maintenance'], { encoding: 'utf8' })
    .split('\n').filter((f) => /\.(js|html)$/.test(f));
}
const fnRe = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/;
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(`${f}: (missing - private or generated?)`); continue; }
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const hits = [];
  lines.forEach((l, i) => { const m = l.match(fnRe); if (m) { const n = m[1] || m[2]; if (!filter || filter.test(n)) hits.push(`${n}:${i + 1}`); } });
  if (hits.length) console.log(`${f} (${lines.length} lines): ${hits.join(' ')}`);
}
