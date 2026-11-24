'use strict';
// The lock notice in the meeting modal is shown and hidden with the `hidden` attribute
// (applyModalRapatMode sets banner.hidden = !locked). Its Tailwind `flex` utility would override
// the browser's [hidden] rule, so "Buat Agenda Rapat Baru" showed "Agenda rapat ini sudah dikunci".
// A rule in the client-approved stylesheet must keep [hidden] winning for this element.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('Admin/Index.html', 'utf8');
const stylesheet = fs.readFileSync('Admin/Stylesheet.html', 'utf8');

test('meeting lock banner starts hidden and keeps a display utility class', () => {
  const tag = index.match(/<div id="meetingEditLockBanner"[^>]*>/)?.[0] || '';
  assert.ok(tag, 'meetingEditLockBanner must exist');
  assert.match(tag, /\shidden[\s>]/, 'banner starts with the hidden attribute');
});

test('stylesheet hides the lock banner while it carries the hidden attribute', () => {
  const rule = stylesheet.match(/#meetingEditLockBanner\[hidden\]\s*\{([^}]*)\}/);
  assert.ok(rule, 'expected a #meetingEditLockBanner[hidden] rule in Admin/Stylesheet.html');
  assert.match(rule[1], /display\s*:\s*none/);
});

test('modal mode still toggles the banner only for locked (view) mode', () => {
  const fn = index.match(/function applyModalRapatMode\([\s\S]*?\n    }\n/)?.[0] || '';
  assert.match(fn, /if \(banner\) banner\.hidden = !locked;/);
});
