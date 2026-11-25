'use strict';
// Rapat Pimpinan (leaders) come from Master_Pegawai columns J "Urutan_Pimpinan" and K "Unit_Pimpinan",
// served through the cached master read. These tests use only synthetic people.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { employees, leaders, masterPegawaiRow } = require('./synthetic-fixtures');

const HEADER = ['ID', 'NIP', 'Nama Pegawai', 'Jabatan', 'Bidang', 'Is_LO', 'Workload_Count', 'Status_Aktif', 'Pangkat / Golongan', 'Urutan_Pimpinan', 'Unit_Pimpinan'];

/** Fake spreadsheet that counts every getRange call (one call = one sheet read). */
function fakeSpreadsheet(pegawaiRows, width) {
  const reads = [];
  const rooms = [[6001, 'Ruang Rapat Utama Diskum', 50, 'Proyektor', 'Lantai 1', 'blue']];
  const sheet = (name, rows, cols) => ({
    getLastRow: () => rows.length + 1,
    getLastColumn: () => cols,
    getRange: (row, col, numRows, numCols) => {
      reads.push(name);
      return { getValues: () => rows.slice(row - 2, row - 2 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)) };
    }
  });
  const sheets = {
    Master_Pegawai: sheet('Master_Pegawai', pegawaiRows, width),
    Master_Ruangan: sheet('Master_Ruangan', rooms, 6)
  };
  return { reads, ss: { getId: () => 'ss-synthetic', getSheetByName: name => sheets[name] || null } };
}

function fakeCache() {
  const store = new Map();
  return { store, getScriptCache: () => ({
    get: key => store.has(key) ? store.get(key) : null,
    put: (key, value, ttl) => { store.set(key, value); store.ttl = ttl; },
    remove: key => store.delete(key)
  }) };
}

function loadAdmin({ rows = employees.map(masterPegawaiRow), width = HEADER.length, cache } = {}) {
  const context = vm.createContext({});
  for (const file of ['Admin/MeetingRooms.js', 'Admin/Code.js', 'Admin/AgendaAttendanceData.js', 'Admin/AgendaDocuments.js', 'Admin/PublicApi.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  }
  const sheet = fakeSpreadsheet(rows.map(r => r.slice(0, width)), width);
  context.requireVisitAdmin_ = () => {};
  context.getSpreadsheet = () => sheet.ss;
  if (cache) context.CacheService = cache;
  return { context, ...sheet };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('getMasterData returns the leaders from Master_Pegawai J/K in leadership order', () => {
  const { context } = loadAdmin();
  const res = plain(context.getMasterData());
  assert.equal(res.success, true, res.error);
  assert.deepEqual(res.data.pimpinan, leaders);
  assert.equal(res.data.pegawai.length, employees.length);
  assert.deepEqual(Object.keys(res.data.pegawai[0]).sort(), ['bidang', 'id', 'jabatan', 'nama', 'nip', 'pangkat'], 'pegawai rows keep their existing shape');
});

test('a sheet without the leader columns (A..I only) still loads; the leader list is empty', () => {
  const { context, reads } = loadAdmin({ width: 9 });
  const res = plain(context.getMasterData());
  assert.equal(res.success, true, res.error);
  assert.deepEqual(res.data.pimpinan, []);
  assert.equal(res.data.pegawai.length, employees.length);
  assert.deepEqual(plain(context.getMeetingRoomOptions()).data.pimpinan, []);
  assert.ok(reads.length > 0);
});

test('blank, zero or non-numeric Urutan_Pimpinan is not a leader; ties keep sheet order', () => {
  const rows = employees.slice(0, 4).map(masterPegawaiRow).map(r => r.slice(0, 9).concat(['', '']));
  rows[0][9] = 2; rows[0][10] = 'Sekretariat';
  rows[1][9] = 'abc'; rows[2][9] = 0;
  rows[3][9] = '1'; rows[3][10] = 'Dinas';
  const { context } = loadAdmin({ rows });
  const list = plain(context.getMasterData()).data.pimpinan;
  assert.deepEqual(list.map(l => [l.no, l.nama, l.bidang]), [[1, employees[3].nama, 'Dinas'], [2, employees[0].nama, 'Sekretariat']]);
});

test('Public master data never carries the leader list or extra leader fields', () => {
  const { context } = loadAdmin();
  const res = plain(context.getPublicAttendanceMasterData());
  assert.equal(res.success, true, res.error);
  assert.deepEqual(Object.keys(res.data).sort(), ['opd', 'pegawai']);
  for (const row of res.data.pegawai) assert.deepEqual(Object.keys(row).sort(), ['bidang', 'id', 'jabatan', 'nama', 'nip']);
});

test('meeting modal room call serves rooms and leaders from one cached master read', () => {
  const cache = fakeCache();
  const { context, reads } = loadAdmin({ cache });
  const cold = plain(context.getMeetingRoomOptions());
  assert.deepEqual(reads, ['Master_Pegawai', 'Master_Ruangan'], 'cold cache: one master read (2 sheets)');
  assert.deepEqual(cold.data.pimpinan, leaders);
  assert.deepEqual(cold.data.ruangan, plain(context.readMeetingRoomOptions_(context.getSpreadsheet())), 'same rooms as the rooms-only reader');
  const master = plain(context.getMasterData());
  assert.deepEqual(master.data.pimpinan, cold.data.pimpinan);
  const warm = reads.length;
  assert.equal(warm, 3, 'getMasterData reused the cache (the extra read is the comparison above)');
  plain(context.getMeetingRoomOptions());
  plain(context.getMasterData());
  assert.equal(reads.length, warm, 'warm cache: zero sheet reads');
  assert.ok([...cache.store.keys()].every(key => key.startsWith('si-tari:master:v3:')), 'new cache key version for the new shape');
  assert.equal(cache.store.ttl, 120, 'leader edits show after at most 120 s');
});

test('E-Notula context lists leaders and matches the chair from Master_Pegawai without a second list', () => {
  const { context } = loadAdmin();
  const rowsEmployees = plain(context.readNotulaEmployeeRows_(context.getSpreadsheet()));
  const data = plain(context.buildAgendaNotulaContextData_({ id: 9, pimpinan_rapat: leaders[1].nama }, [], rowsEmployees, ''));
  assert.deepEqual(data.pimpinan, leaders);
  assert.equal(data.pimpinanMatch.nip, leaders[1].nip);
  assert.equal(data.pimpinanMatch.pangkat, leaders[1].pangkat_golongan);
});

test('no leader identities remain in tracked Admin sources', () => {
  for (const file of ['Admin/RapatPimpinan.html', 'Admin/AgendaAttendanceData.js', 'Admin/AgendaDocuments.js', 'Admin/NotulaPdf.html']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /OFFICIAL_LEADERSHIP_ORDER_\s*=/, file);
    assert.doesNotMatch(source, /RAPAT_PIMPINAN_DIRECTORY\s*=\s*Object\.freeze\(\[\s*\{/, file);
    assert.doesNotMatch(source, /\d{8} \d{6} [12] \d{3}/, file + ': NIP-shaped value');
  }
});
