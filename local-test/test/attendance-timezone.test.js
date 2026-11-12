'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function attendanceContext() {
  const context = vm.createContext({
    Utilities: {
      formatDate(date, timeZone) {
        const parts = {};
        new Intl.DateTimeFormat('en-GB', {
          timeZone,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(date).forEach(part => { parts[part.type] = part.value; });
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Admin/AgendaAttendanceData.js'), 'utf8'), context);
  return context;
}

test('legacy Sheets Date cells retain New York wall time while ISO instants display in Jakarta', () => {
  const context = attendanceContext();
  const instant = new Date('2026-11-12T01:30:45Z');
  assert.equal(context.agendaAttendanceTime_(instant, 'America/New_York'), '2026-11-11 20:30');
  assert.equal(context.agendaAttendanceTime_(instant.toISOString(), 'America/New_York'), '2026-11-12 08:30');
  assert.equal(context.agendaAttendanceTime_(instant, 'Asia/Jakarta'), '2026-11-12 08:30');
});

test('legacy attendance Date formatting respects New York daylight saving transitions', () => {
  const context = attendanceContext();
  const cases = [
    ['2026-03-08T06:30:00Z', '2026-03-08 01:30'],
    ['2026-03-08T07:30:00Z', '2026-03-08 03:30'],
    ['2026-11-01T05:30:00Z', '2026-11-01 01:30'],
    ['2026-11-01T06:30:00Z', '2026-11-01 01:30']
  ];
  for (const [iso, expected] of cases) {
    assert.equal(context.agendaAttendanceTime_(new Date(iso), 'America/New_York'), expected);
  }
});

test('attendance wall-time strings remain stable across Sheets and GAS timezones', () => {
  const context = attendanceContext();
  for (const timeZone of ['America/New_York', 'Asia/Jakarta']) {
    assert.equal(context.agendaAttendanceTime_('2026-11-05 00:15:30', timeZone), '2026-11-05 00:15');
    assert.equal(context.agendaAttendanceTime_('05-11-2026 00:15:30', timeZone), '2026-11-05 00:15');
    assert.equal(context.agendaAttendanceTime_('invalid', timeZone), '');
  }
});
