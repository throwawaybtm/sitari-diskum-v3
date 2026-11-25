'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
// Private data array plus the tracked intake rules.
for (const file of ['Destinations.js', 'IntakeRules.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Tamu-FO', file), 'utf8'), context);
module.exports = {
  getPublicDestinations: () => context.getTddPublicDestinations_(),
  prepareVisit: payload => context.prepareTddVisit_(payload)
};
