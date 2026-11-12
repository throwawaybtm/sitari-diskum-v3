'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createFixtureStore } = require('./fixtures');
const { getPublicDestinations } = require('./tld-directory');
const { getPublicDestinations: getTddPublicDestinations } = require('./tdd-directory');
const { rooms: meetingRooms } = require('./meeting-rooms');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BODY_LIMIT_BYTES = 1024 * 1024;

function replaceAllLiteral(source, search, replacement) {
  return source.split(search).join(replacement);
}

function renderAdminHtml({ baseUrl = 'http://127.0.0.1:4173' } = {}) {
  const adminDir = path.join(PROJECT_ROOT, 'Admin');
  const stylesheet = fs.readFileSync(path.join(adminDir, 'Stylesheet.html'), 'utf8');
  let html = fs.readFileSync(path.join(adminDir, 'Index.html'), 'utf8');
  for(const name of ['ArchiveClient','NotulaPdf','AgendaSearch','RapatPimpinan','Tools','AttendancePolicy','MobileBase','MeetingPhotos','AgendaAttendance','BookingCalendar'])html=replaceAllLiteral(html,"<?!= include('"+name+"'); ?>",fs.readFileSync(path.join(adminDir,name+'.html'),'utf8'));
  html = replaceAllLiteral(html, "<?!= include('VisitModal'); ?>", fs.readFileSync(path.join(adminDir, 'VisitModal.html'), 'utf8'));
  html = replaceAllLiteral(html, "<?!= include('TddModal'); ?>", fs.readFileSync(path.join(adminDir, 'TddModal.html'), 'utf8'));
  html = replaceAllLiteral(html, "<?!= include('VisitAttendance'); ?>", fs.readFileSync(path.join(adminDir, 'VisitAttendance.html'), 'utf8'));
  const tamuFoUrl = `${baseUrl}/tamu-fo`;
  const tamuLuarUrl = `${baseUrl}/tamu-luar`;

  html = replaceAllLiteral(html, "<?!= include('Stylesheet'); ?>", stylesheet);
  html = replaceAllLiteral(html, '<?!= JSON.stringify(meetingRooms) ?>', JSON.stringify(meetingRooms));
  html = replaceAllLiteral(html, "<?= typeof adminAppUrl !== 'undefined' ? adminAppUrl : '' ?>", baseUrl);
  html = replaceAllLiteral(html, '<?= tamuFoUrl ?>', tamuFoUrl);
  html = replaceAllLiteral(html, '<?= tamuLuarUrl ?>', tamuLuarUrl);
  html = replaceAllLiteral(html, "<?= typeof appUrl !== 'undefined' ? appUrl : '' ?>", baseUrl);
  html = replaceAllLiteral(html, "<?= typeof tamuFoUrl !== 'undefined' ? tamuFoUrl : '' ?>", tamuFoUrl);
  html = replaceAllLiteral(html, "<?= typeof tamuLuarUrl !== 'undefined' ? tamuLuarUrl : '' ?>", tamuLuarUrl);

  if (html.includes('<?') || html.includes('?>')) {
    throw new Error('Admin template contains an unsupported Apps Script template expression.');
  }
  // This refresh behavior is injected only into the local Admin preview.
  const endOfBody = html.lastIndexOf('</body>');
  return html.slice(0, endOfBody) + `<script>
    (() => {
      let previousVisitors;
      let refreshing = false;
      async function refreshLocalVisitors() {
        if (document.hidden || refreshing) return;
        refreshing = true;
        try {
          const response = await fetch('/api/getTamuList', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
          });
          const result = await response.json();
          if (!response.ok || !result.success) return;
          const currentVisitors = JSON.stringify(result.data);
          if (previousVisitors !== currentVisitors) {
            previousVisitors = currentVisitors;
            loadAllDashboard();
          }
        } catch (error) {
          // Retry after a temporary local server restart.
        } finally {
          refreshing = false;
        }
      }
      window.addEventListener('focus', refreshLocalVisitors);
      document.addEventListener('visibilitychange', refreshLocalVisitors);
      window.setInterval(refreshLocalVisitors, 2000);
    })();
  </script>` + html.slice(endOfBody);
}

function renderPresensiHtml(adminAttendance=false) {
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'Admin', 'Presensi.html'), 'utf8').replace("<?= typeof adminAttendance !== 'undefined' && adminAttendance ? 'true' : 'false' ?>",adminAttendance?'true':'false').replace('<?= employeeImportCount ?>',String(JSON.parse(fs.readFileSync(path.join(__dirname,'previews','employee-directory.json'),'utf8')).length)).replace("<?!= include('AttendancePolicy'); ?>",fs.readFileSync(path.join(PROJECT_ROOT,'Admin','AttendancePolicy.html'),'utf8')).replace("<?!= include('MobileBase'); ?>",fs.readFileSync(path.join(PROJECT_ROOT,'Admin','MobileBase.html'),'utf8'));
  if (html.includes('<?') || html.includes('?>')) {
    throw new Error('Presensi template contains an unsupported Apps Script template expression.');
  }
  return html;
}

