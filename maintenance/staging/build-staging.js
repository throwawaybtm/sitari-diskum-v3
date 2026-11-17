'use strict';
/**
 * Builds a STAGING copy of SITARI into the gitignored `.staging/` folder.
 *
 *   .staging/config.json   staging IDs (spreadsheet, folders, script IDs, URLs) - private, gitignored
 *   .staging/admin/        Admin sources + generated PublicIntake.js + StagingConfig.js
 *   .staging/public/       Public sources built against the STAGING Admin library
 *
 * It never writes to Admin/, Public/ or any production .clasp.json, and it refuses to build
 * if any staging ID equals a production ID. Deploying is owner-only: see deploy-staging.js.
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildPublic } = require('../build-public.js');

const ROOT = path.resolve(__dirname, '..', '..');
const STAGING = path.join(ROOT, '.staging');
const CONFIG_PATH = path.join(STAGING, 'config.json');
const ADMIN_DIR = path.join(STAGING, 'admin');
const PUBLIC_DIR = path.join(STAGING, 'public');
const REQUIRED = ['spreadsheetId', 'folderSuratId', 'folderBuktiId', 'approverEmail'];

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (fallback !== undefined) return fallback; throw error; }
}

function loadConfig() {
  const config = readJson(CONFIG_PATH, null);
  if (!config) throw new Error('Missing .staging/config.json (see docs/STAGING_SETUP.md).');
  const missing = REQUIRED.filter((key) => !String(config[key] || '').trim());
  if (missing.length) throw new Error('.staging/config.json is missing: ' + missing.join(', '));
  return config;
}

function saveConfig(config) {
  fs.mkdirSync(STAGING, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

/** Production identifiers, read in-process only (never printed). */
function productionIds() {
  const ids = new Set();
  for (const file of ['Admin/.clasp.json', 'Public/.clasp.json', 'Tamu-Luar/.clasp.json', 'Tamu-FO/.clasp.json']) {
    const json = readJson(path.join(ROOT, file), null);
    if (json && json.scriptId) ids.add(json.scriptId);
  }
  const storage = fs.readFileSync(path.join(ROOT, 'Admin/VisitWorkflowStorage.js'), 'utf8');
  for (const match of storage.matchAll(/(?:scriptId|spreadsheetId):\s*'([^']+)'/g)) ids.add(match[1]);
  return ids;
}

function assertSeparateFromProduction(config) {
  const prod = productionIds();
  for (const key of ['spreadsheetId', 'folderSuratId', 'folderBuktiId', 'adminScriptId', 'publicScriptId']) {
    if (config[key] && prod.has(config[key])) {
      throw new Error('Refusing to build: staging ' + key + ' is a PRODUCTION id.');
    }
  }
}

function cleanDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function stagingProperties(config) {
  const props = {
    SPREADSHEET_ID: config.spreadsheetId,
    FOLDER_SURAT_ID: config.folderSuratId,
    FOLDER_BUKTI_ID: config.folderBuktiId,
    APPROVER_EMAIL: config.approverEmail,
    FONNTE_DISABLED: whatsappTestConfig(config) ? 'false' : 'true',
    PUBLIC_DEV_MODE: 'false',
    ADMIN_DEMO_MODE: 'false',
  };
  if (config.publicUrl) {
    props.PUBLIC_FORMS_BASE_URL = config.publicUrl;
    props.TAMU_FO_URL = config.publicUrl + '?page=tdd';
    props.TAMU_LUAR_URL = config.publicUrl + '?page=tld';
  }
  return props;
}

/** Same rules as normalizeVisitWhatsappPhone_ in Admin/VisitNotifications.js. */
function normalizeTestPhone(phone, label) {
  let target = String(phone || '').replace(/[\s().+-]/g, '');
  if (target.startsWith('0062')) target = '62' + target.slice(4);
  else if (target.startsWith('0')) target = '62' + target.slice(1);
  else if (target.startsWith('8')) target = '62' + target;
  if (!/^62\d{7,13}$/.test(target)) {
    throw new Error('.staging/config.json whatsappTest.' + label + ' is not a valid Indonesian WhatsApp number.');
  }
  return target;
}

