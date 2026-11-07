'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../../Admin/Index.html'), 'utf8');

test('guest sorting preserves the original order until clicked, sorts all rows, and toggles direction', () => {
  const fields = {};
  const context = vm.createContext({
    document: { getElementById: id => fields[id] ||= {}, querySelectorAll: () => [] },
    escapeHtml: v => String(v ?? ''), formatVisitDateCompact: v => v, renderBidangBadges: v => v,
    renderVisitStatus: () => 'Non-SPPD', getVisitStatus: () => ({label:'Non-SPPD'})
  });
  context.filterAgendaRecords_=require('../agenda-search').filter;
  const rows = Array.from({length: 23}, (_, i) => ({ instansi: `Instansi ${23-i}`, kode_kunjungan: String(i) }));
  context.rows = rows;
  vm.runInContext('const tamuTableState = {key: null, direction: "asc"}; let allTamuData = rows;\n'
    + html.slice(html.indexOf('    function getSortedTamu('), html.indexOf('    function bukaModalPresensi(')), context);
  assert.equal(context.getSortedTamu(rows, {key: null})[0].instansi, 'Instansi 23');
  context.sortTamuTable('instansi');
  assert.ok(fields.tamuTableBody.innerHTML.indexOf('Instansi 1<') < fields.tamuTableBody.innerHTML.indexOf('Instansi 23<'));
  assert.equal((fields.tamuTableBody.innerHTML.match(/<tr /g) || []).length, 23);
  context.sortTamuTable('instansi');
  assert.ok(fields.tamuTableBody.innerHTML.indexOf('Instansi 23<') < fields.tamuTableBody.innerHTML.indexOf('Instansi 1<'));
  assert.equal(rows[0].instansi, 'Instansi 23');
  assert.ok(!html.includes('tamu-pagination'));
});
