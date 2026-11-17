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
  'clasp push',
  'cd Admin && clasp push --force',
  'clasp deploy -i AKfy -d "x"',
  'clasp create-deployment',
  'clasp update-deployment abc',
  'clasp undeploy abc',
  'clasp run myFn',
  'clasp run-function myFn',
  'clasp pull',
  'clasp setting scriptId x',
  'npx @google/clasp push',
  'npx -y @google/clasp deploy',
  'npx clasp@3.4.1 push',
  'git status; clasp push',
  'git push --force origin client/revisions-2026-11-10',
  'git push -f',
  'git push origin +client/revisions-2026-11-10',
  'git push origin main',
  'git push origin HEAD:main',
  'git push origin feature:main',
  'git merge main',
  'git reset --hard HEAD~1',
  'git clean -fdx',
  'git commit --amend --no-edit',
  'node maintenance/build-public.js 49',
  'curl -X POST https://api.fonnte.com/send',
  'curl https://script.google.com/macros/s/x/exec',
  'cat ~/.clasprc.json',
  'clasp version "release notes"',
  'clasp create-version "release notes"',
  'SITARI_OWNER_APPROVED_DEPLOY=1 clasp push',
  'export SITARI_OWNER_APPROVED_DEPLOY=1; clasp push',
  // Scripts that run clasp internally: the hook cannot see inside them, so the script itself is gated.
  'node maintenance/staging/deploy-staging.js',
  'cd D:/sitari-diskum-v3 && node ./maintenance/staging/deploy-staging.js',
  'node maintenance\\staging\\deploy-staging.js',
  'node maintenance/staging/deploy-staging',
  // clasp hidden in a quoted inline script.
  `node -e "require('child_process').execSync('clasp push')"`,
  `node -e "execSync('npx @google/clasp deploy -i x')"`,
];

const ALLOW = [
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
  'node maintenance/staging/build-staging.js',
  'git grep -n deploy-staging -- docs',
];

for (const c of BLOCK) test(`blocks: ${c}`, () => assert.equal(check(c).blocked, true, c));
for (const c of ALLOW) test(`allows: ${c}`, () => assert.equal(check(c).blocked, false, c));

// Owner switch: SITARI_OWNER_APPROVED_DEPLOY=1 in the hook's own environment.
const OWNER = { SITARI_OWNER_APPROVED_DEPLOY: '1' };

const OWNER_ALLOW = [
  'clasp push',
  'cd Admin && clasp push',
  'clasp create-version "release notes"',
  'clasp version "release notes"',
  'clasp deploy -i AKfy -d "x"',
  'clasp deploy --deploymentId AKfy',
  'clasp status && clasp push',
  'node maintenance/staging/deploy-staging.js',
];

const OWNER_BLOCK = [
  'clasp deploy',
  'clasp deploy -d "x"',
  'clasp pull',
  'clasp run myFn',
  'clasp run-function myFn',
  'clasp create-deployment',
  'clasp update-deployment abc',
  'clasp undeploy abc',
  'clasp setting scriptId x',
  'clasp login',
  'clasp push && clasp pull',
  'clasp push; clasp run myFn',
  'git push origin main',
  'git push --force origin x',
  'node maintenance/build-public.js 49',
  'curl -X POST https://api.fonnte.com/send',
  'curl https://script.google.com/macros/s/x/exec',
  'cat ~/.clasprc.json',
];

for (const c of OWNER_ALLOW) test(`owner switch allows: ${c}`, () => assert.equal(check(c, OWNER).blocked, false, c));
for (const c of OWNER_BLOCK) test(`owner switch still blocks: ${c}`, () => assert.equal(check(c, OWNER).blocked, true, c));

test('owner switch only counts for the exact value "1"', () => {
  for (const value of ['0', 'true', 'yes', '', '1 ', ' 1']) {
    assert.equal(check('clasp push', { SITARI_OWNER_APPROVED_DEPLOY: value }).blocked, true, JSON.stringify(value));
  }
  assert.equal(check('clasp push', {}).blocked, true);
  assert.equal(check('clasp push').blocked, true);
});

test('owner switch does not change read-only clasp commands', () => {
  assert.equal(check('clasp status', {}).blocked, false);
  assert.equal(check('clasp status', OWNER).blocked, false);
});

test('hook protocol: exit 2 + stderr on block, exit 0 on allow, ignores non-Bash', () => {
  const run = (payload) => spawnSync(process.execPath, [guardPath], { input: JSON.stringify(payload), encoding: 'utf8' });
  const blocked = run({ tool_name: 'Bash', tool_input: { command: 'clasp push' } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /SITARI guard blocked/);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }).status, 0);
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: 'x' } }).status, 0);
  assert.equal(spawnSync(process.execPath, [guardPath], { input: 'not json', encoding: 'utf8' }).status, 0);
});

test('hook protocol: owner switch is read from the hook process environment only', () => {
  const run = (command, env) => spawnSync(process.execPath, [guardPath], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, SITARI_OWNER_APPROVED_DEPLOY: undefined, ...env },
  });
  assert.equal(run('clasp push', {}).status, 2);
  assert.equal(run('clasp push', { SITARI_OWNER_APPROVED_DEPLOY: '1' }).status, 0);
  // Setting the variable inside the command text must not unlock anything.
  assert.equal(run('SITARI_OWNER_APPROVED_DEPLOY=1 clasp push', {}).status, 2);
  assert.equal(run('clasp pull', { SITARI_OWNER_APPROVED_DEPLOY: '1' }).status, 2);
});
