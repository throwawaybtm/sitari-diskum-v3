'use strict';

// Reuse the GAS directory and validation without publishing its contact numbers.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Tamu-Luar', 'Destinations.js'), 'utf8'), context);

module.exports = {
  getPublicDestinations: () => context.getTldPublicDestinations_(),
  prepareVisit: payload => {
    context.validateTldRequiredFields_(payload);
    return context.prepareTldVisit_(payload);
  }
};
