'use strict';
/**
 * The private, gitignored destination files hold data only: one `const TLD_DESTINATIONS = [...]`
 * (Tamu-Luar) or `const TDD_DESTINATIONS = [...]` (Tamu-FO). All intake logic is tracked in
 * Tamu-Luar/IntakeRules.js and Tamu-FO/IntakeRules.js. build-public.js pastes these files into one
 * IIFE, where a second `const` of the same name is a SyntaxError that breaks every registration, and a stale
 * function silently shadows the tracked one. These helpers find anything besides the data array,
 * reporting symbol names only, never file contents.
 */
const fs = require('node:fs');
const path = require('node:path');

const PRIVATE_DESTINATION_FILES = Object.freeze([
  Object.freeze({ file: 'Tamu-Luar/Destinations.js', symbol: 'TLD_DESTINATIONS' }),
  Object.freeze({ file: 'Tamu-FO/Destinations.js', symbol: 'TDD_DESTINATIONS' })
]);

/** Replaces comments with spaces and string/template contents with blanks, keeping offsets. */
function maskCommentsAndStrings(source) {
  const out = source.split('');
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < source.length) {
    const c = source[i], n = source[i + 1];
    if (c === '/' && n === '/') { const end = source.indexOf('\n', i); const stop = end < 0 ? source.length : end; blank(i, stop); i = stop; continue; }
    if (c === '/' && n === '*') { const end = source.indexOf('*/', i + 2); const stop = end < 0 ? source.length : end + 2; blank(i, stop); i = stop; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      blank(i + 1, Math.min(j, source.length)); i = j + 1; continue;
    }
    i++;
  }
  return out.join('');
}

/** Index just past the `]` closing the bracket that opens at `start`, or -1. */
function matchBracket(masked, start) {
  let depth = 0;
  for (let i = start; i < masked.length; i++) {
    if (masked[i] === '[' || masked[i] === '{' || masked[i] === '(') depth++;
    else if (masked[i] === ']' || masked[i] === '}' || masked[i] === ')') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** Names of top-level declarations in already-masked source (locals inside braces are skipped). */
function topLevelDeclarations(masked) {
  const depthAt = [];
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    depthAt[i] = depth;
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}') depth = Math.max(0, depth - 1);
  }
  const names = [];
  const declRe = /\b(?:const|let|var|function\*?|class|async\s+function)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = declRe.exec(masked))) if (depthAt[m.index] === 0 && !names.includes(m[1])) names.push(m[1]);
  return names;
}

/**
 * Inspects one private destinations source. Returns { hasData, extras, otherCode }:
 * hasData   - the `const SYMBOL = [ ... ];` declaration exists
 * extras    - names of any other top-level declarations (const/let/var/function/class)
 * otherCode - true when anything else (not a declaration) remains
 */
function inspectDestinationsSource(source, symbol) {
  const masked = maskCommentsAndStrings(String(source || ''));
  const decl = new RegExp('\\b(?:const|let|var)\\s+' + symbol + '\\s*=\\s*\\[');
  const match = decl.exec(masked);
  let rest = masked;
  let dataBody = '';
  if (match) {
    const open = match.index + match[0].length - 1;
    const close = matchBracket(masked, open);
    if (close > 0) {
      dataBody = masked.slice(open + 1, close - 1);
      let end = close;
      while (end < masked.length && /[\s;]/.test(masked[end])) end++;
      rest = masked.slice(0, match.index) + ' '.repeat(end - match.index) + masked.slice(end);
    }
  }
  const extras = topLevelDeclarations(rest);
  // Code hidden inside the array (an IIFE, an arrow function, a call) is not data.
  const codeInData = Boolean(dataBody) && /\bfunction\b|=>|\(/.test(dataBody);
  const otherCode = codeInData || (!extras.length && rest.replace(/[\s;]/g, '').length > 0);
  return { hasData: Boolean(match), extras, otherCode };
}

/** Problems for every private destinations file under `root`; missing files are skipped. */
function findPrivateDestinationProblems(root) {
  const problems = [];
  for (const { file, symbol } of PRIVATE_DESTINATION_FILES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const result = inspectDestinationsSource(fs.readFileSync(full, 'utf8'), symbol);
    if (!result.hasData) problems.push({ file, symbol, message: `${file} does not declare ${symbol}.` });
    if (result.extras.length) problems.push({ file, symbol, extras: result.extras, message: `${file} defines ${result.extras.join(', ')} besides ${symbol}.` });
    if (result.otherCode) problems.push({ file, symbol, message: `${file} contains code besides ${symbol}.` });
  }
  return problems;
}

const INTAKE_RULE_FILES = Object.freeze(['Tamu-Luar/IntakeRules.js', 'Tamu-FO/IntakeRules.js']);
const INTAKE_BUNDLE_FILE = 'Admin/PublicIntake.js';

/**
 * The generated, gitignored Admin/PublicIntake.js is what the Admin library actually runs. Returns the
 * names declared in the tracked IntakeRules.js files that this bundle lacks (an old build), or [] when
 * it is current or absent. Names only, never contents.
 */
function findStaleIntakeBundle(root) {
  const bundlePath = path.join(root, INTAKE_BUNDLE_FILE);
  if (!fs.existsSync(bundlePath)) return [];
  const bundle = maskCommentsAndStrings(fs.readFileSync(bundlePath, 'utf8'));
  const required = [];
  for (const rel of INTAKE_RULE_FILES) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) required.push(...topLevelDeclarations(maskCommentsAndStrings(fs.readFileSync(full, 'utf8'))));
  }
  return required.filter(name => !new RegExp('\\b(?:const|let|var|function)\\s+' + name.replace(/\$/g, '\\$') + '\\b').test(bundle));
}

/** Throws a clear, content-free error when a private destinations file is not data-only. */
function assertDataOnlyDestinations(root) {
  const problems = findPrivateDestinationProblems(root);
  if (!problems.length) return;
  throw new Error([
    'Private destinations files must hold only their data array (intake logic is tracked in Tamu-Luar/IntakeRules.js and Tamu-FO/IntakeRules.js):',
    ...problems.map(p => '  - ' + p.message),
    'Trim each file to its `const ..._DESTINATIONS = [ ... ];` array (see docs/LOCAL_SETUP.md, "Trim the private destinations files"), then build again.'
  ].join('\n'));
}

module.exports = { PRIVATE_DESTINATION_FILES, INTAKE_BUNDLE_FILE, inspectDestinationsSource, findPrivateDestinationProblems, findStaleIntakeBundle, assertDataOnlyDestinations };
