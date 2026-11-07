'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../../Admin/Index.html'), 'utf8');
const statuses = ['Non-SPPD', 'Menunggu Konfirmasi', 'Sudah Disposisi', 'Menunggu Kedatangan', 'Kelola SPPD', 'Selesai'];
function load() {
  const context = vm.createContext({ escapeHtml: value => String(value ?? '') });
  for (const name of ['getVisitStatus', 'renderVisitStatus', 'getSortedTamu', 'renderBidangBadges']) {
    const source = html.match(new RegExp('    function ' + name + '\\([^]*?\\n    \\}'));
    assert.ok(source, name + ' exists');
    vm.runInContext(source[0], context);
  }
  return context;
}
test('status sorting follows the requested workflow sequence in both directions', () => {
  const context = load();
  const rows = statuses.slice().reverse().map(status_kunjungan => ({status_kunjungan, bawa_sppd: true}));
  assert.deepEqual(Array.from(context.getSortedTamu(rows, {key:'status', direction:'asc'}), t => context.getVisitStatus(t).label), statuses);
  assert.deepEqual(Array.from(context.getSortedTamu(rows, {key:'status', direction:'desc'}), t => context.getVisitStatus(t).label), statuses.slice().reverse());
});
test('six statuses have distinct badge colours and preserve recorded workflow states', () => {
  const context = load();
  const colours = statuses.map(status_kunjungan => context.getVisitStatus({status_kunjungan, bawa_sppd:true}).colour);
  assert.equal(new Set(colours).size, 6);
  assert.match(colours[0], /slate/);
  assert.equal(context.getVisitStatus({bawa_sppd:false, status_kunjungan:'Check-in'}).label, 'Non-SPPD');
  assert.equal(context.getVisitStatus({bawa_sppd:true, status_kunjungan:'Check-in'}).label, 'Kelola SPPD');
  assert.equal(context.getVisitStatus({bawa_sppd:true, status_kunjungan:'Selesai'}).label, 'Selesai');
});
test('TLD destination badges use distinct colours and the local rows use matching PICs', () => {
  const context = load();
  const directory = require('../tld-directory').getPublicDestinations();
  const colours = directory.map(item => context.renderBidangBadges(item.bidang).match(/bg-[\w-]+/)?.[0]);
  assert.equal(new Set(colours).size, 9);
  const visitors = require('../fixtures').createFixtureStore().responses.getTamuList.data;
  visitors.forEach(visitor => {
    const selected = visitor.tujuan_bidang.split('; ').map(name => directory.find(item => item.bidang === name));
    assert.ok(selected.every(Boolean), visitor.tujuan_bidang);
    assert.equal(visitor.lo_nama, selected.map(item => item.pic).join('; '));
  });
});
