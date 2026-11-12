'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {renderAdminHtml}=require('../server');
const html=fs.readFileSync('Admin/Index.html','utf8');

function extractNavHandlers(sourceHtml, context) {
 for(const name of ['openFormTamuLuarTab','openFormTamuFoTab','openLayarPresensiTab','openLayarPresensiTabWithId']){
  const start=sourceHtml.indexOf('    function '+name+'('),end=sourceHtml.indexOf('\n    function ',start+1);
  assert.ok(start>=0&&end>start,name+' function exists');
  vm.runInContext(sourceHtml.slice(start,end),context);
 }
 return context;
}

test('Form TLD, Form TDD, and external attendance URLs open safely in a new tab',()=>{
 const calls=[],popups=[];
 const c=vm.createContext({
  TAMU_LUAR_URL:'/public?page=tld',
  TAMU_FO_URL:'/public?page=tdd',
  APP_URL:'/public',
  window:{open:(...args)=>{calls.push(args);const popup={opener:'parent'};popups.push(popup);return popup;}},
  showToast:()=>assert.fail('valid URL should open')
 });
 extractNavHandlers(html,c);
 c.openFormTamuLuarTab();c.openFormTamuFoTab();c.openLayarPresensiTab();c.openLayarPresensiTabWithId('42');
 assert.deepEqual(calls,[
  ['/public?page=tld','_blank','noopener,noreferrer'],
  ['/public?page=tdd','_blank','noopener,noreferrer'],
  ['/public?page=presensi','_blank','noopener,noreferrer'],
  ['/public?page=presensi&id=42','_blank','noopener,noreferrer']
 ]);
 assert.equal(popups.length,4);
 assert.ok(popups.every(popup=>popup.opener===null));
});

test('new-tab navigation works when window.open returns null under noopener without replacing current page',()=>{
 const calls=[];
 const c=vm.createContext({
  TAMU_LUAR_URL:'https://script.google.com/macros/s/demo/exec?page=tld',
  TAMU_FO_URL:'https://script.google.com/macros/s/demo/exec?page=tdd',
  APP_URL:'https://script.google.com/macros/s/demo/exec',
  window:{open:(...args)=>{calls.push(args);return null;}},
  showToast:()=>assert.fail('valid URL should open')
 });
 extractNavHandlers(html,c);
 c.openFormTamuLuarTab();c.openFormTamuFoTab();c.openLayarPresensiTab();c.openLayarPresensiTabWithId('99');
 assert.equal(calls.length,4);
 assert.ok(calls.every(args=>args[1]==='_blank'&&args[2]==='noopener,noreferrer'));
});

test('missing Form TLD or Form TDD URLs show an error toast without calling window.open',()=>{
 const toasts=[],opens=[];
 const c=vm.createContext({
  TAMU_LUAR_URL:'',
  TAMU_FO_URL:'',
  APP_URL:'/public',
  window:{open:(...args)=>opens.push(args)},
  showToast:(...args)=>toasts.push(args)
 });
 extractNavHandlers(html,c);
 c.openFormTamuLuarTab();
 c.openFormTamuFoTab();
 assert.deepEqual(opens,[]);
 assert.deepEqual(toasts,[
  ['error','URL Belum Diatur','Atur Script Property TAMU_LUAR_URL pada project Admin.'],
  ['error','URL Belum Diatur','Atur Script Property TAMU_FO_URL pada project Admin.']
 ]);
});

test('rendered Admin HTML wires Form TLD and Form TDD buttons to new-tab handlers while keeping internal Admin navigation unchanged',()=>{
 const rendered=renderAdminHtml({baseUrl:'http://127.0.0.1:4173'});
 const calls=[];
 const tamuLuarUrl=rendered.match(/const TAMU_LUAR_URL = "([^"]*)";/)[1];
 const tamuFoUrl=rendered.match(/const TAMU_FO_URL = "([^"]*)";/)[1];
 const appUrl=rendered.match(/const APP_URL = "([^"]*)";/)[1];
 const c=vm.createContext({
  TAMU_LUAR_URL:tamuLuarUrl,
  TAMU_FO_URL:tamuFoUrl,
  APP_URL:appUrl,
  window:{open:(...args)=>calls.push(args)},
  showToast:()=>assert.fail('valid local URL should open')
 });
 extractNavHandlers(rendered,c);
 c.openFormTamuLuarTab();
 c.openFormTamuFoTab();
 assert.deepEqual(calls,[
  ['http://127.0.0.1:4173/tamu-luar','_blank','noopener,noreferrer'],
  ['http://127.0.0.1:4173/tamu-fo','_blank','noopener,noreferrer']
 ]);
 assert.equal((rendered.match(/onclick="openFormTamuLuarTab\(\)"/g)||[]).length,2);
 assert.equal((rendered.match(/onclick="openFormTamuFoTab\(\)"/g)||[]).length,2);
 for(const tab of ['dashboard','tamu','calendar','qrcode']){
  assert.match(rendered,new RegExp(`onclick="switchTab\\('${tab}'\\)"`));
 }
 assert.match(rendered.match(/<a href="[^\n]*\?page=presensi-admin"[^>]*>/)[0],/target="_blank"\s+rel="noopener noreferrer"/);
 assert.match(rendered,/escapeHtml\(meeting\.notula\.url\)\}" target="_blank" rel="noopener noreferrer"/);
});

test('missing APP_URL shows an error toast without calling window.open for Presensi subpages',()=>{
 const toasts=[],opens=[];
 const c=vm.createContext({
  TAMU_LUAR_URL:'/public?page=tld',
  TAMU_FO_URL:'/public?page=tdd',
  APP_URL:'',
  window:{open:(...args)=>opens.push(args)},
  showToast:(...args)=>toasts.push(args)
 });
 extractNavHandlers(html,c);
 c.openLayarPresensiTab();
 c.openLayarPresensiTabWithId('42');
 assert.deepEqual(opens,[]);
 assert.equal(toasts.length,2);
 assert.ok(toasts.every(args=>args[0]==='error'));
});

test('all external document and photo preview links use target="_blank" rel="noopener noreferrer"',()=>{
 for(const file of ['Admin/Index.html','Admin/VisitModal.html','Admin/MeetingPhotos.html','Admin/TddModal.html']){
  const content=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(content,/target="_blank"\s+rel="noopener"(?!\s+noreferrer)/,file+' should include noreferrer');
  assert.match(content,/target="_blank"[^>]*rel="noopener noreferrer"|rel = 'noopener noreferrer'/,file+' uses target="_blank" rel="noopener noreferrer"');
 }
 assert.doesNotMatch(html,/target="_top"/,'Admin/Index.html should not navigate the top window');
});
