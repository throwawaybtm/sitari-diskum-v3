/* Isolated test postlude; never included in Apps Script. No writes. */
{
 const originalExercise=s02.exercise;
 s02.exercise=async()=>{
  const result=await originalExercise();
  const measure=async(name,action)=>{const start=performance.now();action();await paint();result.metrics[name]=performance.now()-start;};
  await measure('guestNavigationPaintMs',()=>switchTab('tamu'));
  const visit=document.getElementById('visitSearch');
  await measure('guestSearchPaintMs',()=>{visit.value='synthetic person, impossible';visit.dispatchEvent(new Event('input',{bubbles:true}));});
  await measure('guestClearPaintMs',()=>{visit.value='';visit.dispatchEvent(new Event('input',{bubbles:true}));});
  await measure('agendaNavigationPaintMs',()=>switchTab('calendar'));
  const meeting=document.getElementById('meetingSearch');
  await measure('agendaSearchPaintMs',()=>{meeting.value='synthetic, impossible';meeting.dispatchEvent(new Event('input',{bubbles:true}));});
  await measure('agendaClearPaintMs',()=>{meeting.value='';meeting.dispatchEvent(new Event('input',{bubbles:true}));});
  await measure('cachedNavigationPaintMs',()=>switchTab('tamu'));
  // Include unchanged DOM replacements in the profile, without adding production caches.
  await measure('repeatGuestPaintMs',()=>renderTamuTable(allTamuData));
  result.metrics.domNodeCount=document.querySelectorAll('*').length;
  result.metrics.guestRowCount=document.querySelectorAll('#tamuTableBody tr').length;
  result.metrics.agendaCardCount=document.getElementById('meetingsListContainer').children.length;
  // Copy live counters after all interactions; original result's arrays are shared.
  result.longTaskCount=s02.longTasks.length;result.longTaskMs=s02.longTasks.reduce((a,b)=>a+b,0);
  return result;
 };
}
