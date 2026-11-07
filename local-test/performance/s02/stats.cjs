'use strict';
function summarize(values) {
  if (!values.length || values.some(v => !Number.isFinite(v))) throw Error('Finite nonempty samples required');
  const sorted = [...values].sort((a,b) => a-b);
  const rank = p => sorted[Math.ceil(p*sorted.length)-1];
  return {samples:values.length,min:sorted[0],p50:rank(.5),p95:rank(.95),max:sorted.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length};
}
module.exports={summarize};
