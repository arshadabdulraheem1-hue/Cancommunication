const http = require('http');
const fs = require('fs');
const path = require('path');
const { SerialPort } = require('serialport');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const serials = { driver: null, control: null };
const connectedPaths = { driver: null, control: null };
const clients = new Set();

function broadcast(message) {
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of clients) client.write(payload);
}
function serialStatus(role, extra = {}) { broadcast({ type: 'serial', role, connected: Boolean(serials[role]?.isOpen), path: connectedPaths[role], ...extra }); }
function response(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function readBody(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } }); }); }
async function connect(role, devicePath) {
  if (!['driver', 'control'].includes(role)) throw new Error('Invalid ECU role.');
  if (connectedPaths[role] === devicePath && serials[role]?.isOpen) return;
  if (Object.entries(connectedPaths).some(([otherRole, p]) => otherRole !== role && p === devicePath)) throw new Error('This COM port is already assigned to the other ECU.');
  await disconnect(role);
  const port = new SerialPort({ path: devicePath, baudRate: 115200, autoOpen: false });
  let lineBuffer = '';
  port.on('data', data => { lineBuffer += data.toString(); const lines = lineBuffer.split(/\r?\n/); lineBuffer = lines.pop(); lines.map(x => x.trim()).filter(Boolean).forEach(line => broadcast({ type: 'line', role, line })); });
  port.on('error', error => { broadcast({ type: 'error', role, message: error.message }); serialStatus(role, { error: error.message }); });
  port.on('close', () => { if (serials[role] === port) { serials[role] = null; connectedPaths[role] = null; serialStatus(role); } });
  await new Promise((resolve, reject) => port.open(err => err ? reject(err) : resolve()));
  serials[role] = port; connectedPaths[role] = devicePath; serialStatus(role);
}
async function disconnect(role) { const port = serials[role]; if (port?.isOpen) await new Promise(resolve => port.close(resolve)); serials[role] = null; connectedPaths[role] = null; serialStatus(role); }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.write('\n'); clients.add(res); serialStatus('driver'); serialStatus('control'); req.on('close', () => clients.delete(res)); return; }
    if (url.pathname === '/api/ports' && req.method === 'GET') return response(res, 200, (await SerialPort.list()).map(p => ({ path: p.path, label: [p.path, p.manufacturer, p.friendlyName].filter(Boolean).join(' — ') })));
    if (url.pathname === '/api/connect' && req.method === 'POST') { const { path: devicePath, role } = await readBody(req); if (!devicePath) return response(res, 400, { error: 'A COM port is required.' }); await connect(role, devicePath); return response(res, 200, { connected: true, path: devicePath, role }); }
    if (url.pathname === '/api/disconnect' && req.method === 'POST') { const { role } = await readBody(req); if (!['driver', 'control'].includes(role)) return response(res, 400, { error: 'Invalid ECU role.' }); await disconnect(role); return response(res, 200, { connected: false, role }); }
    if (url.pathname === '/api/set' && req.method === 'POST') { const v = await readBody(req); const values = ['speed', 'accelerator', 'brake', 'soc', 'temperature'].map(k => Number(v[k])); if (!serials.driver?.isOpen) return response(res, 409, { error: 'Driver ECU serial port is not connected.' }); if (values.some(n => !Number.isFinite(n))) return response(res, 400, { error: 'Invalid control values.' }); serials.driver.write(`SET,${values.join(',')}\n`); return response(res, 200, { sent: true }); }
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(PUBLIC, requested);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return response(res, 404, 'Not found', 'text/plain');
    response(res, 200, fs.readFileSync(file), mime[path.extname(file)] || 'application/octet-stream');
  } catch (error) { response(res, 500, { error: error.message }); }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Stop the existing dashboard process or start with a different PORT.`);
  else console.error(`Dashboard server error: ${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, () => console.log(`EV dashboard available at http://localhost:${PORT}`));
