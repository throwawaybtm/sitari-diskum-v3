/** Admin-only, read-only attendance overview for both internal and visit agendas. */
function agendaAttendanceTime_(value,spreadsheetTimezone) {
  try {
    let canonical='';
    if(Object.prototype.toString.call(value)==='[object Date]'){
      if(!Number.isFinite(value.getTime()))return '';
      // Legacy cells were created from a WIB wall-time string in the sheet's timezone.
      canonical=Utilities.formatDate(value,spreadsheetTimezone||'Asia/Jakarta','yyyy-MM-dd HH:mm');
    }else{
      const text=String(value||'').trim();
      if(/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)){
        const instant=new Date(text);if(!Number.isFinite(instant.getTime()))return '';
        canonical=Utilities.formatDate(instant,'Asia/Jakarta','yyyy-MM-dd HH:mm');
      }else{
        const match=text.match(/^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)(?::\d{2}(?:\.\d+)?)?$/);
        if(match)canonical=match[1]+' '+match[2]+':'+match[3];
      }
    }
    return canonical;
  }catch(error){return '';}
}
function makeAgendaAttendanceList_(records,spreadsheetTimezone) {
  return records.map((record,index)=>({nama:String(record.nama||'-'),time:agendaAttendanceTime_(record.waktu,spreadsheetTimezone),index:index}))
    .sort((a,b)=>(a.time||'9999').localeCompare(b.time||'9999')||a.index-b.index)
    .map((record,index)=>({no:index+1,nama:record.nama,tanggal:record.time?record.time.slice(0,10).split('-').reverse().join('-'):'-',jam:record.time?record.time.slice(11,16):'-'}));
}
function getAgendaAttendance(payload) {
  try {
    requireVisitAdmin_();
    const id=String(payload&&payload.rapat_id||'');if(!id)throw new Error('Pilih agenda yang valid.');
    const ss=getSpreadsheet(),calendar=ss.getSheetByName('Data_Rapat');
    const meeting=calendar&&calendar.getLastRow()>1?calendar.getRange(2,1,calendar.getLastRow()-1,3).getValues().find(row=>String(row[0])===id):null;
    if(!meeting)throw new Error('Agenda tidak ditemukan.');
    const sheet=ss.getSheetByName('Data_Presensi');
    const rows=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues():[];
    const records=rows.filter(row=>String(row[1])===id).map(row=>({nama:row[4],waktu:row[9]}));
    const attendance=makeAgendaAttendanceList_(records,ss.getSpreadsheetTimeZone());
    return {success:true,data:{agenda:{id:meeting[0],judul_rapat:String(meeting[2]||'')},total:attendance.length,attendance:attendance}};
  }catch(error){return {success:false,error:error.message};}
}
