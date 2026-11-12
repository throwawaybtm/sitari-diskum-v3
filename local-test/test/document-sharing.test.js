'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');

function uploadContext(file) {
  const uploads = [];
  const folder = {
    createFile(blob) {
      uploads.push(blob);
      return {
        getUrl: () => 'https://drive.example/private-document',
        setSharing() { assert.fail('Sensitive uploads must preserve configured folder access.'); }
      };
    }
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'private-folder' }) },
    DriveApp: {
      getFolderById: () => folder,
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' }
    },
    Utilities: {
      base64Decode: () => [1, 2, 3],
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      getUuid: () => 'synthetic-id'
    }
  });
  vm.runInContext(read(file), context);
  context.getSuratFolder_ = () => folder;
  context.validateTldUpload_ = () => {};
  context.validateVisitFile_ = () => ({ mime: 'application/pdf', size: 3 });
  return { context, uploads };
}

test('legacy document sharing migration performs no Drive or database access', () => {
  const context = vm.createContext({});
  vm.runInContext(read('Admin/DocumentSharing.js'), context);
  assert.doesNotThrow(() => context.ensurePublicVisitDocuments_());
  assert.doesNotMatch(read('Admin/Code.js'), /\bensurePublicVisitDocuments_\(\);/);
});

for (const file of ['Tamu-Luar/Code.js', 'Admin/Code.js']) {
  test(file + ' uploads documents without making them publicly accessible', () => {
    const { context, uploads } = uploadContext(file);
    const storage = file === 'Tamu-Luar/Code.js' ? [] : 'surat';
    const url = context.saveBase64ToDrive_('data:application/pdf;base64,AQID', 'Surat.pdf', 'application/pdf', storage);
    assert.equal(url, 'https://drive.example/private-document');
    assert.equal(uploads.length, 1);
  });
}

test('workflow evidence uploads preserve configured folder access', () => {
  const { context, uploads } = uploadContext('Admin/VisitWorkflowStorage.js');
  const result = context.saveVisitWorkflowFile_({ data: 'data:application/pdf;base64,AQID', name: 'Bukti.pdf' }, 'TEST', 'absen');
  assert.equal(result.url, 'https://drive.example/private-document');
  assert.equal(result.name, 'Bukti.pdf');
  assert.equal(uploads.length, 1);
});

test('generated intake and its template preserve document access', () => {
  for (const file of ['Admin/PublicIntake.js', 'config-templates/Admin/PublicIntake.js.example']) {
    assert.doesNotMatch(read(file), /\.setSharing\(DriveApp\.Access\.ANYONE_WITH_LINK/);
  }
});
