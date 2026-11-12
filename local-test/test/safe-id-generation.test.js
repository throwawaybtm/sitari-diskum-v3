'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { destinations } = require('./synthetic-fixtures');

const ROOT = path.resolve(__dirname, '../..');
const SOURCES = ['fo', 'luar', 'bundle'];
const sourcePath = kind => kind === 'bundle'
  ? 'config-templates/Admin/PublicIntake.js.example'
  : `${kind === 'fo' ? 'Tamu-FO' : 'Tamu-Luar'}/Code.js`;
const readSource = kind => fs.readFileSync(path.join(ROOT, sourcePath(kind)), 'utf8');

function createSheet(name, initialRows, state) {
  let committed = initialRows.map(row => row.slice());
  let pending = committed.map(row => row.slice());
  const appends = [];
  return {
    appends,
    commit() { committed = pending.map(row => row.slice()); },
    rows() { return committed.map(row => row.slice()); },
    getLastRow() { return committed.length + 1; },
    getLastColumn() { return name === 'Data_Tamu' ? 21 : 17; },
    appendRow(row) {
      assert.equal(state.held, true, 'append requires the shared ScriptLock');
      if (state.writeError) throw new Error('synthetic write failure');
      pending.push(Array.from(row));
      appends.push(Array.from(row));
    },
    getRange(row, column, height = 1, width = 1) {
      assert.equal(state.held, true, 'read/sort requires the shared ScriptLock');
      return {
        setNumberFormat() { return this; },
        getValues() {
          return Array.from({ length: height }, (_, offset) =>
            Array.from({ length: width }, (_, cell) => committed[row - 2 + offset]?.[column - 1 + cell]));
        },
        getDisplayValues() { return this.getValues().map(values => values.map(value => String(value ?? ''))); },
        sort(specs) {
          pending.sort((a, b) => {
            for (const spec of specs) {
              const comparison = String(a[spec.column - 1] ?? '').localeCompare(String(b[spec.column - 1] ?? ''));
              if (comparison) return spec.ascending === false ? -comparison : comparison;
            }
            return 0;
          });
        }
      };
    }
  };
}

function visitorRow(id, serial = id) {
  const row = Array(21).fill('');
  row[0] = id;
  row[1] = `TDD-10112026-${String(serial).padStart(3, '0')}`;
  row[12] = '2026-11-10';
  row[13] = '09:00';
  return row;
}

function environment({ empty = false } = {}) {
  const state = { held: false, events: [], writeError: false, flushError: false };
  const sheets = {
    Data_Tamu: createSheet('Data_Tamu', empty ? [] : [visitorRow(38, 35), visitorRow(21, 18)], state),
    Kendali_SPPD: createSheet('Kendali_SPPD', empty ? [] : [[13, 24, 'TLD-05112026-021']], state)
  };
  const spreadsheet = { getSheetByName: name => sheets[name] || null };
  return {
    state, sheets, spreadsheet,
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          assert.equal(state.held, false, 'separate contexts must share one exclusive lock');
          state.held = true;
          state.events.push('wait');
        },
        releaseLock() {
          assert.equal(state.held, true);
          state.events.push('release');
          state.held = false;
        }
      })
    },
    SpreadsheetApp: {
      flush() {
        assert.equal(state.held, true, 'flush must happen before releasing the lock');
        state.events.push('flush');
        if (state.flushError) throw new Error('synthetic flush failure');
        Object.values(sheets).forEach(sheet => sheet.commit());
      }
    }
  };
}

function loadApi(kind, env) {
  const context = vm.createContext({
    Date,
    LockService: env.LockService,
    SpreadsheetApp: env.SpreadsheetApp,
    getSpreadsheet: () => env.spreadsheet,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'FOLDER_SURAT_ID' ? 'synthetic-folder' : null }) },
    Utilities: {
      formatDate: (_date, _zone, format) => ({
        'yyyy-MM-dd': '2026-11-11', 'HH:mm': '11:20',
        'yyyy-MM-dd HH:mm:ss': '2026-11-11 11:20:00'
      }[format]),
      base64Decode: value => Buffer.from(value, 'base64'),
      newBlob: (_bytes, _type, name) => ({ name })
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone' }, Permission: { VIEW: 'view' },
      getFolderById: () => ({ createFile: () => ({ setSharing() {}, getUrl: () => 'https://example.invalid/document' }) })
    }
  });
  if (kind === 'bundle') {
    // Replace only fixture contact arrays. Exercise the template's actual implementation.
    const source = readSource(kind).replace(/const (TLD_DESTINATIONS|TDD_DESTINATIONS) = \[.*?\];/gs,
      (_, symbol) => `const ${symbol} = ${JSON.stringify(destinations)};`);
    vm.runInContext(source, context);
    return context.SI_TARI_INTAKE_;
  }
  const directoryPath = kind === 'fo' ? 'Tamu-FO/Destinations.js' : 'Tamu-Luar/Destinations.js';
  vm.runInContext(fs.readFileSync(path.join(ROOT, directoryPath), 'utf8'), context);
  vm.runInContext(readSource(kind), context);
  context.getSharedSpreadsheet_ = () => env.spreadsheet;
  context.saveBase64ToDrive_ = () => 'https://example.invalid/document';
  return context;
}

