'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function backend({ tipe, existing = [] }) {
  const context = vm.createContext({
    Utilities: { formatDate: () => '2026-11-12 10:05:00' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
  });
  for (const file of ['Code.js', 'MeetingRooms.js', 'VisitWorkflow.js', 'VisitWorkflowStorage.js']) {
    vm.runInContext(fs.readFileSync('Admin/' + file, 'utf8'), context);
  }
  const tamuRows = [[1, 'TLD-12112026-001', tipe, '', '', 1, '', '', '', '', '', '', '2026-11-12', '09:00']];
  const writes = [];
  const tamu = {
    getLastRow: () => tamuRows.length + 1,
    getRange: (row, column, height = 1, width = 1) => ({
      getValues: () => tamuRows.slice(row - 2, row - 2 + height).map(r => r.slice(column - 1, column - 1 + width)),
      setNumberFormat() { return this; },
      setValue(value) { tamuRows[row - 2][column - 1] = value; return this; }
    })
  };
  const presensi = {
    getLastRow: () => writes.length + 1, getLastColumn: () => 13,
    getRange: () => ({ setValue() {}, setValues() {}, setNumberFormat() { return this; } }),
    appendRow: r => writes.push(Array.from(r))
  };
  context.getSpreadsheet = () => ({ getSheetByName: n => n === 'Data_Tamu' ? tamu : n === 'Data_Presensi' ? presensi : null });
  context.autoSortPresensi = () => {};
  const meeting = { id: 7, tanggal: '2026-11-12', jam_mulai: '09:00', jam_selesai: '11:00', status: 'Aktif', kode_kunjungan: 'TLD-12112026-001' };
  context.getRapatCalendar_ = context.getRapatCalendar = () => ({ data: [meeting] });
  context.attendanceAvailability_ = () => ({ open: true });
  context.validateVisitAttendanceWrite_ = () => {};
  context.visitAttendanceForAgenda_ = () => ({ visit: { kode_kunjungan: 'TLD-12112026-001', tipe_tamu: tipe }, attendance: existing });
  context.resolveVisitAttendee_ = (visit, p) => ({ nama: p.nama, member_id: 'm1' });
  context.hasVisitAttendance_ = () => false;
  return { context, tamuRows };
}

test('TLD keeps its scheduled time in Buku Tamu after the first check-in', () => {
  const { context, tamuRows } = backend({ tipe: 'luar_daerah' });
  const res = context.submitPresensiRapat({ rapat_id: 7, nama: 'Tamu Satu', jabatan: 'Ketua' });
  assert.equal(res.success, true, res.error);
  assert.equal(tamuRows[0][13], '09:00');
});

test('TLD keeps its scheduled time when later attendees check in', () => {
  const { context, tamuRows } = backend({ tipe: 'luar_daerah', existing: [{ waktu: '12-11-2026 09:48' }] });
  context.submitPresensiRapat({ rapat_id: 7, nama: 'Tamu Dua', jabatan: 'Anggota' });
  assert.equal(tamuRows[0][13], '09:00');
});

test('TDD arrival time is never overwritten by presensi', () => {
  const { context, tamuRows } = backend({ tipe: 'dalam_daerah_fo' });
  context.submitPresensiRapat({ rapat_id: 7, nama: 'Tamu Tiga', jabatan: 'Anggota' });
  assert.equal(tamuRows[0][13], '09:00');
});

test('formatTimeVal normalises 12-hour text to 24-hour WIB wall time', () => {
  const context = vm.createContext({ Utilities: {}, Intl });
  vm.runInContext(fs.readFileSync('Admin/Code.js', 'utf8'), context);
  assert.equal(context.formatTimeVal('2:30 PM'), '14:30');
  assert.equal(context.formatTimeVal('12:05 AM'), '00:05');
  assert.equal(context.formatTimeVal('12:15 PM'), '12:15');
  assert.equal(context.formatTimeVal('09:30:00'), '09:30');
  assert.equal(context.formatTimeVal(''), '');
});

test('guestbook shows - when a legacy row has no time', () => {
  const html = fs.readFileSync('Admin/Index.html', 'utf8');
  assert.match(html, /t\.jam_kunjungan \? escapeHtml\(t\.jam_kunjungan\) \+ ' WIB' : '-'/);
});
