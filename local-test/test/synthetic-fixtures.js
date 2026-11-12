'use strict';

// All identities and identifiers below are fabricated. Only aggregate contracts
// and public organizational labels inform this deterministic dataset.
const units = [
  ['Dinas', 2], ['Sekretariat', 15],
  ['Bidang Pemberdayaan dan Pelindungan Koperasi', 9],
  ['Bidang Pengawasan Koperasi', 8], ['Bidang Kewirausahaan', 7],
  ['Bidang Pengembangan Usaha Mikro', 8],
  ['UPTD Pengelolaan Dana Bergulir', 8], ['UPTD PLUT KUMKM', 13]
];
const employees = [];
for (const [bidang, count] of units) {
  for (let position = 0; position < count; position++) {
    const index = employees.length + 1;
    employees.push({
      id: String(index), nama: `Synthetic Employee ${String(index).padStart(3, '0')}`,
      nip: index > 59 ? '' : `99000000 000000 0 ${String(index).padStart(3, '0')}`,
      jabatan: position === 0 ? 'Kepala Unit Uji' : 'Staf Uji', bidang,
      pangkat: index > 59 ? '' : position < 2 ? 'IV/a' : 'III/a',
      is_lo: index <= 9 ? 1 : 0, workload_count: index % 5, status_aktif: 'Aktif'
    });
  }
}
const people = {
  leader1: employees[0], leader2: employees[1], leader3: employees[2],
  leader4: employees[17], leader11: employees[3],
  staffSecretariat: employees[4], staffEnterprise: employees[34],
  legacy80: employees[24], legacy81: employees[25],
  importMatch: employees[5], missingNip: employees[69]
};
people.legacy80.id = '80';
people.legacy81.id = '81';
const leaders = Array.from({ length: 13 }, (_, index) => {
  const key = `leader${index + 1}`;
  people[key] ||= employees[45 + index];
  return { no: index + 1, nama: people[key].nama, nip: people[key].nip };
});
const destinationLabels = [
  ['sekretariat-umpeg', 'Sekretariat (Umum dan Kepegawaian)'],
  ['sekretariat-perencanaan', 'Sekretariat (Program dan Perencanaan)'],
  ['sekretariat-keuangan', 'Sekretariat (Keuangan dan Aset)'],
  ['pemberdayaan-koperasi', 'Bidang Pemberdayaan dan Perlindungan Koperasi'],
  ['pengawasan-koperasi', 'Bidang Pengawasan Koperasi'],
  ['pengembangan-mikro', 'Bidang Pengembangan Usaha Mikro'],
  ['kewirausahaan', 'Bidang Kewirausahaan'], ['plut-kumkm', 'UPTD PLUT KUMKM'],
  ['dana-bergulir', 'UPTD Pengelolaan Dana Bergulir']
];
const destinations = destinationLabels.map(([id, bidang], index) => ({
  id, bidang, pic: `Synthetic PIC ${index + 1}`, phone: `6200000000${String(index + 1).padStart(2, '0')}`
}));
const deploymentConfigSource = `
function configureNewDeployment_() {
  const props = PropertiesService.getScriptProperties();
  const publicDev = typeof isPublicDevMode_ === 'function' && isPublicDevMode_(props);
  const defaults = {
    ADMIN_DEMO_MODE: 'false', PUBLIC_DEV_MODE: 'false', FONNTE_DISABLED: 'false',
    APPROVER_EMAIL: 'approver@example.invalid',
    PUBLIC_FORMS_BASE_URL: 'https://example.invalid/exec',
    TAMU_FO_URL: 'https://example.invalid/exec?page=tdd',
    TAMU_LUAR_URL: 'https://example.invalid/exec?page=tld'
  };
  Object.keys(defaults).forEach(key => {
    if (!props.getProperty(key)) props.setProperty(key, defaults[key]);
  });
  if (publicDev) {
    props.setProperties({ PUBLIC_DEV_MODE: 'true', FONNTE_DISABLED: 'true' });
  }
}
`;

module.exports = { employees, people, leaders, destinations, deploymentConfigSource };