function renderGuestFormHtml(directoryName) {
  let html = fs.readFileSync(path.join(PROJECT_ROOT, directoryName, 'Index.html'), 'utf8').replace("<?!= include('MobileBase'); ?>",fs.readFileSync(path.join(PROJECT_ROOT,'Admin','MobileBase.html'),'utf8')); 
  if (directoryName === 'Tamu-Luar') {
    const departmentInfo=fs.readFileSync(path.join(PROJECT_ROOT, directoryName, 'OrganizationStructure.html'), 'utf8');
    html = replaceAllLiteral(html, '<?!= includeOrganizationStructure_() ?>', departmentInfo);
    html = replaceAllLiteral(html, '<?!= JSON.stringify(tldDestinations) ?>', JSON.stringify(getPublicDestinations()));
  }
  if (directoryName === 'Tamu-FO') {
    html = replaceAllLiteral(html, '<?!= JSON.stringify(tddDestinations) ?>', JSON.stringify(getTddPublicDestinations()));
  }
  if (html.includes('<?') || html.includes('?>')) {
    throw new Error(`${directoryName} template contains an unsupported Apps Script template expression.`);
  }
  return html;
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store'
  });
  response.end(html);
}

function readJsonBody(request, limitBytes = BODY_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limitBytes) {
        settled = true;
        reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (settled) return;
      settled = true;
      if (size === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(Object.assign(new Error('Malformed JSON request body.'), { statusCode: 400 }));
      }
    });

    request.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function createLocalTestServer({ now = () => new Date(), seed, employees } = {}) {
  const store = createFixtureStore(now, { seed, employees });

  return http.createServer(async (request, response) => {
    try {
      const host = request.headers.host || '127.0.0.1:4173';
      const url = new URL(request.url, `http://${host}`);
      if (request.method === 'GET' && url.pathname === '/mobile-preview') {
        sendHtml(response, fs.readFileSync(path.join(__dirname,'previews','mobile.html'),'utf8'));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/preview-pegawai') {
        const directory=fs.readFileSync(path.join(__dirname,'previews','employee-directory.json'),'utf8');
        const preview=fs.readFileSync(path.join(__dirname,'previews','employee-choice.html'),'utf8').replace('__EMPLOYEE_DIRECTORY_JSON__',JSON.stringify(JSON.parse(directory)).replace(/</g,'\\u003c'));
        sendHtml(response,preview);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/preview-struktur') {
        const preview = fs.readFileSync(path.join(PROJECT_ROOT, 'output', 'organization-structure-preview.html'), 'utf8');
        sendHtml(response, '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pratinjau Struktur Organisasi</title><style>body{margin:0;padding:24px;background:#eaf2ef}main{max-width:1000px;margin:auto}</style></head><body><main>' + preview + '</main></body></html>');
        return;
      }

      if (request.method === 'GET' && url.pathname === '/') {
        if (['presensi','presensi-admin'].includes(url.searchParams.get('page'))) {
          sendHtml(response, renderPresensiHtml(url.searchParams.get('page')==='presensi-admin'));
        } else {
          sendHtml(response, renderAdminHtml({ baseUrl: `http://${host}` }));
        }
        return;
      }

      if (request.method === 'GET' && url.pathname === '/tamu-fo') {
        sendHtml(response, renderGuestFormHtml('Tamu-FO'));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/tamu-luar') {
        sendHtml(response, renderGuestFormHtml('Tamu-Luar'));
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/local-doc/')) {
        const doc = store.getDocument(url.pathname.slice('/local-doc/'.length));
        if (!doc) { sendJson(response, 404, { success: false, error: 'Dokumen lokal tidak ditemukan; data direset saat server restart.' }); return; }
        response.writeHead(200, { 'Content-Type': doc.mime, 'Content-Length': doc.buffer.length,
          'Content-Disposition': 'inline; filename="' + doc.name.replace(/[^a-zA-Z0-9._-]/g, '_') + '"',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(doc.buffer); return;
      }

      if (url.pathname.startsWith('/api/')) {
        if (request.method !== 'POST') {
          sendJson(response, 405, { success: false, error: 'Method not allowed.' });
          return;
        }

        const functionName = decodeURIComponent(url.pathname.slice('/api/'.length));
        // Two 5 MiB documents expand to about 14 MiB in base64.
        const payload = await readJsonBody(request, ['registerTamuLuar', 'saveVisitWorkflow','saveAgendaNotula','saveAgendaPhotos','saveTddPhotos'].includes(functionName) ? 15 * 1024 * 1024 : BODY_LIMIT_BYTES);
        const readResponse = store.responses[functionName];
        if (readResponse) {
          sendJson(response, 200, readResponse);
          return;
        }

        const mutationResponse = store.handleMutation(functionName, payload);
        if (mutationResponse) {
          sendJson(response, 200, mutationResponse);
          return;
        }

        sendJson(response, 404, { success: false, error: `Unknown local function: ${functionName}` });
        return;
      }

      sendJson(response, 404, { success: false, error: 'Local route not found.' });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        success: false,
        error: error.statusCode ? error.message : 'Local test server error.'
      });
    }
  });
}

if (require.main === module) {
  const requestedPort = Number.parseInt(process.env.PORT || '4173', 10);
  const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
    ? requestedPort
    : 4173;
  const server = createLocalTestServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Si Tari local test server: http://127.0.0.1:${port}/`);
    console.log('Local preview records reset when this process stops.');
  });
}

module.exports = { createLocalTestServer, renderAdminHtml };
