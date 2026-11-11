'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPage(admin=false) {
  const html = fs.readFileSync(path.join(__dirname, '../../Admin/Presensi.html'), 'utf8');
  const fields = {};
  const alerts = [];
  const context = vm.createContext({
    document: {
      body:{dataset:{adminAttendance:String(admin)}},
      addEventListener() {},
      getElementById(id) {
        return fields[id] ||= {
          value: '', required: false, disabled: false, options: [], innerHTML: '',
          replaceChildren(...items) { this.options = items; }, add(item) { this.options.push(item); },
          reportValidity: () => true, classList: { add() {}, remove() {} }
        };
      }
    },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    alert: message => alerts.push(message), console: { error() {} },
    location: { reload() {} }
  });
  vm.runInContext(fs.readFileSync('Admin/AttendancePolicy.html','utf8').match(/<script>([^]*?)<\/script>/)[1],context);
  vm.runInContext(html.match(/<script>([^]*?)<\/script>/)[1], context);
  context.callBackend = (name, args, success) => success({ success: true, data: name === 'getRapatCalendar' ? [{
    id: 7001, tanggal: '2026-10-26', jam_mulai: '09:30', jam_selesai: '11:00',
    judul_rapat: 'Rapat Uji', nama_ruangan: 'Ruang Rapat Utama Diskum'
  }] : { pegawai: [{ id: 8001, nama: 'Penguji', nip: 'TEST', jabatan: 'Staf', bidang:'Sekretariat', pangkat:'III/c' },{id:8002,nama:'Peserta PLUT',nip:'',jabatan:'Konsultan PLUT',bidang:'UPTD PLUT KUMKM',pangkat:''}], opd: [{ id: 1, nama_opd: 'OPD Uji' }] } });
  context.loadInitialData();
  return { context, fields, alerts };
}

test('attendance meeting choices show title and room without timestamps, preserving meeting IDs', () => {
  const { fields } = loadPage();
  assert.equal(fields.selectRapat.options[1].text, 'Rapat Uji (Ruang Rapat Utama Diskum)');
  assert.equal(fields.selectRapat.options[1].value, '7001');
});

test('attendance validates only the visible participant category', () => {
  const { context, fields } = loadPage();
  context.setKategoriPeserta('Diskum');
  assert.equal(fields.selectPegawaiDiskum.required, true);
  assert.equal(fields.selectOpdPemko.required, false);
  assert.equal(fields.inputNamaPemko.required, false);
  context.setKategoriPeserta('OPD_Pemko');
  assert.equal(fields.selectPegawaiDiskum.required, false);
  assert.equal(fields.selectOpdPemko.required, true);
  assert.equal(fields.inputNamaPemko.required, true);
  context.setKategoriPeserta('Diskum');
  assert.equal(fields.inputNamaPemko.required, false);
});

test('attendance shows availability messages only when attendance is blocked',()=>{
  const {context,fields}=loadPage();
  context.meetings=[{id:1,tanggal:'2000-01-01'},{id:2,tanggal:'2999-01-01'},{id:3,tanggal:'2000-01-01',manual_attendance:true}];
  vm.runInContext('presensiMeetings=meetings;',context);
  fields.selectRapat.value='1';context.onPresensiAgendaChange();
  assert.equal(fields.attendanceWindowMessage.textContent,'');
  fields.selectRapat.value='2';context.onPresensiAgendaChange();
  assert.match(fields.attendanceWindowMessage.textContent,/dibuka mulai/);
  fields.selectRapat.value='3';context.onPresensiAgendaChange();
  assert.match(fields.attendanceWindowMessage.textContent,/diisi manual/);
});

test('attendance keeps selected meeting and employee data and restores paper-plane button after errors', () => {
  const { context, fields, alerts } = loadPage();
  context.setKategoriPeserta('Diskum');
  fields.selectRapat.value = '7001';
  fields.selectBidangDiskum.value = 'Sekretariat';
  context.onBidangDiskumChange();
  fields.selectPegawaiDiskum.value = '8001';
  let payload;
  context.callBackend = (name, args, success, error) => { payload = args[0]; error(new Error('Uji koneksi')); };
  context.submitPresensiForm({ preventDefault() {} });
  assert.equal(payload.rapat_id, '7001');
  assert.equal(payload.nama, 'Penguji');
  assert.equal(payload.nip, 'TEST');
  assert.equal(fields.btnSubmitPresensi.disabled, false);
  assert.match(fields.btnSubmitPresensi.innerHTML, /fa-paper-plane/);
  assert.match(alerts[0], /gagal disimpan/);
});

