'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { destinations } = require('./synthetic-fixtures');

const ROOT = path.resolve(__dirname, '../..');
function formatDate(date, timeZone, format) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).forEach(part => { parts[part.type] = part.value; });
  if (format === 'HH:mm') return `${parts.hour}:${parts.minute}`;
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function contextFor(rows, timeZone = 'America/New_York') {
  const sheet = {
    getLastRow: () => rows.length + 1, getLastColumn: () => 21,
    getRange: (row, column, count = 1, width = 1) => ({
      getValues: () => rows.slice(row - 2, row - 2 + count).map(values => values.slice(column - 1, column - 1 + width))
    })
  };
  const ss = { getSpreadsheetTimeZone: () => timeZone, getSheetByName: name => name === 'Data_Tamu' ? sheet : null };
  const context = vm.createContext({ Date, Utilities: { formatDate }, getSpreadsheet: () => ss });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Admin/Code.js'), 'utf8'), context);
  context.getSpreadsheet = () => ss;
  return { context, ss };
}
function visit(id, date, time) {
  const row = Array(21).fill('');
  row[0] = id; row[1] = `TLD-12112026-${String(id).padStart(3, '0')}`;
  row[2] = 'luar_daerah'; row[12] = date; row[13] = time;
  return row;
}

test('legacy Sheets wall-time Date cells display 10:00 through list, dashboard and visit lookup without mutating history', () => {
  for (const [date, time] of [
    [new Date('2026-11-12T05:00:00Z'), new Date('1899-12-30T15:00:00Z')],
    [new Date('2027-07-12T04:00:00Z'), new Date('2027-07-12T14:00:00Z')]
  ]) {
    const rows = [visit(1, date, time)];
    const before = JSON.stringify(rows);
    const { context, ss } = contextFor(rows);
    assert.equal(context.getTamuList_(ss).data[0].jam_kunjungan, '10:00');
    assert.equal(context.readDashboardData_(false).data.recentTamu[0].jam_kunjungan, '10:00');
    assert.equal(context.getVisitByCode_(ss, rows[0][1]).jam_kunjungan, '10:00');
    assert.equal(JSON.stringify(rows), before);
  }
});

test('visit wall-time strings retain their exact hour and sheet-local midnight retains its date', () => {
  const rows = [visit(1, new Date('2026-11-12T05:00:00Z'), '10:00')];
  const { context, ss } = contextFor(rows);
  const record = context.getTamuList_(ss).data[0];
  assert.equal(record.tanggal_kunjungan, '2026-11-12');
  assert.equal(record.jam_kunjungan, '10:00');
  assert.equal(context.normalizeJakartaDateKey_('2026-11-11T18:00:00Z'), '2026-11-12', 'actual ISO instants keep Jakarta semantics');
});

test('FO submission stores server Jakarta wall date/time as text on the physical append row before writing', () => {
  const operations = [];
  const rows = [visit(90, '2026-11-12', '09:00')];
  const sheet = {
    getLastRow: () => rows.length + 1, getLastColumn: () => 21,
    getRange: (row, column, height = 1, width = 1) => ({
      getValues: () => rows.slice(row - 2, row - 2 + height).map(values => values.slice(column - 1, column - 1 + width)),
      getDisplayValues: () => rows.slice(row - 2, row - 2 + height).map(values => values.slice(column - 1, column - 1 + width).map(value => String(value ?? ''))),
      setNumberFormat: value => operations.push(['format', row, column, height, width, value]),
      sort() {}
    }),
    appendRow: row => { operations.push(['append', row[12], row[13]]); rows.push(Array.from(row)); }
  };
  const context = vm.createContext({
    Date, Utilities: { formatDate: (_date, _zone, format) => format === 'HH:mm' ? '10:00' : format === 'yyyy-MM-dd' ? '2026-11-12' : '2026-11-12 10:00:00' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} }
  });
  vm.runInContext('const TDD_DESTINATIONS = ' + JSON.stringify(destinations) + ';', context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Tamu-FO/Destinations.js'), 'utf8').replace(/const TDD_DESTINATIONS = \[.*?\];/s, ''), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Tamu-FO/Code.js'), 'utf8'), context);
  context.getSharedSpreadsheet_ = () => ({ getSheetByName: name => name === 'Data_Tamu' ? sheet : null });
  context.registerTamuFo({ ketua_nama: 'Synthetic visitor', pengikut_list: 'Synthetic companion', jumlah_orang: 2, narahubung_hp: '620000000001', tujuan_bidang: [destinations[4].bidang], keperluan: 'Synthetic visit' });
  assert.deepEqual(operations.slice(0, 2), [['format', 3, 13, 1, 2, '@'], ['append', '2026-11-12', '10:00']]);
});