/**
 * Optional WhatsApp test mode. Off unless .staging/config.json has
 *   "whatsappTest": { "enabled": true, "contactPhone": "08...", "picPhone": "08..." }
 * When on, staging sends real WhatsApp messages through Fonnte, but ONLY to these two numbers:
 * contactPhone receives every Narahubung message and picPhone every Penerima Tamu (PIC) message,
 * whatever numbers the visit or the PIC directory hold. The numbers stay in the gitignored config.
 */
function whatsappTestConfig(config) {
  const wa = config && config.whatsappTest;
  if (!wa || wa.enabled !== true) return null;
  return {
    contact: normalizeTestPhone(wa.contactPhone, 'contactPhone'),
    pic: normalizeTestPhone(wa.picPhone, 'picPhone'),
  };
}

const WHATSAPP_TEST_PREFIX = '[UJI STAGING - bukan produksi]\n';

// Every WhatsApp send path in Admin. Each anchor must match exactly once, or the build stops.
const WHATSAPP_TEST_PATCHES = [
  { file: 'VisitNotifications.js', find: 'sendVisitWhatsapp_(item.phone,', replace: 'sendVisitWhatsapp_(SITARI_STAGING_WA_TEST_.pic,' },
  { file: 'VisitWorkflowStorage.js', find: 'sendVisitWhatsapp_(data.visit.narahubung_hp,', replace: 'sendVisitWhatsapp_(SITARI_STAGING_WA_TEST_.contact,' },
  { file: 'VisitNotifications.js', find: 'const target=normalizeVisitWhatsappPhone_(phone);', replace: 'const target=stagingAssertWhatsappTarget_(normalizeVisitWhatsappPhone_(phone));' },
  { file: 'VisitNotifications.js', find: 'payload:{target:target,message:message,', replace: 'payload:{target:target,message:SITARI_STAGING_WA_PREFIX_+message,' },
];

/** Redirects every WhatsApp send to the test numbers. Fails closed if the Admin code no longer matches. */
function applyWhatsappTestPatches(files) {
  const out = Object.assign({}, files);
  for (const patch of WHATSAPP_TEST_PATCHES) {
    const text = out[patch.file];
    const count = text ? text.split(patch.find).length - 1 : 0;
    if (count !== 1) {
      throw new Error('Refusing to build: WhatsApp test anchor in ' + patch.file + ' matched ' + count +
        ' times (expected 1). Update WHATSAPP_TEST_PATCHES in maintenance/staging/build-staging.js.');
    }
    out[patch.file] = text.replace(patch.find, () => patch.replace);
  }
  assertWhatsappRedirected(out);
  return out;
}

