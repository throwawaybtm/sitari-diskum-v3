'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'config-templates');
const EMPLOYEE_JS_PATH = path.join(ROOT, 'Admin', 'EmployeeDirectory.js');
const EMPLOYEE_JSON_PATH = path.join(ROOT, 'local-test', 'previews', 'employee-directory.json');

/** Enumerate relative file paths inside a directory tree. */
function walkFiles(dir, baseDir = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, baseDir));
    else out.push(path.relative(baseDir, full));
  }
  return out;
}

/** List all gitignored config/test template mappings from config-templates/. */
function listTemplateMappings() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    throw new Error('config-templates directory not found.');
  }
  return walkFiles(TEMPLATES_DIR)
    .filter(rel => rel.endsWith('.example'))
    .sort()
    .map(rel => ({
      templatePath: path.join(TEMPLATES_DIR, rel),
      targetRel: rel.slice(0, -'.example'.length).replace(/\\/g, '/'),
      targetPath: path.join(ROOT, rel.slice(0, -'.example'.length))
    }));
}

/** Copy sanitized .example templates into gitignored paths without overwriting existing files unless forced. */
function bootstrapTemplates({ force = false } = {}) {
  const mappings = listTemplateMappings();
  const created = [];
  const skipped = [];
  for (const item of mappings) {
    if (fs.existsSync(item.targetPath) && !force) {
      skipped.push(item.targetRel);
      continue;
    }
    fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });
    fs.copyFileSync(item.templatePath, item.targetPath);
    created.push(item.targetRel);
  }
  return { total: mappings.length, created, skipped };
}

/** Detect CSV delimiter outside quotes from the first line. */
function detectDelimiter(text) {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch === ',') commas++;
    else if (!inQuotes && ch === ';') semicolons++;
  }
  return commas === 0 && semicolons > 0 ? ';' : ',';
}

