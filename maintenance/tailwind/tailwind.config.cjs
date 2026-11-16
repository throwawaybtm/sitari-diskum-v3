// Matches the Play CDN defaults: no theme changes, no plugins, Preflight on.
// Content is limited to tracked Admin files so gitignored private config is never scanned.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const files = execFileSync('git', ['ls-files', '--', 'Admin/*.html', 'Admin/*.js'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).map(file => path.join(root, file));

module.exports = {
  content: { files },
  theme: { extend: {} },
  plugins: []
};
