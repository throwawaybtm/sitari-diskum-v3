'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_FILES = [
  ['Tamu FO', path.join(PROJECT_ROOT, 'Tamu-FO', 'Code.js')],
  ['Tamu Luar', path.join(PROJECT_ROOT, 'Tamu-Luar', 'Code.js')]
];

function loadProjectFunctions(filePath) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
  return context;
}

for (const [projectName, filePath] of PROJECT_FILES) {
  test(`${projectName} builds a shared monthly TLD/TDD sequence`, () => {
    const context = loadProjectFunctions(filePath);
    assert.equal(typeof context.buildVisitCode_, 'function');

    const octoberCodes = [
      'TLD-01102026-001',
      'TDD-15102026-009',
      'TLD-30092026-099',
      'TM-FO-20261020-7777',
      'TDD-20102026-not-a-number'
    ];

    assert.equal(context.buildVisitCode_('TLD', '2026-10-25', octoberCodes), 'TLD-25102026-010');
    assert.equal(context.buildVisitCode_('TDD', '2026-10-25', octoberCodes), 'TDD-25102026-010');
    assert.equal(context.buildVisitCode_('TDD', '2026-11-01', octoberCodes), 'TDD-01112026-001');
    assert.equal(
      context.buildVisitCode_('TLD', '2026-10-31', ['TDD-01102026-999']),
      'TLD-31102026-1000'
    );
    assert.throws(() => context.buildVisitCode_('FO', '2026-10-25', []), /prefix/i);
    assert.throws(() => context.buildVisitCode_('TLD', '25-10-2026', []), /date/i);
  });

  test(`${projectName} reads visit codes from Data_Tamu column 2`, () => {
    const context = loadProjectFunctions(filePath);
    assert.equal(typeof context.generateVisitCode_, 'function');

    const calls = [];
    const sheet = {
      getLastRow: () => 3,
      getRange: (...args) => {
        calls.push(args);
        return { getDisplayValues: () => [['TLD-01102026-001'], ['TDD-02102026-002']] };
      }
    };

    assert.equal(context.generateVisitCode_(sheet, 'TLD', '2026-10-25'), 'TLD-25102026-003');
    assert.deepEqual(calls, [[2, 2, 2, 1]]);
  });
}
