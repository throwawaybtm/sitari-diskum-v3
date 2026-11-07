'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),{createRequire}=require('node:module');
const {assemble,localConfig,write}=require('../s03d1/assemble.cjs');
const {verify}=require('../s03d/preflight.cjs');
const BASE='bafc0bc8e505e65e4aa924ebb6e17e662b7078f7';
function declaration(version){const c=localConfig();return {mode:'synthetic-staging',sourceCommit:'d1d02475acba50439835c8fcc5b163828897e9ea',adminProjectId:c.adminProjectId,publicProjectId:c.publicProjectId,publicLibraryId:c.publicLibraryId,publicLibraryVersion:version,spreadsheetId:c.spreadsheetId,folderId:'synthetic-folder',documentIds:c.documentIds,claims:Object.fromEntries(['dedicatedAccountNoProductionAccess','syntheticOnly','noProductionCredentials','privateTestResources','readOnlyScopes','entryGuardsRemovedInStagingOnly','rpcAllowlistReviewed'].map(k=>[k,true]))};}
const invalid=[1,0,-1,1.5,Infinity,NaN,undefined,null,true,false,[],['1'],{},new String('1'),{toString(){throw Error('must not coerce');}},1n,'',' ','\t','0','00','01','-1','+1','1.0','1.5','1e3','0x10','v1','latest','HEAD','development','dev','1\n','1\r\n','1\0',' 1','1 ','1\u00a0','\u0661','\uff11','9007199254740992','9'.repeat(400)];
test('both staging entry validators reject coercible, floating, development and malformed versions before assembly',()=>{
 for(const version of invalid){assert.throws(()=>assemble({...localConfig(),publicLibraryVersion:version}),/S03D/);assert.throws(()=>verify(declaration(version)),/S03D/);}
});
test('canonical positive version strings retain exact string type in the immutable staging dependency',()=>{
 for(const version of ['1','37','123456789','9007199254740991']){
  assert.equal(verify(declaration(version)).deploymentApproved,false);
  const cfg={...localConfig(),mode:'future-staging',adminUrl:'https://script.google.com/macros/s/S03D2_TEST_ONLY_ADMIN/exec',publicUrl:'https://script.google.com/macros/s/S03D2_TEST_ONLY_PUBLIC/exec',publicLibraryVersion:version};
  const a=assemble(cfg),lib=JSON.parse(a.Public['appsscript.json']).dependencies.libraries[0];assert.equal(lib.version,version);assert.equal(typeof lib.version,'string');assert.equal(lib.libraryId,cfg.adminProjectId);assert.equal(lib.developmentMode,false);
 }
});
test('valid default assembly is byte-identical to approved executable baseline with unchanged source hashes and exports',()=>{
 const file=path.resolve(__dirname,'../s03d1/assemble.cjs'),code=cp.execFileSync('git',['show',BASE+':local-test/performance/s03d1/assemble.cjs'],{encoding:'utf8'}),module={exports:{}};
 vm.runInNewContext(code,{require:createRequire(file),module,__dirname:path.dirname(file),__filename:file,process,console,URL},{timeout:3000});
 const before=module.exports.assemble(module.exports.localConfig()),after=assemble(localConfig());
 for(const role of ['Admin','Public']){assert.deepEqual(Object.keys(after[role]),Array.from(Object.keys(before[role])));for(const name of Object.keys(after[role]))assert.equal(after[role][name],before[role][name],role+'/'+name);new vm.Script(after[role]['Code.js']);}
 for(const key of ['sources','functions','exports','artifacts'])assert.equal(JSON.stringify(after.inventory[key]),JSON.stringify(before.inventory[key]),key);
});
test('invalid private CLI configuration cannot write or replace generated artifacts',()=>{
 const good=assemble(localConfig()),root=write(good),before=new Map();
 for(const role of ['Admin','Public'])for(const name of Object.keys(good[role]))before.set(path.join(root,role,name),fs.readFileSync(path.join(root,role,name)));
 const dir=fs.mkdtempSync(path.resolve(root,'../invalid-version-')),file=path.join(dir,'config.private.json');
 for(const version of [1,'0','latest','1\n']){
  fs.writeFileSync(file,JSON.stringify({...localConfig(),publicLibraryVersion:version}));const r=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../s03d1/assemble.cjs'),file],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/S03D1 assembly rejected/);for(const [target,bytes]of before)assert.ok(fs.readFileSync(target).equals(bytes));
 }
});
