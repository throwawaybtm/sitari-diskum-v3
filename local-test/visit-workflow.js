'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = vm.createContext({Utilities:{formatDate:(date,timezone)=>new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)}});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../Admin/VisitWorkflow.js'), 'utf8'), model);
for(const file of ['Code.js','MeetingRooms.js','VisitArchive.js','AgendaDocuments.js','AgendaAttendanceData.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Admin',file),'utf8'),model);

function createVisitWorkflow({ visitors, meetings, sppd, rooms, currentTime }) {
  const states = new Map();
  const documents = new Map();
  const attendance = [];
  const notulas = new Map();
  let fileSerial = 0;
  function saveFile(file, kind) {
    const info = model.validateVisitFile_(file);
    const id = String(++fileSerial);
    documents.set(id, { buffer: Buffer.from(file.data.split(',')[1], 'base64'), mime: info.mime, name: path.basename(file.name || kind) });
    return { name: file.name || kind, url: '/local-doc/' + id, mime: info.mime, size: info.size };
  }
  function read(code) {
    const visit = visitors.find(item => item.kode_kunjungan === code);
    if (!visit) throw new Error('Kunjungan tidak ditemukan.');
    if (!states.has(code)) {
      const state = model.newVisitWorkflow_(visit);
      const legacy = sppd.find(item => item.kode_kunjungan === code);
      if (legacy) {
        for (const kind of ['foto', 'absen', 'notulen']) {
          if (legacy['file_' + kind]) state.files[kind] = { name: kind, url: legacy['file_' + kind] };
        }
      }
      if(legacy&&legacy.file_pengesahan){state.signed={name:'Surat Pengesahan SPPD.pdf',url:legacy.file_pengesahan};state.exported={at:legacy.waktu_persetujuan_kasubag,actor:legacy.kasubag_nama};}
      states.set(code, state);
    }
    const state = states.get(code);
    const entries=attendance.filter(item=>state.booking&&String(item.rapat_id)===String(state.booking.id));
    const data={ visit, workflow: state, stage: model.visitWorkflowStage_(state),
      attendance: entries,
      roster:model.getVisitRoster_(visit).map(member=>({...member,attended:model.hasVisitAttendance_(entries,{member_id:member.id,nama:member.nama})})),
      rooms, simulated: true, destinations:require('./tld-directory').getPublicDestinations(), notula:notulas.get(String(state.booking&&state.booking.id))||null };
    data.archiveSources=model.visitArchiveSources_(data,data.notula);return data;
  }
  function attendanceData(meetingId) {
    const meeting=meetings.find(m=>String(m.id)===String(meetingId));
    if(!meeting||!meeting.kode_kunjungan)throw new Error('Agenda ini bukan kunjungan TLD.');
    return read(meeting.kode_kunjungan);
  }
  function appendVisitAttendance(data,payload,source) {
    if(data.workflow.arrival||data.workflow.status==='Selesai')throw new Error('Presensi kunjungan ini sudah divalidasi.');
    const person=model.resolveVisitAttendee_(data.visit,payload);
    const entries=attendance.filter(a=>String(a.rapat_id)===String(data.workflow.booking.id));
    if(model.hasVisitAttendance_(entries,person))return;
    const meeting=meetings.find(m=>String(m.id)===String(data.workflow.booking.id));
    const times=model.attendanceWriteTimes_(meeting,payload,source,currentTime().toISOString());
    attendance.push({...person,jabatan:payload.jabatan||'-',rapat_id:data.workflow.booking.id,waktu:times.attendance,recorded_at:times.recorded,source});
    if(source==='Admin'){const meeting=meetings.find(m=>String(m.id)===String(data.workflow.booking.id));if(meeting)meeting.manual_attendance=true;}
  }
  function handle(fn, payload) {
    if (!['getVisitWorkflow','saveVisitWorkflow','submitPresensiRapat','submitAdminPresensiRapat','simpanJadwalRapat','getVisitAttendanceRoster','submitManualVisitAttendance','saveAgendaNotula','saveAgendaPhotos','getAgendaPhotoDocument','getAgendaAttendance','getVisitArchiveDocument'].includes(fn)) return null;
    try {
      if(fn==='getAgendaAttendance'){
        const meeting=meetings.find(row=>String(row.id)===String(payload.rapat_id));if(!meeting)throw new Error('Agenda tidak ditemukan.');
        const records=attendance.filter(row=>String(row.rapat_id)===String(meeting.id)).map(row=>({nama:row.nama,waktu:row.waktu}));
        const list=model.makeAgendaAttendanceList_(records,'Asia/Jakarta');return {success:true,data:{agenda:{id:meeting.id,judul_rapat:meeting.judul_rapat},total:list.length,attendance:list}};
      }
      if(fn==='saveAgendaPhotos'){

        const meeting=meetings.find(m=>String(m.id)===String(payload.rapat_id));if(!meeting||!model.isInternalMeeting_(meeting))throw new Error('Foto ini hanya untuk agenda rapat internal.');
        if(meeting.status==='Selesai'||meeting.notula)throw new Error('Agenda sudah selesai. Foto telah dikunci.');
        model.validateMeetingPhotoBatch_(payload.files,(meeting.photos||[]).length);meeting.photos=(meeting.photos||[]).concat(payload.files.map(file=>saveFile(file,'foto-rapat')));return {success:true,data:meeting.photos};
      }
      if(fn==='getAgendaPhotoDocument'){
        const meeting=meetings.find(m=>String(m.id)===String(payload.rapat_id));if(!meeting||!model.isInternalMeeting_(meeting)||!Number.isInteger(payload.index))throw new Error('Foto tidak ditemukan.');
        const photo=(meeting.photos||[])[payload.index],doc=photo&&documents.get(String(photo.url).split('/').pop());if(!doc)throw new Error('Foto tidak ditemukan.');return {success:true,data:{name:photo.name,mime:doc.mime,base64:doc.buffer.toString('base64')}};
      }
      if(fn==='saveAgendaNotula'){

        const meeting=meetings.find(m=>String(m.id)===String(payload.rapat_id));if(!meeting)throw new Error('Agenda tidak ditemukan.');
        if(meeting.status==='Selesai'||meeting.notula)throw new Error('Agenda sudah selesai. E-notula telah dikunci.');
        if(model.isInternalMeeting_(meeting)&&!(meeting.photos||[]).length)throw new Error('Unggah minimal satu foto rapat sebelum E-notula.');
        const doc=saveFile(payload.file,'E-notula');notulas.set(String(meeting.id),doc);meeting.notula=doc;meeting.status='Selesai';return {success:true,data:doc};
      }
      if(fn==='getVisitArchiveDocument'){
        const data=read(payload.kode_kunjungan);if(data.workflow.status!=='Selesai')throw new Error('Kunjungan belum selesai.');
        if(!Number.isInteger(payload.index)||payload.index<0||payload.index>=data.archiveSources.length)throw new Error('Dokumen tidak ditemukan.');
        const source=data.archiveSources[payload.index],doc=documents.get(String(source.url).split('/').pop());
        if(!doc)throw new Error('Dokumen tidak ditemukan.');return {success:true,data:{name:source.name,mime:doc.mime,base64:doc.buffer.toString('base64')}};
      }
      if(fn==='getVisitAttendanceRoster') {
        const data=attendanceData(payload.rapat_id);
        return {success:true,data:{rapat_id:data.workflow.booking.id,instansi:data.visit.instansi,roster:data.roster,locked:Boolean(data.workflow.arrival||data.workflow.status==='Selesai')}};
      }
      if(fn==='submitManualVisitAttendance') {
        const meeting=meetings.find(m=>String(m.id)===String(payload.rapat_id));
        const availability=model.adminAttendanceAvailability_(meeting,currentTime());if(!availability.open)throw new Error(availability.message);
        const data=attendanceData(payload.rapat_id);
        const ids=[...new Set(Array.isArray(payload.member_ids)?payload.member_ids:[])];
        if(!ids.length)throw new Error('Pilih minimal satu nama dari daftar rombongan.');
        ids.forEach(id=>model.resolveVisitAttendee_(data.visit,{member_id:id}));
        ids.forEach(id=>appendVisitAttendance(data,{member_id:id,jabatan:String(payload.member_jobs&&payload.member_jobs[id]||'').trim().slice(0,150)},'Admin'));
        return {success:true,data:read(data.visit.kode_kunjungan)};
      }
      if(fn==='simpanJadwalRapat') {
        require('./meeting-rooms').validateSchedule(payload);
        const checked=model.validateVisitBooking_({ruangan_id:String(payload.ruangan).split('|')[0],tanggal:payload.tanggal,jam_mulai:payload.jam_mulai,jam_selesai:payload.jam_selesai},{jumlah_orang:0},rooms,meetings);
        const id=model.nextVisitAgendaId_(meetings.map(m=>m.id)),code='RPT-'+id;
        meetings.push({...checked,id,kode_rapat:code,judul_rapat:payload.judul,penyelenggara_bidang:payload.bidang,pimpinan_rapat:payload.pimpinan,agenda:payload.agenda,status:'Terjadwal'});
        return {success:true,message:'Jadwal disimpan sebagai simulasi lokal sampai server berhenti.',data:{kode_rapat:code}};
      }
      if (fn === 'submitPresensiRapat'||fn==='submitAdminPresensiRapat') {
        const source=fn==='submitAdminPresensiRapat'?'AdminEntry':'QR';
        // Preserve the old simple simulation for payloads without an agenda.
        if (!payload.rapat_id) return { success: true, message: 'Presensi disimpan sebagai simulasi lokal.' };
        const meeting = meetings.find(item => String(item.id) === String(payload.rapat_id));
        const availability=source==='AdminEntry'?model.adminAttendanceAvailability_(meeting,currentTime()):model.attendanceAvailability_(meeting,currentTime());if(!availability.open)throw new Error(availability.message);
        const times=model.attendanceWriteTimes_(meeting,payload,source,currentTime().toISOString());
        if(meeting&&meeting.kode_kunjungan) {
          appendVisitAttendance(attendanceData(meeting.id),payload,source);
          return {success:true,message:'Presensi rombongan tersimpan.'};
        }
        if (!meeting || !String(payload.nama || '').trim()) throw new Error('Pilih agenda dan isi nama peserta.');
        const frozen = [...states.values()].find(state => state.booking && String(state.booking.id) === String(meeting.id) && (state.arrival || state.status === 'Selesai'));
        if (frozen) throw new Error('Presensi kunjungan ini sudah divalidasi.');
        attendance.push({ ...payload, nama: String(payload.nama).trim(), waktu: times.attendance,recorded_at:times.recorded,source });
        return { success: true, message: 'Presensi disimpan sementara di server lokal.' };
      }
      const code = String(payload.kode_kunjungan || '');
      const data = read(code);
      if (fn === 'saveVisitWorkflow') {
        const recipients = String(data.visit.lo_nama || '').split(';').map(s => s.trim()).filter(Boolean);
        const env = {
          now: currentTime().toISOString(), actor: '[LOCAL] Admin', recipients, attendance: data.attendance, saveFile,rooms,
          reschedule:s=>s,
          selectDestinations:names=>model.chooseVisitDestinations_(names,require('./tld-directory').getPublicDestinations()),
          notifyContact:previous=>previous&&previous.success?previous:{success:true,simulated:true,at:currentTime().toISOString()},
          generateAttendance:()=>{
            const {jsPDF}=require('./vendor/jspdf.umd.min.js'),doc=new jsPDF();let y=25;
            doc.setFontSize(16);doc.text('Daftar Hadir Kunjungan',20,y);y+=12;doc.setFontSize(10);
            doc.text(data.visit.kode_kunjungan,20,y);y+=8;doc.text('Tanggal kegiatan: '+String(data.workflow.booking&&data.workflow.booking.tanggal||data.visit.tanggal_kunjungan).split('-').reverse().join('-'),20,y);y+=10;
            const header=()=>{doc.setFont('helvetica','bold');doc.text('No.',20,y);doc.text('Nama',35,y);doc.text('Jabatan',125,y);doc.setFont('helvetica','normal');y+=8;};header();
            data.attendance.forEach((a,i)=>{const name=doc.splitTextToSize(a.nama,82),job=doc.splitTextToSize(a.jabatan||'-',65),height=Math.max(name.length,job.length)*5+5;if(y+height>275){doc.addPage();y=25;header();}doc.text(String(i+1),20,y);doc.text(name,35,y);doc.text(job,125,y);y+=height;});
            return saveFile({name:'Daftar_Hadir_'+code+'.pdf',data:'data:application/pdf;base64,'+Buffer.from(doc.output('arraybuffer')).toString('base64')},'daftar-hadir');
          },
          notify: previous => recipients.map(pic => previous.find(n => n.pic === pic && n.success) || { pic, success: true, simulated: true, at: currentTime().toISOString() }),
          book: booking => {
            const room = model.validateVisitBooking_(booking, data.visit, rooms, meetings);
            const id = model.nextVisitAgendaId_(meetings.map(m=>m.id));
            const meeting = { ...room, id, kode_rapat: 'LOCAL-VISIT-' + id, judul_rapat: 'Kunjungan ' + data.visit.instansi,
              penyelenggara_bidang: data.visit.tujuan_bidang, pimpinan_rapat: data.visit.lo_nama,
              jumlah_peserta: data.visit.jumlah_orang, agenda: data.visit.keperluan, status: 'Terjadwal', kode_kunjungan: code };
            meetings.push(meeting);
            return meeting;
          }
        };
        const next = model.applyVisitWorkflow_(data.visit, data.workflow, payload, env);
        states.set(code, next);
        data.visit.status_kunjungan = next.status;
        if(payload.action==='reschedule'){data.visit.tanggal_kunjungan=next.schedule.tanggal;data.visit.jam_kunjungan=next.schedule.jam;}
        if(payload.action==='book'){data.visit.tanggal_kunjungan=next.booking.tanggal;data.visit.jam_kunjungan=next.booking.jam_mulai;}
        if(payload.action==='destinations'){data.visit.tujuan_bidang=next.destinations.bidang;data.visit.lo_nama=next.destinations.pic;data.visit.lo_id=next.destinations.picIds;}
        const control = sppd.find(item => item.kode_kunjungan === code);
        if (control) {
          if (next.files.foto) control.file_foto = next.files.foto.url;
          if (next.files.absen) control.file_absen = next.files.absen.url;
          if (next.status === 'Selesai') control.status_sppd = 'Sah & Terverifikasi';
        }
      }
      const result=read(code);
      if(fn==='getVisitWorkflow'&&payload.tab!==undefined){
        const tab=payload.tab==='current'?result.stage:payload.tab;
        if(!Number.isInteger(tab)||tab<0||tab>5||result.workflow.status!=='Selesai'&&tab>result.stage||result.workflow.status==='Non-SPPD'&&tab!==0)throw new Error('Tahap belum tersedia.');
        result.tab=tab;result.loadedTabs=[tab];result.limited=true;
        if(tab!==2)result.rooms=[];
        if(tab!==3&&tab!==4){result.attendance=[];result.roster=model.getVisitRoster_(result.visit);}
        if(tab!==5){result.notula=null;result.archiveSources=[];}
      }
      return { success: true, data: result };
    } catch (error) { return { success: false, error: error.message }; }
  }
  return { handle, saveFile, getDocument: id => documents.get(id),
    seedAgendaAttendance(id,people){people.forEach(p=>attendance.push({...p,rapat_id:id}));},
    seedAgendaNotula(id,document){notulas.set(String(id),document);const meeting=meetings.find(m=>String(m.id)===String(id));if(meeting)meeting.notula=document;},
    seedVisit(visit,state,people=[]){states.set(visit.kode_kunjungan,state);people.forEach(person=>{attendance.push(person);if(person.source==='Admin'){const meeting=meetings.find(m=>String(m.id)===String(person.rapat_id));if(meeting)meeting.manual_attendance=true;}});} };
}
module.exports = { createVisitWorkflow };
