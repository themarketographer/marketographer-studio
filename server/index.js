// Servidor del Estudio. Sin dependencias externas: solo Node.
// Carga cada carpeta de /modules como un módulo independiente.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStore } from './lib/store.js';
import { createRouter } from './lib/router.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4177);
const store = createStore(path.join(ROOT, 'data'));

const config = {
  root: ROOT,
  home: os.homedir(),
  // Carpeta donde Zoom guarda tus clases grabadas en el Mac.
  zoomDir: process.env.ZOOM_DIR || path.join(os.homedir(), 'Documents', 'Zoom'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav',
};

// ---------- Descubrimiento de módulos ----------
const modulesDir = path.join(ROOT, 'modules');
const modules = [];
const router = createRouter();

for (const id of fs.readdirSync(modulesDir)) {
  const dir = path.join(modulesDir, id);
  const manifestPath = path.join(dir, 'module.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = { id, ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
  manifest.hasUi = fs.existsSync(path.join(dir, 'ui.js'));
  modules.push(manifest);

  const serverFile = path.join(dir, 'server.js');
  if (fs.existsSync(serverFile)) {
    const mod = await import(pathToFileURL(serverFile).href);
    // Cada módulo recibe un router con prefijo propio: /api/<id>/...
    const scoped = {};
    for (const verb of ['get', 'post', 'put', 'delete']) {
      scoped[verb] = (p, h) => router[verb](`/api/${id}${p}`, h);
    }
    await mod.default({ route: scoped, store, config });
  }
}
// ---------- Respaldo automático ----------
// Al abrir el Estudio se guarda una copia fechada de tus archivos de datos (temas, guiones, clases, looks, vocabulario).
// Se conservan las últimas 15 copias. Solo se copia si algo cambió desde la copia anterior.
const backupDir = path.join(ROOT, 'data', 'respaldos');
function hacerRespaldo() {
  try {
    const dataDir = path.join(ROOT, 'data');
    const archivos = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json') && fs.statSync(path.join(dataDir, f)).size > 2);
    if (!archivos.length) return null;
    fs.mkdirSync(backupDir, { recursive: true });
    const previas = fs.readdirSync(backupDir).filter((n) => fs.statSync(path.join(backupDir, n)).isDirectory()).sort();
    const firma = (dir, lista) => lista.map((f) => f + fs.readFileSync(path.join(dir, f)).length).join('|');
    if (previas.length) {
      const ult = path.join(backupDir, previas[previas.length - 1]);
      const lu = fs.readdirSync(ult).filter((f) => f.endsWith('.json'));
      if (firma(ult, lu) === firma(dataDir, archivos)) return null;
    }
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const nombre = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const dest = path.join(backupDir, nombre);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of archivos) fs.copyFileSync(path.join(dataDir, f), path.join(dest, f));
    const todas = fs.readdirSync(backupDir).filter((n) => fs.statSync(path.join(backupDir, n)).isDirectory()).sort();
    for (const viejo of todas.slice(0, Math.max(0, todas.length - 15))) fs.rmSync(path.join(backupDir, viejo), { recursive: true, force: true });
    return nombre;
  } catch (e) { console.error('Respaldo:', e.message); return null; }
}
hacerRespaldo();
const listarRespaldos = () => (fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((n) => fs.statSync(path.join(backupDir, n)).isDirectory()).sort().reverse() : [])
  .map((n) => {
    const d = path.join(backupDir, n);
    const cuenta = (f) => { try { const v = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); return Array.isArray(v) ? v.length : 0; } catch { return 0; } };
    return { id: n, temas: cuenta('temas.json'), guiones: cuenta('guiones.json'), clases: cuenta('clases.json'), archivos: fs.readdirSync(d).length };
  });
router.get('/api/respaldos', () => listarRespaldos());
router.post('/api/respaldos', () => ({ id: hacerRespaldo() || 'sin-cambios', lista: listarRespaldos() }));
router.post('/api/respaldos/:id/restaurar', ({ params }) => {
  const d = path.join(backupDir, path.basename(params.id));
  if (!fs.existsSync(d)) throw new Error('Esa copia ya no existe');
  // Antes de restaurar se guarda lo actual, para poder volver atrás.
  const dataDir = path.join(ROOT, 'data');
  const antes = path.join(backupDir, 'antes-de-restaurar_' + Date.now());
  fs.mkdirSync(antes, { recursive: true });
  for (const f of fs.readdirSync(dataDir).filter((x) => x.endsWith('.json'))) fs.copyFileSync(path.join(dataDir, f), path.join(antes, f));
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json'))) fs.copyFileSync(path.join(d, f), path.join(dataDir, f));
  return { ok: true };
});

modules.sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
router.get('/api/modules', () => modules);
router.get('/api/config', () => ({ zoomDir: config.zoomDir }));
// Huella de la interfaz (la última modificación de sus archivos): la pantalla abierta la compara para avisar "se actualizó, recarga".
const huellaUi = () => {
  let mx = 0;
  const ver = (d) => { try { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'engine' && f.name !== 'assets' && f.name !== 'fonts') ver(p); } else if (/\.(js|css|html)$/.test(f.name)) mx = Math.max(mx, fs.statSync(p).mtimeMs); } } catch { /* carpeta ausente */ } };
  ver(path.join(ROOT, 'web')); ver(path.join(ROOT, 'modules'));
  return String(Math.round(mx));
};
router.get('/api/version', () => ({ ui: huellaUi() }));

// ---------- HTTP ----------
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function serveFile(res, file, req, type) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'No encontrado' });
  const size = fs.statSync(file).size;
  const mime = type || MIME[path.extname(file)] || 'application/octet-stream';
  const range = req?.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) { // Los navegadores piden el video por tramos
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'Content-Type': mime, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const hit = router.match(req.method, url.pathname);
      if (!hit) return send(res, 404, { error: 'Ruta no encontrada' });
      // Las subidas de archivos llegan como flujo binario y el módulo decide dónde guardarlas.
      const subida = req.headers['content-type'] === 'application/octet-stream';
      const body = !subida && ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const out = await hit.handler({ params: hit.params, query: Object.fromEntries(url.searchParams), body, stream: subida ? req : null });
      if (out && out.__file) return serveFile(res, out.__file, req, out.type);
      return send(res, 200, out ?? { ok: true });
    }
    // /m/<modulo>/<archivo>: solo interfaz (ui.js, ui.css, assets/)
    const mm = /^\/m\/([a-z0-9-]+)\/(.+)$/.exec(url.pathname);
    if (mm) {
      const rel = mm[2];
      if (!/^(ui\.js|ui\.css|live\.js|exportar-ui\.js|keyframes\.js|meter\.js|timeline\.js|inspector\.js|assets\/.+)$/.test(rel)) return send(res, 404, { error: 'No encontrado' });
      return serveFile(res, path.join(modulesDir, mm[1], rel), req);
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    serveFile(res, path.join(ROOT, 'web', path.normalize(rel).replace(/^(\.\.[\/\\])+/, '')), req);
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: String(e.message || e) });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Estudio listo en http://localhost:${PORT}\n  Módulos: ${modules.map((m) => m.id).join(', ')}\n  Cierra esta ventana para apagarlo.\n`);
});
