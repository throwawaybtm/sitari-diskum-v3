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
