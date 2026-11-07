'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {ROOT}=require('./synthetic.cjs');
const read=file=>fs.readFileSync(path.join(ROOT,'Admin',file),'utf8');
// Actual filtering/HTML generation, with DOM stubs. Does NOT measure layout/paint.
function createFrontend({indexHtml,searchHtml,phone=false}={}) {
  const roomContext=vm.createContext({});vm.runInContext(read('MeetingRooms.js'),roomContext);
  const rooms=JSON.parse(vm.runInContext('JSON.stringify(MEETING_ROOM_DIRECTORY)',roomContext));
  const fields={},context=vm.createContext({Intl,Date,MEETING_ROOMS:rooms,tamuTableState:{key:'waktu',direction:'desc'},document:{getElementById:id=>fields[id]||={value:'',dataset:{},innerHTML:'',classList:{add(){},remove(){}},querySelectorAll:()=>[]},querySelectorAll:()=>[]},window:{matchMedia:()=>({matches:phone})}});
  for(const file of ['AgendaSearch.html','AttendancePolicy.html'])vm.runInContext((file==='AgendaSearch.html'&&searchHtml!==undefined?searchHtml:read(file)).match(/<script>([^]*?)<\/script>/)[1],context);
  const source=indexHtml===undefined?read('Index.html'):indexHtml;
  for(const name of ['escapeHtml','formatVisitDateCompact','renderBidangBadges','getVisitStatus','renderVisitStatus','getSortedTamu','updateTamuSortHeadings','renderVisitRow','renderTamuTable','getMeetingRoomInfo','renderMeetingRoomBadge','formatMeetingDate','isMeetingOverdue','meetingStatusInfo','canAdminRecordAttendance','renderMeetingsList']) {
    const match=source.match(new RegExp('    function '+name+'\\([^]*?\\n    \\}'));
    if(!match)throw Error('Source boundary changed: '+name);vm.runInContext(match[0],context);
  }
  for(const name of ['monthlyGuestRows','monthlyReportMonthLabel','renderMonthlyReport'])vm.runInContext(read('Tools.html').match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'))?.[0]||read('Tools.html').split('\n').find(line=>line.startsWith('  function '+name+'(')),context);
  context.monthlyReportBusy=false;
  context.renderTableState=(el,cols,state,message)=>el.innerHTML=state+':'+message;
  context.renderPanelState=(el,state,message)=>el.innerHTML=state+':'+message;
  return {context,fields,measure(visits,agendas){
    context.allTamuData=visits;context.allRapatData=agendas;
    const start=performance.now();context.renderTamuTable(visits);const visitHtmlMs=performance.now()-start;
    const agendaStart=performance.now();context.renderMeetingsList(agendas);const agendaHtmlMs=performance.now()-agendaStart;
    return {visitHtmlMs,agendaHtmlMs,guestRowsRendered:(fields.tamuTableBody.innerHTML.match(/<tr\b/g)||[]).length,guestHtmlBytes:Buffer.byteLength(fields.tamuTableBody.innerHTML),agendaHtmlBytes:Buffer.byteLength(fields.meetingsListContainer.innerHTML)};
  },emptySearchCount(size){let serialized=0;const rows=Array.from({length:size},()=>({nested:{toJSON(){serialized++;return {};}}}));context.filterAgendaRecords_(rows,'','');return serialized;}};
}
module.exports={createFrontend};
