'use strict';

// Real network access is limited to the local HTTP harness. GAS notification
// transports are supplied by the individual VM tests as mocks.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Synthetic tests prohibit external network requests');
  }
  return originalFetch(input, options);
};
