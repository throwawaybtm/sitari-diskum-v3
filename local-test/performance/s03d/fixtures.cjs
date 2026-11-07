'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createEnvironment,ROOT}=require('../s02/synthetic.cjs');
function pdf(){
 const stream='BT /F1 18 Tf 40 740 Td (S03D Synthetic document) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];
 let text='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const xref=Buffer.byteLength(text);text+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return Buffer.from(text);
}
function fixtures(size=20){if(![20,200,1000].includes(size))throw Error('S03D cohort rejected');const env=createEnvironment({size,profile:'representative'});
 return {kind:'S03D synthetic fixture only',size,tables:JSON.parse(JSON.stringify(env.values))};
}
if(require.main===module){const data=fixtures(Number(process.argv[2]||20)),out=path.join(ROOT,'outputs/performance-s03d/fixtures-'+data.size);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'tables.json'),JSON.stringify(data,null,2));fs.writeFileSync(path.join(out,'synthetic.pdf'),pdf());fs.writeFileSync(path.join(out,'synthetic.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64'));console.log('Wrote local synthetic fixtures only; no cloud action.');}
module.exports={fixtures,pdf};
