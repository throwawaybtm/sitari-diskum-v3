'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { renderAdminHtml } = require('../server');
const { rooms } = require('../meeting-rooms');
const { validateSchedule } = require('../meeting-rooms');
const { completeMeetingPayload } = require('./meeting-test-data');

function loadCalendar() {
  const html = renderAdminHtml();
  const containers = {};
  const context = vm.createContext({
    MEETING_ROOMS: rooms,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-26T05:00:00Z'])); } },
    escapeHtml: value => String(value ?? '').replace(/</g, '&lt;'),
    document: { getElementById: id => containers[id] ||= { innerHTML: '' } }
  });
  context.filterAgendaRecords_=require('../agenda-search').filter;
  vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html','utf8').match(/<script>([^]*?)<\/script>/)[1],context);
  for (const name of ['getMeetingRoomInfo', 'renderMeetingRooms', 'renderMeetingRoomBadge', 'formatMeetingDate', 'isMeetingOverdue', 'meetingStatusInfo', 'canAdminRecordAttendance','renderMeetingsList', 'bukaModalPresensi']) {
    const source = html.match(new RegExp('    function ' + name + '\\([^]*?\\n    \\}'))[0];
    vm.runInContext(source, context);
  }
  return { context, containers };
}

test('saved manual attendance disables QR and stale clicks, while manual entry stays available',()=>{
  const {context,containers}=loadCalendar();
  const meeting={id:9,kode_kunjungan:'TLD-1',tanggal:'2026-10-25',manual_attendance:true};
  context.renderMeetingsList([meeting]);
  const html=containers.meetingsListContainer.innerHTML;
  assert.match(html,/<button[^>]*disabled[^>]*>[^]*?Presensi sudah diisi<\/button>/);
  assert.doesNotMatch(html,/onclick="bukaModalPresensi/);
  const manual=html.match(/<button[^>]*onclick="openManualVisitAttendance[^]*?<\/button>/)[0];
  assert.doesNotMatch(manual,/\sdisabled(?:\s|>)/);
  context.allRapatData=[meeting];context.bukaModalPresensi(9);
  assert.equal(containers.presensiQrImg,undefined);
});

test('room master returns only the three configured rooms with new capacities and existing IDs', () => {
  const context = vm.createContext({});
  for (const file of ['MeetingRooms.js', 'Code.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin', file), 'utf8'), context);
  const data = [
    [17, 'Ruang Rapat Utama Diskum', 35, 'Proyektor', 'Lantai 2', 'blue'],
    [29, 'Ruang Konsultasi Koperasi & UMKM', 12, 'TV', 'Lantai 1', 'emerald'],
    [33, 'Ruang Rapat Pimpinan / Kadis', 15, '', 'Lantai 2', 'purple'],
    [44, 'Aula Pelatihan & Inkubasi Bisnis', 80, '', 'Lantai 3', 'amber']
  ];
  context.getSpreadsheet = () => ({ getSheetByName: name => name === 'Master_Ruangan'
    ? { getLastRow: () => 5, getLastColumn: () => 6, getRange: () => ({ getValues: () => data }) } : null });
  const result = JSON.parse(JSON.stringify(context.getMasterData())).data.ruangan;
  assert.deepEqual(result.map(room => [room.id, room.nama_ruangan, room.kapasitas]), [
    [17, 'Ruang Rapat Utama Diskum', 50], [29, 'Ruangan Bidang Koperasi & UMKM', 5], [33, 'Ruang Rapat Pimpinan / Kadis', 10]
  ]);
  assert.ok(result.every(room => room.lokasi === 'Lantai 1'));
  assert.equal(data[0][2], 35, 'normalizing app metadata does not rewrite the sheet');
});

test('meeting completion uses the scheduled end in Jakarta, including the exact cutoff and midnight', () => {
  const { context } = loadCalendar();
  const meeting = { tanggal: '2026-10-27', jam_selesai: '00:15' };
  assert.equal(context.isMeetingOverdue(meeting, new Date('2026-10-26T17:14:59Z')), false);
  assert.equal(context.isMeetingOverdue(meeting, new Date('2026-10-26T17:15:00Z')), true);
  assert.equal(context.isMeetingOverdue({ tanggal: '2026-10-28', jam_selesai: '13:00' }), false);
  assert.equal(context.isMeetingOverdue({ tanggal: '2026-10-25', jam_selesai: '13:00' }), true);
  assert.equal(context.isMeetingOverdue({ tanggal: 'invalid', jam_selesai: '' }), false);
});

test('calendar uses coloured room badges, formatted dates and disabled completed actions', () => {
  const { context, containers } = loadCalendar();
  const base = { tanggal: '2026-10-26', judul_rapat: 'Uji Rapat', agenda: 'Uji', jam_mulai: '09:00' };
  const meetings = [
    { ...base, id: 1, nama_ruangan: 'Ruang Rapat Utama', jam_selesai: '11:00' },
    { ...base, id: 2, nama_ruangan: 'Ruang Konsultasi Koperasi & UMKM', jam_selesai: '13:00' },
    { ...base, id: 3, nama_ruangan: 'Ruang Rapat Pimpinan / Kadis', tanggal: '2026-10-25', jam_selesai: '17:00',status:'Selesai' }
  ];
  context.renderMeetingRooms();
  const cards = containers.roomBadgesContainer.innerHTML;
  assert.doesNotMatch(cards, /Kapasitas|maksimal|orang/);
  assert.doesNotMatch(cards, /Aula|Lantai/);
  context.renderMeetingsList(meetings);
  const html = containers.meetingsListContainer.innerHTML;
  assert.match(html, /26-10-2026/);
  for (const colour of ['blue', 'emerald', 'violet']) assert.ok(html.includes('bg-' + colour + '-100'));
  const buttons = [...html.matchAll(/<button\b[^]*?<\/button>/g)].map(match => match[0]).filter(b=>!b.includes('E-notula')&&!b.includes('openMeetingPhotos')&&!b.includes('openAgendaAttendance'));
  assert.match(buttons[0], /onclick="bukaModalPresensi[^]*Presensi QR/);
  assert.doesNotMatch(buttons[0], /disabled/);
  assert.match(buttons[1], /onclick="bukaModalPresensi[^]*Presensi QR/);
  assert.doesNotMatch(buttons[1], /disabled/);
  assert.match(buttons[2], /disabled[^]*Rapat selesai/);
  context.allRapatData = meetings;
  context.bukaModalPresensi(3);
  assert.equal(containers.presensiQrImg, undefined, 'stale clicks cannot open a QR for a completed meeting');
});

test('calendar toolbar buttons have identical blue-green styling and the revised labels', () => {
  const section = renderAdminHtml().match(/<section id="section-calendar"[^]*?<\/section>/)[0];
  assert.match(section, /fa-calendar-days[^]*Jadwal Rapat Internal/);
  assert.doesNotMatch(section, /Informasi Kegiatan Rapat Internal Diskum/);
  assert.match(section, /Agenda Rapat Internal/);
  const dashboard = section.match(/<a\b[^]*?class="([^"]+)"[^]*?Isi presensi/)[1];
  const schedule = section.match(/<button onclick="bukaModalRapat\(\)" class="([^"]+)"/)[1];
  assert.equal(dashboard, schedule);
  assert.match(dashboard, /from-teal-800 via-sky-800 to-blue-900/);
});

test('manual attendance remains available on past TLD agendas until completion',()=>{
  const {context,containers}=loadCalendar();
  context.renderMeetingsList([{id:1,judul_rapat:'Internal',tanggal:'2026-10-25',jam_selesai:'10:00'},{id:2,kode_kunjungan:'TLD-001',judul_rapat:'Kunjungan',tanggal:'2026-10-25',jam_selesai:'10:00'}]);
  const html=containers.meetingsListContainer.innerHTML;
  assert.equal((html.match(/onclick="openManualVisitAttendance/g)||[]).length,1);
  assert.doesNotMatch(html,/data-id="2" onclick="openManualVisitAttendance[^>]*disabled/);
});

test('E-notula stays enabled after time ends and is disabled only for completed agendas',()=>{
  const {context,containers}=loadCalendar();
  context.renderMeetingsList([
    {id:1,tanggal:'2026-10-25',jam_selesai:'10:00',photos:[{url:'/photo'}]},
    {id:2,tanggal:'2026-10-27',jam_selesai:'10:00',photos:[{url:'/photo'}]},
    {id:3,tanggal:'2026-10-27',jam_selesai:'10:00',status:'Selesai'}
  ]);
  const buttons=[...containers.meetingsListContainer.innerHTML.matchAll(/<button\b[^]*?<\/button>/g)].map(m=>m[0]).filter(b=>b.includes('uploadAgendaNotula'));
  assert.doesNotMatch(buttons[0],/" disabled /);assert.doesNotMatch(buttons[1],/" disabled /);assert.match(buttons[2],/" disabled /);
});

test('agenda status moves from scheduled to running to waiting for E-notula, and upload is completion',()=>{
  const {context}=loadCalendar();const agenda={photos:[{url:'/photo'}],tanggal:'2026-10-26',jam_mulai:'09:00',jam_selesai:'10:00',status:'Terjadwal'};
  const label=iso=>context.meetingStatusInfo(agenda,new Date(iso)).label;
  assert.equal(label('2026-10-26T01:00:00Z'),'Terjadwal');assert.equal(label('2026-10-26T02:30:00Z'),'Berlangsung');assert.equal(label('2026-10-26T03:00:00Z'),'Menunggu E-notula');
  agenda.notula={url:'/local-doc/1'};assert.equal(label('2026-10-26T03:00:00Z'),'Selesai');
});

test('E-notula uses one action: upload before saving and checked view link afterward',()=>{
  const {context,containers}=loadCalendar();
  const agenda={id:7,tanggal:'2026-10-25',jam_selesai:'10:00',photos:[{url:'/photo'}]};
  const actions=()=>[...containers.meetingsListContainer.innerHTML.matchAll(/<(?:button|a)\b[^]*?<\/(?:button|a)>/g)].map(m=>m[0]).filter(s=>/E-notula|E-Notula/.test(s));
  context.renderMeetingsList([agenda]);let result=actions();assert.equal(result.length,1);assert.match(result[0],/uploadAgendaNotula/);assert.doesNotMatch(result[0],/\sdisabled(?:\s|>)/);
  context.renderMeetingsList([{...agenda,status:'Selesai',notula:{url:'https://drive.google.com/file/d/test/view'}}]);result=actions();assert.equal(result.length,1);assert.match(result[0],/^<a /);assert.match(result[0],/fa-check/);assert.match(result[0],/Lihat E-Notula/);assert.match(result[0],/href="https:\/\/drive.google.com\/file\/d\/test\/view"/);assert.match(result[0],/rel="noopener"/);assert.doesNotMatch(result[0],/uploadAgendaNotula|disabled/);
  context.renderMeetingsList([{...agenda,status:'Selesai'}]);result=actions();assert.equal(result.length,1);assert.match(result[0],/disabled/);assert.doesNotMatch(result[0],/Lihat E-Notula/);
});

test('phone agenda keeps attendance visible and puts description/document action in closed Detail',()=>{
  const {context,containers}=loadCalendar();
  context.window={matchMedia:()=>({matches:true})};
  const agenda={id:7,kode_kunjungan:'TLD-1',tanggal:'2026-10-25',jam_mulai:'09:00',jam_selesai:'10:00',agenda:'Bahasan lengkap'};
  context.renderMeetingsList([agenda]);
  let html=containers.meetingsListContainer.innerHTML;
  assert.match(html,/25-10-2026 09:00 - 10:00/);
  let details=html.match(/<details\b[^]*?<\/details>/)?.[0];
  assert.ok(details,'phone agenda has a native expandable Detail');
  assert.doesNotMatch(details.split('>')[0],/\sopen(?:\s|$)/);
  assert.match(details,/Bahasan lengkap/);assert.match(details,/uploadAgendaNotula/);
  const primary=html.slice(0,html.indexOf('<details'));
  assert.match(primary,/bukaModalPresensi/);assert.match(primary,/openManualVisitAttendance/);
  assert.doesNotMatch(primary,/Bahasan lengkap|uploadAgendaNotula/);
  containers.meetingsListContainer.querySelectorAll=()=>[{dataset:{agendaId:'7'}}];
  context.renderMeetingsList([{...agenda,notula:{url:'/document.pdf'}}]);
  html=containers.meetingsListContainer.innerHTML;
  details=html.match(/<details\b[^]*?<\/details>/)[0];
  assert.match(details.split('>')[0],/\sopen(?:\s|$)/,'keep Detail expanded after upload rerenders');
  assert.match(details,/Lihat E-Notula/);assert.doesNotMatch(details,/uploadAgendaNotula/);
  context.window={matchMedia:()=>({matches:false})};context.renderMeetingsList([agenda]);
  html=containers.meetingsListContainer.innerHTML;
  assert.doesNotMatch(html,/<details/);assert.match(html,/Bahasan lengkap/);assert.match(html,/uploadAgendaNotula/);
});

test('agenda rendering uses phone layout on landscape touch phones and desktop layout with a mouse',()=>{
  for(const [width,touch,phone]of [[390,false,true],[932,true,true],[932,false,false],[1280,true,false]]){
    const {context,containers}=loadCalendar();
    context.window={matchMedia:query=>({matches:query.split(',').some(part=>{
      const max=part.match(/max-width:\s*([\d.]+)px/);
      return (!max||width<=Number(max[1]))&&(!/pointer:\s*coarse/.test(part)||touch)&&(!/hover:\s*none/.test(part)||touch);
    })})};
    context.renderMeetingsList([{id:7,tanggal:'2026-10-25'}]);
    assert.equal(containers.meetingsListContainer.innerHTML.includes('<details'),phone,`${width}px touch=${touch}`);
  }
});

test('meeting registration requires every field and valid same-day start/end times', () => {
  const payload = completeMeetingPayload();
  validateSchedule(payload);
  for (const field of Object.keys(payload)) {
    assert.throws(() => validateSchedule({ ...payload, [field]: '' }), /wajib/, field);
  }
  assert.throws(() => validateSchedule({ ...payload, pimpinan: '   ' }), /wajib/);
  assert.throws(() => validateSchedule({ ...payload, tanggal: '2026-02-30' }), /tidak valid/);
  assert.throws(() => validateSchedule({ ...payload, jam_selesai: '08:00' }), /setelah/);
  assert.throws(() => validateSchedule({ ...payload, jam_selesai: '09:00' }), /setelah/);
});

test('GAS rejects missing meeting fields before writing and preserves all fields on valid save', () => {
  const context = vm.createContext({});
  for (const file of ['MeetingRooms.js', 'Code.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin', file), 'utf8'), context);
  const rows = [];
  let databaseCalls = 0;
  context.getSpreadsheet = () => {
    databaseCalls++;
    return { getSheetByName: () => ({ getLastRow: () => 1, getRange:()=>({setNumberFormat(){}}), appendRow: row => rows.push(row) }) };
  };
  context.Utilities = { formatDate: () => '2026-10-26 21:00:00' };
  context.LockService = { getScriptLock: () => ({waitLock(){},releaseLock(){}}) };
  context.autoSortAllSheets = () => {};
  assert.throws(() => context.simpanJadwalRapat(completeMeetingPayload({ agenda: '' })), /wajib/);
  assert.equal(databaseCalls, 0);
  assert.equal(context.simpanJadwalRapat(completeMeetingPayload()).success, true);
  assert.equal(rows[0][9], '[DUMMY] Pimpinan');
  assert.equal(rows[0][11], '[DUMMY] Agenda pengujian');
});

test('meeting modal restores Jadwalkan after validation failures and backend errors', () => {
  const html = renderAdminHtml();
  const button = { disabled: false, innerHTML: 'Jadwalkan' };
  let calls = 0;
  const context = vm.createContext({
    document: { getElementById: () => button },
    FormData: class { entries() { return Object.entries(completeMeetingPayload()); } },
    callBackend: (name, args, success, failure) => { calls++; failure({ message: 'Uji gagal' }); },
    showToast() {}
  });
  vm.runInContext(html.match(/    function submitJadwalRapat\([^]*?\n    \}/)[0], context);
  context.submitJadwalRapat({ preventDefault() {}, target: { reportValidity: () => false } });
  assert.equal(calls, 0);
  context.submitJadwalRapat({ preventDefault() {}, target: { reportValidity: () => true } });
  assert.equal(calls, 1);
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, 'Jadwalkan');
});


test('only internal agendas expose photo actions; photos gate E-notula and overdue status',()=>{
  const {context,containers}=loadCalendar();
  const internal={id:9,kode_rapat:'RPT-9',tanggal:'2026-10-25',jam_selesai:'10:00'};
  context.renderMeetingsList([internal]);let html=containers.meetingsListContainer.innerHTML;
  assert.match(html,/openMeetingPhotos/);assert.match(html,/Menunggu Foto/);
  assert.match(html,/<button[^>]*uploadAgendaNotula[^>]* disabled(?:\s|>)/);
  context.renderMeetingsList([{...internal,photos:[{url:'/photo'}]}]);html=containers.meetingsListContainer.innerHTML;
  assert.match(html,/Lihat Foto/);assert.match(html,/Menunggu E-notula/);
  assert.doesNotMatch(html,/<button[^>]*uploadAgendaNotula[^>]* disabled(?:\s|>)/);
  context.renderMeetingsList([{...internal,kode_rapat:'VISIT-TLD-9',kode_kunjungan:'TLD-9'}]);
  assert.doesNotMatch(containers.meetingsListContainer.innerHTML,/openMeetingPhotos|Unggah Foto|Menunggu Foto/);
});


test('Lihat Presensi stays enabled for internal, visit, completed and future agendas',()=>{
 const {context,containers}=loadCalendar();
 context.renderMeetingsList([{id:1,kode_rapat:'RPT-1',status:'Selesai',tanggal:'2026-10-25'},{id:2,kode_kunjungan:'TLD-2',tanggal:'2026-12-01'}]);
 const buttons=[...containers.meetingsListContainer.innerHTML.matchAll(/<button[^]*?<\/button>/g)].map(match=>match[0]).filter(button=>button.includes('openAgendaAttendance'));
 assert.equal(buttons.length,2);for(const button of buttons){assert.match(button,/Lihat Presensi/);assert.doesNotMatch(button,/\sdisabled(?:\s|>)/);}
});
