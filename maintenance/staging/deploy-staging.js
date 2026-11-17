'use strict';
/**
 * OWNER-ONLY: creates (first run) and updates the SITARI STAGING Apps Script projects.
 *
 *   node maintenance/staging/deploy-staging.js
 *
 * Run it yourself in a terminal where `clasp` is logged in to the owner account. Agents must not
 * run it (the SITARI guard reserves clasp create/push/deploy for the owner). It only ever talks to
 * the two STAGING script IDs stored in .staging/config.json and refuses production IDs.
 *
 * Steps: create projects if missing -> push Admin -> Admin library version -> build Public against
 * that version -> push + deploy Public -> rebuild Admin with the staging form URLs -> push + deploy Admin.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildStaging, loadConfig, saveConfig, ADMIN_DIR, PUBLIC_DIR } = require('./build-staging.js');

function clasp(dir, args) {
  console.log('> clasp ' + args.join(' ') + '   (' + path.basename(dir) + ')');
  const result = spawnSync('clasp', args, { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
  const output = (result.stdout || '') + (result.stderr || '');
  if (result.status !== 0) {
    console.error(output);
    throw new Error('clasp ' + args[0] + ' failed in ' + path.basename(dir));
  }
  return output;
}

function ensureProject(config, key, dir, title) {
  if (config[key]) return;
  const createDir = dir + '-create';
  fs.rmSync(createDir, { recursive: true, force: true });
  fs.mkdirSync(createDir, { recursive: true });
  clasp(createDir, ['create-script', '--type', 'webapp', '--title', JSON.stringify(title), '--rootDir', '.']);
  const created = JSON.parse(fs.readFileSync(path.join(createDir, '.clasp.json'), 'utf8'));
  if (!created.scriptId) throw new Error('clasp did not return a script id for ' + title);
  config[key] = created.scriptId;
  saveConfig(config);
  fs.rmSync(createDir, { recursive: true, force: true });
  console.log('Created ' + title);
}

function createVersion(dir, label) {
  const output = clasp(dir, ['create-version', JSON.stringify(label)]);
  const match = output.match(/version\s+(\d+)/i);
  if (!match) throw new Error('Could not read the new version number:\n' + output);
  return Number(match[1]);
}

function deploy(dir, version, existingId, label) {
  const args = ['create-deployment', '-V', String(version), '-d', JSON.stringify(label)];
  if (existingId) args.push('-i', existingId);
  const output = clasp(dir, args);
  const match = output.match(/(AKfyc[\w-]+)/);
  if (!match) throw new Error('Could not read the deployment id:\n' + output);
  return match[1];
}

function main() {
  const config = loadConfig();
  const label = 'staging ' + new Date().toISOString().slice(0, 16);

  ensureProject(config, 'adminScriptId', ADMIN_DIR, 'SI-TARI STAGING - Admin');
  ensureProject(config, 'publicScriptId', PUBLIC_DIR, 'SI-TARI STAGING - Public');

  // 1. Admin code (also the SiTariCore library for Public).
  buildStaging();
  clasp(ADMIN_DIR, ['push', '--force']);
  config.adminCoreVersion = createVersion(ADMIN_DIR, label);
  saveConfig(config);

  // 2. Public forms pinned to that staging library version.
  buildStaging();
  clasp(PUBLIC_DIR, ['push', '--force']);
  const publicVersion = createVersion(PUBLIC_DIR, label);
  config.publicDeploymentId = deploy(PUBLIC_DIR, publicVersion, config.publicDeploymentId, label);
  config.publicUrl = 'https://script.google.com/macros/s/' + config.publicDeploymentId + '/exec';
  saveConfig(config);

  // 3. Admin again, now with the staging form URLs, then its web app deployment.
  buildStaging();
  clasp(ADMIN_DIR, ['push', '--force']);
  const adminVersion = createVersion(ADMIN_DIR, label);
  config.adminDeploymentId = deploy(ADMIN_DIR, adminVersion, config.adminDeploymentId, label);
  config.adminUrl = 'https://script.google.com/macros/s/' + config.adminDeploymentId + '/exec';
  config.lastDeployed = new Date().toISOString();
  saveConfig(config);

  console.log('\nSTAGING ready');
  console.log('  Admin : ' + config.adminUrl);
  console.log('  TLD   : ' + config.publicUrl + '?page=tld');
  console.log('  TDD   : ' + config.publicUrl + '?page=tdd');
  console.log('First time only: open both Admin and the TLD link while signed in and click "Review permissions" -> Allow.');
}

try { main(); } catch (error) { console.error('\n' + error.message); process.exit(1); }
