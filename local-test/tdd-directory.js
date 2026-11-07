'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Tamu-FO', 'Destinations.js'), 'utf8'), context);
module.exports = {
  getPublicDestinations: () => context.getTddPublicDestinations_(),
  prepareVisit: payload => context.prepareTddVisit_(payload)
};
