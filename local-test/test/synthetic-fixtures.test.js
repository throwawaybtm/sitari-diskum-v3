'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { employees, people, leaders, destinations } = require('./synthetic-fixtures');

test('synthetic directory satisfies the verified aggregate contracts deterministically', () => {
  assert.equal(employees.length, 70);
  assert.equal(new Set(employees.map(person => person.id)).size, 70);
  assert.equal(new Set(employees.map(person => person.bidang)).size, 8);
  assert.equal(employees.filter(person => !person.nip).length, 11);
  assert.equal(employees.filter(person => person.is_lo === 1).length, 9);
  assert.equal(employees.filter(person => person.bidang === people.legacy80.bidang).length, 9);
  assert.equal(people.legacy80.id, '80');
  assert.equal(people.legacy81.id, '81');
  assert.equal(employees.every(person => person.nama.startsWith('Synthetic Employee ')), true);
  assert.equal(employees.every(person => !person.nip || person.nip.startsWith('99000000 ')), true);
  assert.equal(new Set(employees.map(person => person.workload_count)).size, 5);
  assert.equal(new Set(leaders.map(person => person.nama)).size, 13);
  assert.deepEqual(leaders.map(person => person.no), Array.from({ length: 13 }, (_, i) => i + 1));
});

test('synthetic PIC contacts have unique keys and fabricated normalized numbers', () => {
  assert.equal(destinations.length, 9);
  assert.equal(new Set(destinations.map(item => item.id)).size, 9);
  for (const item of destinations) {
    assert.match(item.pic, /^Synthetic PIC \d$/);
    assert.match(item.phone, /^6200000000\d{2}$/);
  }
});
