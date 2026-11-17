'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pub=path.join(__dirname,'../../Public');
// Public has no include(); a bare include( in a template throws "include is not defined" at runtime.
test('generated Public templates only call include_ for files Public ships and allows',()=>{
 const code=fs.readFileSync(path.join(pub,'Code.js'),'utf8');
 const allowed=JSON.parse(code.match(/if\(!(\[[^\]]*\])\.includes\(name\)\)/)[1].replace(/'/g,'"'));
 for(const file of fs.readdirSync(pub).filter(f=>f.endsWith('.html'))){
  const html=fs.readFileSync(path.join(pub,file),'utf8');
  assert.doesNotMatch(html,/<\?!=\s*include\(/,file+' calls include() which Public does not define');
  for(const [,name] of html.matchAll(/include_\('([^']+)'\)/g)){
   assert.ok(allowed.includes(name),file+' includes '+name+' which include_ rejects');
   assert.ok(fs.existsSync(path.join(pub,name+'.html')),file+' includes '+name+' which is not in Public/');
  }
 }
});
