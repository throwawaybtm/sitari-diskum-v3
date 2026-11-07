'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Admin', 'MeetingRooms.js'), 'utf8'), context);
module.exports = {
  rooms: JSON.parse(vm.runInContext('JSON.stringify(MEETING_ROOM_DIRECTORY)', context)),
  normalize: rooms => context.normalizeMeetingRooms_(rooms),
  validateSchedule: payload => context.validateMeetingSchedule_(payload)
};
