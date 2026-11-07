'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
  const fields={};
  const context=vm.createContext({Intl,Date,allRapatData:[],allTamuData:[],
    escapeHtml:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    getMeetingRoomInfo:name=>({name}),
    document:{getElementById:id=>fields[id]||= {innerHTML:'',textContent:'',showModal(){this.open=true;},close(){this.open=false;}}}
  });
  vm.runInContext(fs.readFileSync('Admin/BookingCalendar.html','utf8').match(/<script>([^]*?)<\/script>/)[1],context);
  return {context,fields};
}
test('booking calendar separates dates, sorts 24h times and excludes cancelled agendas',()=>{
  const {context:c}=setup();
  const rows=[{id:1,tanggal:'2026-11-02',jam_mulai:'14:00'},{id:2,tanggal:'2026-11-02',jam_mulai:'09:00'},
    {id:3,tanggal:'2026-11-03'},{id:4,tanggal:'2026-11-02',status:'Dibatalkan'},{id:5,tanggal:'2026-11-02',jam_mulai:'08:00',status:'Selesai'}];
  assert.deepEqual(Array.from(c.bookingsOnDate('2026-11-02',rows),r=>r.id),[5,2,1]);
  assert.equal(c.bookingsOnDate('2026-11-04',rows).length,0);
});
test('calendar classifies all agenda types including visit codes and linked TDD',()=>{
  const {context:c}=setup();c.allTamuData=[{kode_kunjungan:'legacy',tipe_tamu:'dalam_daerah_fo'}];
  assert.equal(c.bookingAgendaType({kode_rapat:'RPT-1'}),'INTERNAL');
  assert.equal(c.bookingAgendaType({kode_rapat:'VISIT-TLD-02112026-001'}),'TLD');
  assert.equal(c.bookingAgendaType({kode_kunjungan:'TDD-02112026-002'}),'TDD');
  assert.equal(c.bookingAgendaType({kode_kunjungan:'legacy'}),'TDD');
});
test('month grid handles leap years, Monday start, booking counts and year rollover',()=>{
  const {context:c,fields}=setup();
  c.allRapatData=[{tanggal:'2024-02-29',jam_mulai:'09:00'},{tanggal:'2024-02-29',jam_mulai:'10:00'}];
  c.setBookingCalendarState('ready');c.setBookingCalendarMonth(2024,1);
  c.openBookingCalendar();assert.equal(fields.bookingCalendar.open,true);
  assert.match(fields.bookingCalendarDays.innerHTML,/data-date="2024-02-29"/);
  assert.doesNotMatch(fields.bookingCalendarDays.innerHTML,/2024-02-30/);
  assert.match(fields.bookingCalendarDays.innerHTML,/2 agenda/);
  assert.match(fields.bookingCalendarDays.innerHTML,/^<span[^]*?<\/span><span[^]*?<\/span><span[^]*?<\/span><button/);
  c.setBookingCalendarMonth(2026,11);c.shiftBookingCalendarMonth(1);
  assert.match(fields.bookingCalendarDays.innerHTML,/2027-01-01/);
});
test('date popup shows only that day, safely escapes titles and handles empty or failed data',()=>{
  const {context:c,fields}=setup();c.allRapatData=[{tanggal:'2026-11-02',jam_mulai:'14:00',jam_selesai:'16:00',nama_ruangan:'Room A',judul_rapat:'<img src=x>',kode_kunjungan:'TLD-1'}];
  c.setBookingCalendarState('ready');c.openBookingDate('2026-11-02');
  assert.equal(fields.bookingDateModal.open,true);assert.match(fields.bookingDateTitle.textContent,/02-11-2026/);
  assert.match(fields.bookingDateRows.innerHTML,/14:00.*16:00/);assert.match(fields.bookingDateRows.innerHTML,/TLD/);
  assert.match(fields.bookingDateRows.innerHTML,/&lt;img/);assert.doesNotMatch(fields.bookingDateRows.innerHTML,/<img/);
  c.openBookingDate('2026-11-03');assert.match(fields.bookingDateRows.innerHTML,/Belum ada agenda/);
  c.setBookingCalendarState('error');assert.match(fields.bookingDateRows.innerHTML,/gagal dimuat/);
  c.openBookingDate('invalid');assert.match(fields.bookingDateTitle.textContent,/03-11-2026/);
});
