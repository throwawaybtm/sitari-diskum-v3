'use strict';
const fs=require('node:fs'),path=require('node:path');
const {isImmutableVersion}=require('./immutable-version.cjs');
const BASE='d1d02475acba50439835c8fcc5b163828897e9ea';
const KEYS=['mode','sourceCommit','adminProjectId','publicProjectId','publicLibraryId','publicLibraryVersion','spreadsheetId','folderId','documentIds','claims'];
const CLAIMS=['dedicatedAccountNoProductionAccess','syntheticOnly','noProductionCredentials','privateTestResources','readOnlyScopes','entryGuardsRemovedInStagingOnly','rpcAllowlistReviewed'];
function fail(){throw Error('S03D isolation declaration incomplete or rejected');}
function verify(c,forbidden=[]){
 if(!c||Object.keys(c).some(k=>!KEYS.includes(k))||c.mode!=='synthetic-staging'||c.sourceCommit!==BASE)fail();
 const ids=['adminProjectId','publicProjectId','spreadsheetId','folderId'].map(k=>c[k]);
 if(ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{3,200}$/.test(id))||new Set(ids).size!==ids.length)fail();
 if(c.publicLibraryId!==c.adminProjectId||!isImmutableVersion(c.publicLibraryVersion))fail();
 if(!Array.isArray(c.documentIds)||!c.documentIds.length||c.documentIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{3,200}$/.test(id)))fail();
 const resources=[...ids,...c.documentIds];if(new Set(resources).size!==resources.length||resources.some(id=>forbidden.includes(id)))fail();
 if(!c.claims||Object.keys(c.claims).length!==CLAIMS.length||CLAIMS.some(k=>c.claims[k]!==true))fail();
 // Assertions supplied by an operator are not independent cloud evidence or consent.
 return {localDeclarationValid:true,cloudIsolationVerified:false,deploymentApproved:false};
}
function knownProductionIds(){
 const root=path.resolve(__dirname,'../../..'),ids=[];
 for(const folder of ['Admin','Public']){
  const file=path.join(root,folder,'.clasp.json');if(fs.existsSync(file))ids.push(JSON.parse(fs.readFileSync(file,'utf8')).scriptId);
 }
 // Local registry is inspected only as strings; no credentials or remote calls.
 const registry=path.join(root,'deployments/2026-11-01/projects.json');
 if(fs.existsSync(registry)){const walk=x=>{if(typeof x==='string')ids.push(x,...(x.match(/[A-Za-z0-9_-]{20,}/g)||[]));else if(x&&typeof x==='object')Object.values(x).forEach(walk);};walk(JSON.parse(fs.readFileSync(registry,'utf8')));}
 return ids;
}
if(require.main===module){try{const c=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'isolation.example.json'),'utf8'));console.log(JSON.stringify(verify(c,knownProductionIds())));}catch{console.error('S03D local preflight failed; no cloud action attempted.');process.exitCode=1;}}
module.exports={verify,knownProductionIds,BASE};
