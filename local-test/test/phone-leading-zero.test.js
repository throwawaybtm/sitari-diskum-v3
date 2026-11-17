'use strict';

// Client revision: "Penomoran whatsapp apakah bisa sesuai yg diinput? 081234567890 sesuai dengan yang
// akan muncul di semua data nomor tersebut." The Data_Tamu cell must keep the leading 0, not only the UI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { completeTldPayload } = require('./tld-test-data');
const { completeTddPayload } = require('./tdd-test-data');

const ROOT = path.resolve(__dirname, '../..');
const SOURCES = {
  luar: ['Tamu-Luar/Destinations.js', 'Tamu-Luar/Code.js'],
  fo: ['Tamu-FO/Destinations.js', 'Tamu-FO/Code.js'],
  bundle: ['config-templates/Admin/PublicIntake.js.example']
};

// Emulates Google Sheets: appendRow/setValue parse numeric-looking text into numbers (dropping the
// leading 0) unless the target cell is already Plain text ('@').
function sheetsValue(value, textFormat) {
  if (textFormat || typeof value !== 'string' || !/^\d+$/.test(value.trim())) return value;
  return Number(value);
}

function makeSheet() {
  const cells = {};
  const formats = {};
  const key = (r, c) => r + ':' + c;
  const sheet = {
    lastRow: 1,
    getLastRow() { return this.lastRow; },
    getLastColumn: () => 21,
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        setNumberFormat(fmt) {
          for (let r = 0; r < numRows; r += 1) for (let c = 0; c < numCols; c += 1) formats[key(row + r, col + c)] = fmt;
          return this;
        },
        setValue(value) { cells[key(row, col)] = sheetsValue(value, formats[key(row, col)] === '@'); return this; },
        getValues: () => [],
        sort() {}
      };
    },
    // Real appendRow ignores a Plain text format prepared on the next row; that is how live rows lost the 0.
    appendRow(values) {
      sheet.lastRow += 1;
      values.forEach((value, i) => { cells[key(sheet.lastRow, i + 1)] = sheetsValue(value, false); });
    },
    cell: (row, col) => cells[key(row, col)]
  };
  return sheet;
}

function load(kind) {
  const sheets = {};
  const sheetFor = name => sheets[name] || (sheets[name] = makeSheet());
  const spreadsheet = { getSheetByName: sheetFor };
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} },
    getSpreadsheet: () => spreadsheet,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'synthetic-folder', setProperty() {} }) },
    Utilities: {
      formatDate: (_d, _z, format) => ({ 'yyyy-MM-dd': '2026-11-16', 'HH:mm': '10:00', 'yyyy-MM-dd HH:mm:ss': '2026-11-16 10:00:00', ddMMyyyy: '16112026' }[format]),
      base64Decode: value => Buffer.from(value, 'base64'),
      newBlob: (_bytes, _type, name) => ({ name })
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone' }, Permission: { VIEW: 'view' },
      getFolderById: () => ({
        createFile: blob => ({ setSharing() {}, setTrashed() {}, getUrl: () => 'https://drive.google.com/file/d/' + blob.name + '/view' })
      })
    }
  });
  for (const file of SOURCES[kind]) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);
  const api = kind === 'bundle' ? context.SI_TARI_INTAKE_ : context;
  if (kind !== 'bundle') {
    context.getSharedSpreadsheet_ = () => spreadsheet;
    context.sortTamu_ = () => {};
    context.sortSppd_ = () => {};
  }
  const tamu = sheetFor('Data_Tamu');
  return { api, phoneCell: () => tamu.cell(tamu.getLastRow(), 12) };
}

const PHONE = '081234567890';

for (const kind of ['luar', 'bundle']) {
  test(`${kind}: TLD WhatsApp number is stored exactly as typed, leading 0 kept`, () => {
    const { api, phoneCell } = load(kind);
    api.registerTamuLuar(completeTldPayload({ narahubung_hp: PHONE }));
    assert.equal(phoneCell(), PHONE);
  });
}

for (const kind of ['fo', 'bundle']) {
  test(`${kind}: TDD WhatsApp number is stored exactly as typed, leading 0 kept`, () => {
    const { api, phoneCell } = load(kind);
    api.registerTamuFo(completeTddPayload({ narahubung_hp: PHONE }));
    assert.equal(phoneCell(), PHONE);
  });
}

test('bundle: a +62 number is stored as typed too', () => {
  const { api, phoneCell } = load('bundle');
  api.registerTamuLuar(completeTldPayload({ narahubung_hp: '+6281234567890' }));
  assert.equal(phoneCell(), '+6281234567890');
});
