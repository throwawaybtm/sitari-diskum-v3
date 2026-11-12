'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');
const { employees, leaders, destinations, deploymentConfigSource } = require('./test/synthetic-fixtures');

const root = path.resolve(__dirname, '..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sitari-synthetic-'));
function write(relative, content) {
  const target = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
try {
  // Copy tracked sources plus new test support. Never read ignored private files.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  const additions = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z', 'local-test'], { cwd: root }).toString().split('\0').filter(Boolean);
  for (const relative of new Set([...tracked, ...additions])) {
    write(relative, fs.readFileSync(path.join(root, relative)));
  }
  for (const relative of tracked.filter(file => file.startsWith('config-templates/') && file.endsWith('.example'))) {
    write(relative.slice('config-templates/'.length, -'.example'.length), fs.readFileSync(path.join(root, relative)));
  }
  write('Admin/EmployeeDirectory.js', 'const DISKUM_EMPLOYEE_DIRECTORY = ' + JSON.stringify(employees) + ';\n');
  write('local-test/previews/employee-directory.json', JSON.stringify(employees));
  write('Admin/DeploymentConfig.js', deploymentConfigSource);
  for (const [relative, symbol] of [
    ['Admin/VisitPicContacts.js', 'VISIT_PIC_CONTACTS'],
    ['Tamu-FO/Destinations.js', 'TDD_DESTINATIONS'],
    ['Tamu-Luar/Destinations.js', 'TLD_DESTINATIONS']
  ]) {
    const original = fs.readFileSync(path.join(workspace, relative), 'utf8');
    write(relative, original.replace(new RegExp(`const ${symbol} = \\[.*?\\];`, 's'), `const ${symbol} = ${JSON.stringify(destinations)};`));
  }
  const intake = fs.readFileSync(path.join(workspace, 'Admin/PublicIntake.js'), 'utf8');
  write('Admin/PublicIntake.js', intake.replace(/const (TLD_DESTINATIONS|TDD_DESTINATIONS) = \[.*?\];/gs, (_, symbol) => `const ${symbol} = ${JSON.stringify(destinations)};`));
  // Inject fictional leadership identities at the data seam in disposable copies.
  // The production hierarchy implementation and unit ordering stay byte-identical.
  let leadershipReference;
  for (const [relative, symbol] of [
    ['Admin/AgendaAttendanceData.js', 'OFFICIAL_LEADERSHIP_ORDER_'],
    ['Admin/RapatPimpinan.html', 'RAPAT_PIMPINAN_DIRECTORY']
  ]) {
    const source = fs.readFileSync(path.join(workspace, relative), 'utf8');
    const pattern = symbol === 'RAPAT_PIMPINAN_DIRECTORY'
      ? /const RAPAT_PIMPINAN_DIRECTORY = Object\.freeze\(\[.*?\]\.map\(item => Object\.freeze\(item\)\)\);/s
      : /const OFFICIAL_LEADERSHIP_ORDER_ = \[.*?\];/s;
    if (!pattern.test(source)) throw new Error(`Leadership fixture seam missing in ${relative}`);
    const context = vm.createContext({});
    vm.runInContext(source.match(pattern)[0], context);
    const original = JSON.parse(vm.runInContext(`JSON.stringify(${symbol})`, context));
    const identityContract = JSON.stringify(original.map(({ no, nama, nip }) => ({ no, nama, nip })));
    if (leadershipReference && identityContract !== leadershipReference) {
      throw new Error('Checked-in server and UI leadership identity/order contracts differ');
    }
    leadershipReference = identityContract;
    const replacement = original.map((item, index) => ({ ...item, nama: leaders[index].nama, nip: leaders[index].nip }));
    const data = JSON.stringify(replacement);
    const expression = symbol === 'RAPAT_PIMPINAN_DIRECTORY'
      ? `Object.freeze(${data}.map(item => Object.freeze(item)))`
      : data;
    write(relative, source.replace(pattern, `const ${symbol} = ${expression};`));
  }
  const files = process.argv.slice(2);
  const tests = files.length ? files : fs.readdirSync(path.join(workspace, 'local-test/test')).filter(file => file.endsWith('.test.js')).map(file => 'local-test/test/' + file);
  const result = spawnSync(process.execPath, ['--require', './local-test/test/synthetic-network-guard.js', '--test', ...tests], { cwd: workspace, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 1 : result.status;
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
