// Run: node --test .claude/hooks/sitari-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const guardPath = path.join(here, 'sitari-guard.js');
const { check } = createRequire(import.meta.url)(guardPath);

const BLOCK = [
  'git push --force origin client/revisions-2026-11-10',
  'git push -f',
  'git push origin +client/revisions-2026-11-10',
  'git push origin main',
  'git push origin HEAD:main',
  'git push origin feature:main',
  'git merge main',
  'curl -X POST https://api.fonnte.com/send',
  'curl https://script.google.com/macros/s/x/exec',
  'cat ~/.clasprc.json',
];

const ALLOW = [
  'git reset --hard HEAD~1',
  'git clean -fdx',
  'git commit --amend --no-edit',
  'node maintenance/build-public.js 49',
  'clasp push',
  'npx @google/clasp deploy',
  'clasp status',
  'clasp show-file-status',
  'clasp list-deployments',
  'clasp list-versions',
  'clasp show-authorized-user',
  'clasp --version',
  'git status --short --branch',
  'git log -1 --format=%H',
  'git diff --stat',
  'git grep -n "nextRecordId_" -- Admin',
  'git push origin client/revisions-2026-11-10',
  'node local-test/run-synthetic-tests.js',
  'node --test local-test/test/safe-id-generation.test.js',
  'grep -n "clasprc" docs/LOCAL_SETUP.md',
  'echo maintenance-window',
];

for (const c of BLOCK) test(`blocks: ${c}`, () => assert.equal(check(c).blocked, true, c));
for (const c of ALLOW) test(`allows: ${c}`, () => assert.equal(check(c).blocked, false, c));

test('hook protocol: exit 2 + stderr on block, exit 0 on allow, ignores non-Bash', () => {
  const run = (payload) => spawnSync(process.execPath, [guardPath], { input: JSON.stringify(payload), encoding: 'utf8' });
  const blocked = run({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /SITARI guard blocked/);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }).status, 0);
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: 'x' } }).status, 0);
  assert.equal(spawnSync(process.execPath, [guardPath], { input: 'not json', encoding: 'utf8' }).status, 0);
});
