'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=file=>fs.readFileSync(path.join(__dirname,'../../Admin',file),'utf8');
function access(properties={},email='',key='wife-session') {
  const context=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>email}),getTemporaryActiveUserKey:()=>key},PropertiesService:{getScriptProperties:()=>({getProperty:name=>properties[name]||null})}});
  vm.runInContext(source('VisitWorkflowStorage.js'),context);return context;
}
test('admin error message preserves the backend reason instead of showing the generic save failure',()=>{
  const fn=source('Index.html').match(/function responseMessage\(response, fallback\) \{[^]*?\n    \}/)[0];
  const c=vm.createContext({});vm.runInContext(fn,c);
  assert.equal(c.responseMessage({success:false,error:'Akun belum diizinkan.'},'Generic'),'Akun belum diizinkan.');
  assert.equal(c.responseMessage({error:{message:'Permission denied'}},'Generic'),'Permission denied');
  assert.equal(c.responseMessage({message:'Original message',error:'Other'},'Generic'),'Original message');
  assert.equal(c.responseMessage({error:{}},'Generic'),'Generic');
});
test('explicit demo mode allows all demo users while normal mode restricts workflow actions to the assigned approver',()=>{
  const base={APPROVER_EMAIL:'owner@example.com'};
  assert.doesNotThrow(()=>access(base,'OWNER@example.com').requireVisitAdmin_());
  assert.throws(()=>access(base).requireVisitAdmin_(),/belum diberi akses admin/);
  const enabled={...base,ADMIN_DEMO_MODE:'true'};
  assert.doesNotThrow(()=>access(enabled).requireVisitAdmin_());
  assert.doesNotThrow(()=>access(enabled,'wife@example.com','other-session').requireVisitAdmin_());
  assert.throws(()=>access({...enabled,ADMIN_DEMO_MODE:'false'},'wife@example.com').requireVisitAdmin_(),/belum diberi akses admin/);
  assert.throws(()=>access({...enabled,ADMIN_DEMO_MODE:'yes'}).requireVisitAdmin_(),/belum diberi akses admin/);
});
test('new deployment fails closed by default and preserves an explicit demo mode setting',()=>{
  const props={ADMIN_DEMO_MODE:'true'};
  const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:name=>props[name],setProperty:(name,value)=>props[name]=value,setProperties:values=>Object.assign(props,values)})}});
  vm.runInContext(source('DeploymentConfig.js'),c);c.configureNewDeployment_();
  assert.equal(props.ADMIN_DEMO_MODE,'true');delete props.ADMIN_DEMO_MODE;c.configureNewDeployment_();
  assert.equal(props.ADMIN_DEMO_MODE,'false');
  assert.equal(props.TAMU_FO_URL,props.PUBLIC_FORMS_BASE_URL+'?page=tdd');
  assert.equal(props.TAMU_LUAR_URL,props.PUBLIC_FORMS_BASE_URL+'?page=tld');
});
