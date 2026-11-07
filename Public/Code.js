/** Public Forms exposes only registration and attendance; admin actions stay in the core. */
function doGet(e) {
  const page=String(e&&e.parameter&&e.parameter.page||'tld');
  const route=({tld:'Tld','tamu-luar':'Tld',tdd:'Tdd','tamu-fo':'Tdd',presensi:'Presensi'})[page];
  if(!route)throw new Error('Halaman tidak ditemukan.');
  const template=HtmlService.createTemplateFromFile(route);
  if(route==='Tdd')template.tddDestinations=SiTariCore.getPublicFormDestinations('tdd');
  if(route==='Presensi'){
    template.rapatId=String(e&&e.parameter&&e.parameter.id||'');
    template.employeeImportCount=SiTariCore.getPublicEmployeeCount();
  }
  return template.evaluate().setTitle(route==='Tld'?'Pendaftaran Kunjungan Tamu Luar Daerah':route==='Tdd'?'Pendaftaran Kunjungan Tamu Dalam Daerah':'Dashboard Presensi').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function include_(name) {
  if(!['AttendancePolicy','MobileBase'].includes(name))throw new Error('Konten tidak tersedia.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function includeOrganizationStructure_() {return HtmlService.createHtmlOutputFromFile('OrganizationStructure').getContent();}
function registerTamuLuar(payload) {return SiTariCore.publicRegisterTamuLuar(payload);}
function registerTamuFo(payload) {return SiTariCore.publicRegisterTamuFo(payload);}
function getMasterData() {return SiTariCore.getPublicAttendanceMasterData();}
function getRapatCalendar() {return SiTariCore.getPublicAttendanceCalendar();}
function getVisitAttendanceRoster(payload) {return SiTariCore.getVisitAttendanceRoster(payload);}
function submitPresensiRapat(payload) {return SiTariCore.submitPresensiRapat(payload);}
