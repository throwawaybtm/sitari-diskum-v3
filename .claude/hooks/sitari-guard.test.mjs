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
  'node maintenance/build-public.js 49',
  'curl -X POST https://api.fonnte.com/send',
  'curl https://script.google.com/macros/s/x/exec',
  'cat ~/.clasprc.json',
];

// git and clasp are not blocked by the guard (owner decision, 2026-11-17).
const ALLOW = [
  'clasp status',
  'clasp push',
  'clasp push --force',
  'clasp deploy -i AKfy -d "x"',
  'clasp deploy',
  'clasp create-version "release notes"',
  'clasp pull',
  'clasp run myFn',
  'npx @google/clasp push',
  'node maintenance/staging/deploy-staging.js',
  'node maintenance/staging/build-staging.js',
  'git status --short --branch',
  'git push origin client/revisions-2026-11-10',
  'git push --force origin x',
  'git push origin main',
  'git merge main',
  'git reset --hard HEAD~1',
  'git clean -fdx',
  'git commit --amend --no-edit',
  'node local-test/run-synthetic-tests.js',
  'grep -n "clasprc" docs/LOCAL_SETUP.md',
];

for (const c of BLOCK) test(`blocks: ${c}`, () => assert.equal(check(c).blocked, true, c));
for (const c of ALLOW) test(`allows: ${c}`, () => assert.equal(check(c).blocked, false, c));

test('hook protocol: exit 2 + stderr on block, exit 0 on allow, ignores non-Bash', () => {
  const run = (payload) => spawnSync(process.execPath, [guardPath], { input: JSON.stringify(payload), encoding: 'utf8' });
  const blocked = run({ tool_name: 'Bash', tool_input: { command: 'cat ~/.clasprc.json' } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /SITARI guard blocked/);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } }).status, 0);
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: 'x' } }).status, 0);
  assert.equal(spawnSync(process.execPath, [guardPath], { input: 'not json', encoding: 'utf8' }).status, 0);
});
