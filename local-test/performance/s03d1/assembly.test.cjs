'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
test('assembly emits only fixed read exports and pinned unmodified templates, rejects production configuration',()=>{
 const {assemble,localConfig,ADMIN_READS,PUBLIC_READS,pinned}=require('./assemble.cjs');const a=assemble(localConfig());
 assert.deepEqual(a.inventory.exports.Admin,['doGet',...ADMIN_READS]);assert.deepEqual(a.inventory.exports.Public,['doGet',...PUBLIC_READS]);
 for(const role of ['Admin','Public']){new vm.Script(a[role]['Code.js']);for(const [name,content]of Object.entries(a[role]))if(name.endsWith('.html')&&name!=='StageGuard.html')assert.equal(content,pinned(role+'/'+name));}
 assert.equal(a.Public['appsscript.json'].includes('"developmentMode": false'),true);
 for(const change of [{token:'SECRET'},{adminUrl:'https://script.google.com/macros/s/PRODUCTION/exec'},{publicLibraryId:'production-library'},{approverEmail:''}])assert.throws(()=>assemble({...localConfig(),...change}),/S03D/);
 assert.ok(a.inventory.functions.every(r=>!/save|submit|ensure|setup|migrat|assignLiaisonOfficer|configure/i.test(r.name)));
});
test('private writer rejects junctions that could overwrite existing source or configuration',()=>{
 const fs=require('node:fs'),path=require('node:path');const {write}=require('./assemble.cjs');
 const base=path.resolve(__dirname,'../../../outputs/performance-s03d1');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'write-safety-')),target=path.join(dir,'sentinel'),root=path.join(dir,'assembly');
 fs.mkdirSync(target);fs.mkdirSync(root);fs.writeFileSync(path.join(target,'Code.js'),'preserve');fs.symlinkSync(target,path.join(root,'Admin'),'junction');
 assert.throws(()=>write({Admin:{'Code.js':'overwrite'},Public:{},inventory:{},config:{}},root),/S03D1/);assert.equal(fs.readFileSync(path.join(target,'Code.js'),'utf8'),'preserve');
});
