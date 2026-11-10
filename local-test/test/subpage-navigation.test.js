'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('Admin/Index.html','utf8');
test('guest forms and attendance navigate the existing top-level tab without replacing history',()=>{
 const calls=[],c=vm.createContext({TAMU_LUAR_URL:'/public?page=tld',TAMU_FO_URL:'/public?page=tdd',APP_URL:'/public',window:{open:(...args)=>calls.push(args)},showToast:()=>assert.fail('valid URL should open')});
 for(const name of ['openFormTamuLuarTab','openFormTamuFoTab','openLayarPresensiTab','openLayarPresensiTabWithId']){
  const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    function ',start+1);vm.runInContext(html.slice(start,end),c);
 }
 c.openFormTamuLuarTab();c.openFormTamuFoTab();c.openLayarPresensiTab();c.openLayarPresensiTabWithId('42');
 assert.deepEqual(calls,[['/public?page=tld','_top'],['/public?page=tdd','_top'],['/public?page=presensi','_top'],['/public?page=presensi&id=42','_top']]);
});
test('Isi presensi uses the existing tab while document links retain their own target',()=>{
 assert.match(html.match(/<a href="[^\n]*\?page=presensi-admin"[^>]*>/)[0],/target="_top"/);
 assert.match(html,/escapeHtml\(meeting\.notula\.url\)\}" target="_blank"/);
});
