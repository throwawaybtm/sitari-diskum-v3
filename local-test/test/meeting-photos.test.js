'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const image={name:'foto.jpg',data:'data:image/jpeg;base64,/9j/2Q=='};
function harness(visit=false,locked=false,status='Terjadwal'){
 const sheets=new Map(),writes=[];function sheet(){const rows=[];return {rows,getLastRow:()=>rows.length,appendRow:r=>rows.push(Array.from(r)),getRange:(r,c,n=1,w=1)=>({getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),setValues:values=>values.forEach((row,i)=>rows[r-1+i]=Array.from(row)),setValue(){}})};}
 const agenda={id:1,kode_rapat:visit?'VISIT-TLD-1':'RPT-1',kode_kunjungan:visit?'TLD-1':'',status:locked?'Terkunci':status,locked,photos:[]};
 const ss={getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>{const s=sheet();sheets.set(n,s);return s;}};
 const c=vm.createContext({getSpreadsheet:()=>ss,getRapatCalendar:()=>({data:[agenda]}),requireVisitAdmin_(){},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},saveVisitWorkflowFile_:(f,code,kind)=>{writes.push({file:f,code,kind});return {name:f.name,url:'https://drive.google.com/file/d/photo/view',mime:'image/jpeg'};}});
 for(const file of ['MeetingRooms.js','VisitWorkflow.js','AgendaDocuments.js'])vm.runInContext(fs.readFileSync('Admin/'+file,'utf8'),c);
 return {c,agenda,sheets,writes};
}
test('unfinished internal meetings require photos before E-notula; direct RPC cannot bypass the requirement',()=>{
 const {c,writes}=harness();const result=c.saveAgendaNotula({rapat_id:1,file:{name:'notula.pdf',data:'data:application/pdf;base64,JVBERg=='}});
 assert.equal(result.success,false);assert.match(result.error,/foto/i);assert.equal(writes.length,0);
});
test('internal meeting photos persist and validate the entire image batch before saving',()=>{
 const {c,writes}=harness();assert.equal(typeof c.saveAgendaPhotos,'function');
 const bad=c.saveAgendaPhotos({rapat_id:1,files:[image,{name:'x.pdf',data:'data:application/pdf;base64,JVBERg=='}]});assert.equal(bad.success,false);assert.equal(writes.length,0);
 const result=c.saveAgendaPhotos({rapat_id:1,files:[image]});assert.equal(result.success,true,result.error);assert.equal(result.data.length,1);
 assert.equal(c.getAgendaPhotos_(1)[0].name,'foto.jpg');
 assert.equal(c.getAgendaPhotos_(1)[0].label,'Foto Rapat Internal');
 assert.equal(writes[0].kind,'foto-rapat');
});
test('visit agendas allow multi-photo with distinct database label and kind, locked agendas reject uploads, and legacy completed remain unlocked',()=>{
 const visitHarness=harness(true,false);
 const visitRes=visitHarness.c.saveAgendaPhotos({rapat_id:1,files:[image,{name:'foto2.jpg',data:image.data}]});
 assert.equal(visitRes.success,true,visitRes.error);
 assert.equal(visitRes.data.length,2);
 assert.equal(visitRes.data[0].label,'Foto Agenda Kunjungan');
 assert.equal(visitHarness.writes[0].kind,'foto-kunjungan');
 for(const [visit,locked] of [[false,true],[true,true]]){const {c,writes}=harness(visit,locked);assert.equal(c.saveAgendaPhotos({rapat_id:1,files:[image]}).success,false);assert.equal(writes.length,0);}
 const legacyCompleted=harness(false,false,'Selesai');
 assert.equal(legacyCompleted.c.saveAgendaPhotos({rapat_id:1,files:[image]}).success,true);
 assert.equal(legacyCompleted.writes.length,1);
});
