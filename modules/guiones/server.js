// API del módulo Guiones. Rutas bajo /api/guiones/...
import fs from 'node:fs';
import path from 'node:path';
import { FORMATOS, construirPrompt } from './prompts.js';

// Lee las carpetas de clases que Zoom guarda en el Mac y saca las preguntas del chat.
function escanearZoom(zoomDir) {
  if (!fs.existsSync(zoomDir)) return { existe: false, carpetas: [] };
  const carpetas = [];
  for (const nombre of fs.readdirSync(zoomDir)) {
    const dir = path.join(zoomDir, nombre);
    if (!fs.statSync(dir).isDirectory()) continue;
    const m = /^(\d{4}-\d{2}-\d{2}) \d{2}\.\d{2}\.\d{2} (.+)$/.exec(nombre);
    if (!m) continue;
    const titulo = m[2].replace(/_/g, ' ').trim();
    if (/^Sala de reuniones personales/i.test(titulo)) continue; // no son clases
    const chat = path.join(dir, 'chat.txt');
    carpetas.push({
      carpeta: nombre, fecha: m[1], titulo,
      tieneChat: fs.existsSync(chat),
      tieneAudio: fs.readdirSync(dir).some((f) => /\.(m4a|mp3)$/i.test(f)),
    });
  }
  carpetas.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { existe: true, carpetas };
}

function preguntasDelChat(zoomDir, carpeta) {
  const file = path.join(zoomDir, carpeta, 'chat.txt');
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const linea of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\S+\s+From (.+?) : (.+)$/.exec(linea.trim());
    if (!m) continue;
    const [, quien, msg] = m;
    if (/Pablo Villarroel/i.test(quien)) continue; // solo preguntas de los alumnos
    if (msg.includes('?') && msg.length > 18 && !/^https?:/.test(msg)) out.push(msg.trim());
  }
  return out.slice(0, 20);
}

export default async function register({ route, store, config }) {
  route.get('/formatos', () =>
    Object.entries(FORMATOS).map(([id, f]) => ({ id, nombre: f.nombre, resumen: f.resumen, duracion: f.duracion })));

  // Clases
  route.get('/clases', () => store.list('clases').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')));
  route.post('/clases', ({ body }) => store.upsert('clases', body));
  route.delete('/clases/:id', ({ params }) => store.remove('clases', params.id));

  // Zoom en el Mac
  route.get('/zoom-local', () => {
    const r = escanearZoom(config.zoomDir);
    const yaImportadas = new Set(store.list('clases').map((c) => c.carpetaZoom).filter(Boolean));
    return { ...r, zoomDir: config.zoomDir, carpetas: r.carpetas.map((c) => ({ ...c, importada: yaImportadas.has(c.carpeta) })) };
  });
  route.post('/zoom-local/importar', ({ body }) => {
    const { carpeta, fecha, titulo } = body;
    const norm = (x) => (x || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const existente = store.list('clases').find((c) => c.carpetaZoom === carpeta)
      || store.list('clases').find((c) => c.fecha === fecha && norm(c.titulo) === norm(titulo)); // evita duplicar una clase que ya cargaste a mano
    return store.upsert('clases', {
      id: existente?.id, titulo, fecha, carpetaZoom: carpeta,
      preguntas: preguntasDelChat(config.zoomDir, carpeta),
    });
  });

  // Temas
  route.get('/temas', () => store.list('temas'));
  route.post('/temas', ({ body }) => store.upsert('temas', { estado: 'idea', ...body }));
  route.delete('/temas/:id', ({ params }) => {
    store.remove('temas', params.id);
    store.write('guiones', store.list('guiones').filter((g) => g.temaId !== params.id));
  });

  // Guiones
  route.get('/guiones', () => store.list('guiones'));
  route.post('/guiones', ({ body }) => store.upsert('guiones', body));
  route.delete('/guiones/:id', ({ params }) => store.remove('guiones', params.id));

  // Prompt listo para pegar en Claude
  route.post('/prompt', ({ body }) => {
    const tema = store.list('temas').find((t) => t.id === body.temaId);
    if (!tema) throw new Error('Tema no encontrado');
    const clase = store.list('clases').find((c) => c.id === tema.claseId);
    return { prompt: construirPrompt({ tema, clase, formato: body.formato }) };
  });
}
