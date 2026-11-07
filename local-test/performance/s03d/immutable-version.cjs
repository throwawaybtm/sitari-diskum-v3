'use strict';
// Validate, never normalize: callers must supply a canonical immutable version string.
function isImmutableVersion(value){
 return typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&Number.isSafeInteger(Number(value))&&String(Number(value))===value;
}
module.exports={isImmutableVersion};