function payload(kind, index = 1) {
  return {
    instansi: `Synthetic organization ${index}`, alamat: 'Synthetic city',
    jumlah_orang: 2, ketua_nama: `Synthetic visitor ${index}`, pengikut_list: 'Synthetic companion',
    tujuan_bidang: [destinations[4].bidang], keperluan: 'Synthetic consultation',
    narahubung_hp: '620000000001', tanggal_kunjungan: '2026-11-12', jam_kunjungan: '10:00',
    surat_kunjungan_base64: kind === 'fo' ? '' : 'data:application/pdf;base64,JVBERg==',
    surat_tugas_base64: kind === 'fo' ? '' : 'data:application/pdf;base64,JVBERg=='
  };
}

test('intake ID helpers handle empty, sorted, gapped, duplicate and invalid numeric IDs', () => {
  const empty = { getLastRow: () => 1, getRange: () => assert.fail('header-only sheets require no data read') };
  const values = [[19], [''], ['  '], ['invalid'], [true], [false], [null], [38], [30], ['24'], [38], [Infinity]];
  const messy = { getLastRow: () => values.length + 1, getRange: () => ({ getValues: () => values }) };
  for (const kind of SOURCES) {
    const context = vm.createContext({});
    const helper = readSource(kind).match(/function nextRecordId_\(sheet\) \{[^]*?\n\}/);
    assert.ok(helper, `${kind} declares the shared max-ID helper`);
    vm.runInContext(helper[0], context);
    assert.equal(context.nextRecordId_(empty), 1, kind);
    assert.equal(context.nextRecordId_(null), 1, kind);
    assert.equal(context.nextRecordId_(messy), 39, kind);
    assert.equal(context.nextRecordId_({ getLastRow: () => 3, getRange: () => ({ getValues: () => [[38], [21]] }) }), 39, kind);
  }
});

test('standalone and template intakes initialize empty IDs and preserve SPPD foreign keys', () => {
  for (const bundle of [false, true]) {
    const env = environment({ empty: true });
    const fo = loadApi(bundle ? 'bundle' : 'fo', env);
    const luar = bundle ? fo : loadApi('luar', env);
    assert.equal(fo.registerTamuFo(payload('fo')).success, true);
    assert.equal(luar.registerTamuLuar(payload('luar')).success, true);
    assert.deepEqual(env.sheets.Data_Tamu.appends.map(row => row[0]), [1, 2]);
    assert.deepEqual(env.sheets.Kendali_SPPD.appends.map(row => row.slice(0, 2)), [[1, 2]]);
  }
});

test('separate intake contexts see flushed max IDs under one shared script lock', () => {
  for (const bundle of [false, true]) {
    const env = environment();
    const first = loadApi(bundle ? 'bundle' : 'fo', env);
    const second = loadApi(bundle ? 'bundle' : 'luar', env);
    assert.equal(first.registerTamuFo(payload('fo', 1)).success, true);
    assert.equal(second.registerTamuLuar(payload('luar', 2)).success, true);
    assert.equal(first.registerTamuFo(payload('fo', 3)).success, true);
    assert.equal(second.registerTamuLuar(payload('luar', 4)).success, true);
    assert.deepEqual(env.sheets.Data_Tamu.appends.map(row => row[0]), [39, 40, 41, 42]);
    assert.deepEqual(env.sheets.Kendali_SPPD.appends.map(row => row.slice(0, 2)), [[14, 40], [15, 42]]);
    assert.equal(new Set(env.sheets.Data_Tamu.rows().map(row => row[0])).size, 6);
    assert.deepEqual(env.state.events, Array(4).fill(['wait', 'flush', 'release']).flat());
    assert.equal(env.state.held, false);
  }
});

test('intake locks release on write and flush errors across standalone and template paths', () => {
  for (const kind of SOURCES) {
    for (const failure of ['writeError', 'flushError']) {
      const env = environment();
      const api = loadApi(kind, env);
      env.state[failure] = true;
      const method = kind === 'luar' ? 'registerTamuLuar' : 'registerTamuFo';
      assert.throws(() => api[method](payload(kind)), /synthetic (write|flush) failure/, `${kind} ${failure}`);
      assert.equal(env.state.held, false, `${kind} ${failure} releases lock`);
      assert.deepEqual(env.state.events, ['wait', 'flush', 'release']);
    }
  }
});