/** Parse RFC-4180 CSV text (supporting UTF-8 BOM, quoted fields, and comma or semicolon delimiters). */
function parseCsv(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(v => String(v || '').trim() !== ''));
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cleanNip(value) {
  const trimmed = String(value || '').replace(/^'/, '').trim();
  return trimmed === '-' ? '' : trimmed;
}

/** Convert an authorized Master_Pegawai CSV export into Admin/EmployeeDirectory.js and local-test preview JSON. */
function importEmployeeCsv(csvFilePath) {
  const resolved = path.resolve(csvFilePath);
  if (!fs.existsSync(resolved)) {
    throw new Error('CSV file not found: ' + resolved);
  }
  const rows = parseCsv(fs.readFileSync(resolved, 'utf8'));
  if (rows.length < 2) {
    throw new Error('Master_Pegawai CSV must include a header row and at least one employee row.');
  }

  const headers = rows[0].map(normalizeHeader);
  const findCol = (aliases, fallback) => {
    const idx = headers.findIndex(h => aliases.includes(h));
    return idx >= 0 ? idx : fallback;
  };
  const col = {
    id: findCol(['id'], 0),
    nip: findCol(['nip'], 1),
    nama: findCol(['nama pegawai', 'nama'], 2),
    jabatan: findCol(['jabatan'], 3),
    bidang: findCol(['bidang', 'unit'], 4),
    status: findCol(['status aktif', 'status'], 7),
    pangkat: findCol(['pangkat golongan', 'pangkat', 'golongan'], 8)
  };

  if (col.nama >= headers.length || col.bidang >= headers.length) {
    throw new Error('Master_Pegawai CSV is missing required Nama Pegawai / Bidang columns.');
  }

  const jsEntries = [];
  const jsonEntries = [];
  rows.slice(1).forEach((r, idx) => {
    const nama = String(r[col.nama] || '').trim();
    const bidang = String(r[col.bidang] || '').trim();
    if (!nama || !bidang) return;
    const status = col.status < r.length ? String(r[col.status] || '').trim().toLowerCase() : '';
    if (status && status !== 'aktif') return;

    const rawId = col.id < r.length ? String(r[col.id] || '').trim() : '';
    const numId = /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : idx + 1;
    const record = {
      id: numId,
      nip: col.nip < r.length ? cleanNip(r[col.nip]) : '',
      nama,
      jabatan: col.jabatan < r.length ? String(r[col.jabatan] || '').trim() : '',
      bidang,
      pangkat: col.pangkat < r.length ? String(r[col.pangkat] || '').trim() : ''
    };
    jsEntries.push(record);
    jsonEntries.push({ ...record, id: String(rawId || numId) });
  });

  if (!jsEntries.length) {
    throw new Error('No active employee rows found in Master_Pegawai CSV.');
  }

  fs.mkdirSync(path.dirname(EMPLOYEE_JS_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(EMPLOYEE_JSON_PATH), { recursive: true });
  fs.writeFileSync(
    EMPLOYEE_JS_PATH,
    '/** Private employee directory mapped from Master_Pegawai export. */\n' +
      'const DISKUM_EMPLOYEE_DIRECTORY = ' + JSON.stringify(jsEntries) + ';\n',
    'utf8'
  );
  fs.writeFileSync(EMPLOYEE_JSON_PATH, JSON.stringify(jsonEntries, null, 2) + '\n', 'utf8');

  return {
    count: jsEntries.length,
    departments: new Set(jsEntries.map(e => e.bidang)).size,
    withoutNip: jsEntries.filter(e => !e.nip).length
  };
}

/** Check local presence and non-empty employee dataset status without exposing private values. */
function checkLocalSetup() {
  const mappings = listTemplateMappings();
  const missing = mappings.filter(m => !fs.existsSync(m.targetPath)).map(m => m.targetRel);
  let jsEmployees = 0;
  let jsonEmployees = 0;
  if (fs.existsSync(EMPLOYEE_JS_PATH)) {
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(EMPLOYEE_JS_PATH, 'utf8'), ctx);
    const list = vm.runInContext('DISKUM_EMPLOYEE_DIRECTORY', ctx);
    if (Array.isArray(list)) jsEmployees = list.length;
  }
  if (fs.existsSync(EMPLOYEE_JSON_PATH)) {
    const list = JSON.parse(fs.readFileSync(EMPLOYEE_JSON_PATH, 'utf8'));
    if (Array.isArray(list)) jsonEmployees = list.length;
  }
  return {
    totalRequired: mappings.length,
    presentCount: mappings.length - missing.length,
    missing,
    jsEmployees,
    jsonEmployees,
    readyForFullSuite: missing.length === 0 && jsEmployees === 70 && jsonEmployees === 70
  };
}

function parseArgs(argv) {
  const args = { fromTemplates: false, force: false, check: false, csv: '' };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--from-templates') args.fromTemplates = true;
    else if (token === '--force') args.force = true;
    else if (token === '--check') args.check = true;
    else if (token === '--csv') {
      args.csv = argv[i + 1] || '';
      i++;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else {
      throw new Error('Unknown option: ' + token);
    }
  }
  return args;
}

if (require.main === module) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help || (!opts.fromTemplates && !opts.csv && !opts.check)) {
      console.log([
        'Usage: node local-test/setup-local.js [--from-templates] [--csv <Master_Pegawai.csv>] [--check] [--force]',
        '  --from-templates   Copy missing gitignored config/test files from config-templates/',
        '  --csv <path>       Import authorized Master_Pegawai CSV into gitignored employee files',
        '  --check            Verify presence of required gitignored files (non-sensitive summary)',
        '  --force            Overwrite existing gitignored files when used with --from-templates'
      ].join('\n'));
      process.exit(opts.help ? 0 : 1);
    }
    if (opts.fromTemplates) {
      const tpl = bootstrapTemplates({ force: opts.force });
      console.log(`Templates checked (${tpl.total}): ${tpl.created.length} created, ${tpl.skipped.length} kept.`);
    }
    if (opts.csv) {
      const imp = importEmployeeCsv(opts.csv);
      console.log(`Employee directory imported: ${imp.count} records across ${imp.departments} units (${imp.withoutNip} without NIP).`);
    }
    if (opts.check || opts.fromTemplates || opts.csv) {
      const status = checkLocalSetup();
      console.log(
        `Setup check: ${status.presentCount}/${status.totalRequired} gitignored files present; ` +
          `EmployeeDirectory=${status.jsEmployees}, preview JSON=${status.jsonEmployees}.`
      );
      if (status.missing.length) {
        console.log('Missing files:', status.missing.join(', '));
      } else if (!status.readyForFullSuite) {
        console.log('Note: Import the authorized 70-record Master_Pegawai CSV for full employee-import & hierarchy test parity.');
      }
      if (opts.check && !status.readyForFullSuite) process.exit(1);
    }
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  bootstrapTemplates,
  checkLocalSetup,
  importEmployeeCsv,
  listTemplateMappings,
  parseCsv
};