/** Every WhatsApp send in the given files must go to a test number; no other file may call Fonnte. */
function assertWhatsappRedirected(files) {
  let fetchCalls = 0;
  for (const [name, text] of Object.entries(files)) {
    if (!/\.(js|html)$/.test(name)) continue;
    if (name !== 'VisitNotifications.js' && /fonnte\s*\.\s*com/i.test(text)) {
      throw new Error('Refusing to build: unexpected Fonnte reference in ' + name + '.');
    }
    // Exactly one outbound HTTP call may exist in Admin, the guarded one inside sendVisitWhatsapp_,
    // so a new or split Fonnte URL anywhere else cannot bypass the test-number check.
    const fetches = text.match(/UrlFetchApp\s*\.\s*fetch(All)?\s*\(/g) || [];
    if (fetches.length && name !== 'VisitNotifications.js') {
      throw new Error('Refusing to build: unexpected UrlFetchApp call in ' + name + '.');
    }
    fetchCalls += fetches.length;
    if (/[=:,(]\s*sendVisitWhatsapp_\s*[,);]/.test(text)) {
      throw new Error('Refusing to build: sendVisitWhatsapp_ is aliased in ' + name + '.');
    }
    for (const match of text.matchAll(/sendVisitWhatsapp_\s*\(([^,)]*)/g)) {
      if (text.slice(Math.max(0, match.index - 9), match.index) === 'function ') continue;
      if (!/^SITARI_STAGING_WA_TEST_\.(contact|pic)$/.test(match[1].trim())) {
        throw new Error('Refusing to build: WhatsApp call in ' + name + ' is not redirected to a test number.');
      }
    }
  }
  if (fetchCalls > 1) throw new Error('Refusing to build: more than one UrlFetchApp call in VisitNotifications.js.');
}

function readAdminBuild() {
  const files = {};
  for (const name of fs.readdirSync(ADMIN_DIR)) {
    if (/\.(js|html)$/.test(name)) files[name] = fs.readFileSync(path.join(ADMIN_DIR, name), 'utf8');
  }
  return files;
}

function stagingConfigSource(props, wa) {
  const lines = [
    '/** STAGING ONLY - generated by maintenance/staging/build-staging.js. Never push this file to production. */',
    'var SITARI_STAGING_PROPERTIES_ = Object.freeze(' + JSON.stringify(props, null, 2) + ');',
  ];
  if (wa) {
    lines.push(
      '// WhatsApp TEST mode: messages go out through Fonnte, but only to these two numbers.',
      'var SITARI_STAGING_WA_TEST_ = Object.freeze(' + JSON.stringify(wa) + ');',
      'var SITARI_STAGING_WA_PREFIX_ = ' + JSON.stringify(WHATSAPP_TEST_PREFIX) + ';',
      'function stagingAssertWhatsappTarget_(target) {',
      '  if (target !== SITARI_STAGING_WA_TEST_.contact && target !== SITARI_STAGING_WA_TEST_.pic) {',
      "    throw new Error('STAGING: nomor WhatsApp di luar daftar uji, pesan tidak dikirim.');",
      '  }',
      '  return target;',
      '}'
    );
  }
  lines.push(
    '// Runs before every entry point: pins this project to the staging spreadsheet/folders' +
      (wa ? ' and keeps WhatsApp in test mode.' : ','),
    wa ? '// FONNTE_TOKEN is kept: the owner sets it in this STAGING project\'s Script Properties.'
       : '// keeps WhatsApp (Fonnte) disabled and removes any token, so staging can never fall back to production.',
    '(function applySitariStagingProperties_() {',
    '  var store = PropertiesService.getScriptProperties();',
    '  var current = store.getProperties();',
    '  var changes = {};',
    '  Object.keys(SITARI_STAGING_PROPERTIES_).forEach(function (key) {',
    '    if (current[key] !== SITARI_STAGING_PROPERTIES_[key]) changes[key] = SITARI_STAGING_PROPERTIES_[key];',
    '  });',
    '  if (Object.keys(changes).length) store.setProperties(changes);'
  );
  if (!wa) lines.push("  if (current.FONNTE_TOKEN) store.deleteProperty('FONNTE_TOKEN');");
  lines.push('})();', '');
  return lines.join('\n');
}

const STAGING_BANNER = '<div style="position:sticky;top:0;z-index:9999;background:#b45309;color:#fff;text-align:center;font:600 12px/1.8 sans-serif;letter-spacing:.05em">STAGING - data uji, bukan produksi</div>';

function writeClasp(dir, scriptId) {
  const file = path.join(dir, '.clasp.json');
  if (scriptId) fs.writeFileSync(file, JSON.stringify({ scriptId, rootDir: '.' }, null, 2) + '\n');
  else fs.rmSync(file, { force: true });
}

function buildAdmin(config) {
  const wa = whatsappTestConfig(config);
  cleanDir(ADMIN_DIR);
  const source = path.join(ROOT, 'Admin');
  let files = {};
  for (const name of fs.readdirSync(source)) {
    if (name.startsWith('.') || name === 'PublicIntake.js') continue;
    const from = path.join(source, name);
    if (!fs.statSync(from).isFile()) continue;
    let text = fs.readFileSync(from, 'utf8');
    if (name === 'Index.html' || name === 'Presensi.html') {
      text = text.replace(/(<body(?:[^>"]|"[^"]*")*>)/, '$1\n' + STAGING_BANNER);
    }
    files[name] = text;
  }
  if (wa) files = applyWhatsappTestPatches(files);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(ADMIN_DIR, name), text);
  fs.writeFileSync(path.join(ADMIN_DIR, 'StagingConfig.js'), stagingConfigSource(stagingProperties(config), wa));
  fs.writeFileSync(path.join(ADMIN_DIR, '.claspignore'), '.clasp.json\n.claspignore\n*.md\n');
  writeClasp(ADMIN_DIR, config.adminScriptId);
}

function buildStagingPublic(config) {
  cleanDir(PUBLIC_DIR);
  const coreVersion = Number(config.adminCoreVersion) || 1;
  buildPublic({
    coreVersion,
    targetDir: path.relative(ROOT, PUBLIC_DIR),
    intakeFile: path.relative(ROOT, path.join(ADMIN_DIR, 'PublicIntake.js')),
  });
  // buildPublic copies PRODUCTION ids; replace them with staging ones (or remove them).
  const manifestPath = path.join(PUBLIC_DIR, 'appsscript.json');
  const manifest = readJson(manifestPath);
  manifest.dependencies.libraries[0].libraryId = config.adminScriptId || 'STAGING_ADMIN_NOT_CREATED';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  writeClasp(PUBLIC_DIR, config.publicScriptId);
  for (const name of ['Tld.html', 'Tdd.html', 'Presensi.html']) {
    const file = path.join(PUBLIC_DIR, name);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/(<body(?:[^>"]|"[^"]*")*>)/, '$1\n' + STAGING_BANNER));
  }
}

function assertNoProductionIdsInBuild() {
  const prod = productionIds();
  const offenders = [];
  for (const dir of [ADMIN_DIR, PUBLIC_DIR]) {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(json|js)$/.test(name)) continue;
      if (name === 'VisitWorkflowStorage.js') continue; // carries the personal-dev binding, inert outside production
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      for (const id of prod) if (text.includes(id)) offenders.push(path.relative(ROOT, path.join(dir, name)));
    }
  }
  if (offenders.length) throw new Error('Production id found in staging build: ' + [...new Set(offenders)].join(', '));
}

function buildStaging() {
  const config = loadConfig();
  assertSeparateFromProduction(config);
  buildAdmin(config);
  buildStagingPublic(config);
  assertNoProductionIdsInBuild();
  const wa = whatsappTestConfig(config);
  if (wa) assertWhatsappRedirected(readAdminBuild()); // also covers the generated PublicIntake.js
  return {
    admin: path.relative(ROOT, ADMIN_DIR),
    public: path.relative(ROOT, PUBLIC_DIR),
    adminScript: Boolean(config.adminScriptId),
    publicScript: Boolean(config.publicScriptId),
    coreVersion: Number(config.adminCoreVersion) || null,
    formUrlsSet: Boolean(config.publicUrl),
    whatsapp: wa ? 'TEST mode: sends only to the 2 test numbers in .staging/config.json' : 'off',
  };
}

if (require.main === module) {
  try { console.log(buildStaging()); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = {
  buildStaging, loadConfig, saveConfig, stagingProperties, stagingConfigSource,
  whatsappTestConfig, applyWhatsappTestPatches, assertWhatsappRedirected, WHATSAPP_TEST_PREFIX,
  STAGING, ADMIN_DIR, PUBLIC_DIR,
};