test('Diskum choices filter by department, clear stale selections and keep missing NIP empty',()=>{
  const {context,fields}=loadPage();assert.equal(fields.selectPegawaiDiskum.disabled,true);
  fields.selectBidangDiskum.value='Sekretariat';context.onBidangDiskumChange();assert.equal(fields.selectPegawaiDiskum.options.length,2);assert.equal(fields.selectPegawaiDiskum.options[1].value,'8001');
  fields.selectPegawaiDiskum.value='8001';context.onPegawaiChange();assert.equal(fields.displayNip.innerText,'TEST');assert.equal(fields.displayJabatan.innerText,'Staf');assert.equal(fields.displayPangkat,undefined,'employee selection does not access the removed Golongan display');
  fields.selectBidangDiskum.value='UPTD PLUT KUMKM';context.onBidangDiskumChange();assert.equal(fields.selectPegawaiDiskum.value,'');assert.equal(fields.displayNip.innerText,'-');assert.equal(fields.selectPegawaiDiskum.options[1].value,'8002');
  fields.selectPegawaiDiskum.value='8002';context.onPegawaiChange();assert.equal(fields.displayNip.innerText,'-');assert.equal(fields.displayJabatan.innerText,'Konsultan PLUT');
});

test('outside visitor attendance submits the visible name and institution without hidden OPD fields', () => {
  const {context,fields,alerts}=loadPage();
  context.setKategoriPeserta('Tamu_Luar');
  fields.selectRapat.value='7001'; fields.inputNamaTamu.value='Tamu Kunjungan';fields.inputInstansiTamu.value='Instansi Luar';fields.inputJabatanTamu.value='Kepala Seksi';
  let payload;
  context.callBackend=(name,args,success)=>{payload=args[0];success({success:true,message:'Tersimpan'});};
  context.submitPresensiForm({preventDefault(){}});
  assert.ok(payload,alerts.join('; '));assert.equal(payload.nama,'Tamu Kunjungan');
  assert.equal(payload.nama_opd,'Instansi Luar');assert.equal(payload.jabatan,'Kepala Seksi');assert.equal(payload.kategori_peserta,'Tamu_Luar');
  assert.equal(fields.selectOpdPemko.required,false);
});

test('booked TLD attendance uses registered-name selection and canonical institution',()=>{
  const {context,fields}=loadPage();
  context.meetings=[{id:900,kode_kunjungan:'TLD-001',tanggal:'2026-10-26'}];
  vm.runInContext('presensiMeetings=meetings;',context);fields.selectRapat.value='900';
  context.callBackend=(name,args,success)=>success({success:true,data:{instansi:'Instansi Terdaftar',locked:false,roster:[{id:'ketua',nama:'Ketua Valid',peran:'Ketua Rombongan',attended:false}]}});
  context.onPresensiAgendaChange();
  assert.equal(fields.visitRosterMessage.textContent,'');
  assert.equal(fields.inputNamaTamu.required,false);assert.equal(fields.selectTamuRombongan.required,true);assert.equal(fields.inputJabatanTamu.required,true);
  assert.equal(fields.inputInstansiTamu.readOnly,true);
  fields.selectTamuRombongan.value='ketua';fields.inputNamaTamu.value='Unknown';fields.inputJabatanTamu.value='Ketua Rombongan';
  let payload;context.callBackend=(name,args,success)=>{payload=args[0];success({success:true,message:'Saved'});};
  context.submitPresensiForm({preventDefault(){}});
  assert.equal(payload.nama,'Ketua Valid');assert.equal(payload.member_id,'ketua');assert.equal(payload.nama_opd,'Instansi Terdaftar');assert.equal(payload.jabatan,'Ketua Rombongan');
});


test('admin attendance defaults the editable hour to the selected agenda and ordinary QR hides it',()=>{
 for(const admin of [true,false]){
  const {context,fields}=loadPage(admin);fields.selectRapat.value='7001';context.onPresensiAgendaChange();
  assert.equal(fields.adminAttendanceTime.hidden,!admin);assert.equal(fields.inputJamKehadiran.required,admin);assert.equal(fields.inputJamKehadiran.disabled,!admin);
  if(admin){assert.equal(fields.inputJamKehadiran.value,'09:30');fields.inputJamKehadiran.value='10:15';context.setKategoriPeserta('Diskum');assert.equal(fields.inputJamKehadiran.value,'10:15');}
 }
});
