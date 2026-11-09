// API de Pro vs Noob. Cada proyecto vive en data/pvn/<id>/ con las dos tomas, su configuración y el resultado.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

export default async function register({ route, config }) {
  const base = path.join(config.root, 'data', 'pvn');
  const engine = path.join(config.root, 'modules', 'talking-head', 'engine');
  fs.mkdirSync(base, { recursive: true });
  const jobs = new Map();
  const pythonPath = () => {
    if (process.env.STUDIO_PY) return process.env.STUDIO_PY;
    const v = path.join(config.root, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
    return fs.existsSync(v) ? v : null;
  };
  const dir = (id) => {
    if (!/^[a-z0-9]+$/.test(id)) throw new Error('Proyecto inválido');
    const d = path.join(base, id);
    if (!fs.existsSync(d)) throw new Error('Proyecto no encontrado');
    return d;
  };
  const readJson = (d, n, fb = null) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch { return fb; } };
  const CFG_DEF = { layout: 'apilado', a: { nombre: 'NOOB', color: '#ff4d4d' }, b: { nombre: 'PRO', color: '#2fd27a' }, anim: 'pop', audio: 'b', vs: true, titulo: '', duracion: 'min' };
  const resumen = (id) => {
    const d = path.join(base, id), meta = readJson(d, 'meta.json', {});
    return { id, ...meta, tieneA: fs.existsSync(path.join(d, 'a.mp4')), tieneB: fs.existsSync(path.join(d, 'b.mp4')), tieneFinal: fs.existsSync(path.join(d, 'final.mp4')),
      corriendo: jobs.has(id), status: readJson(d, 'status.json'), config: { ...CFG_DEF, ...readJson(d, 'pvn.json', {}) } };
  };
  route.get('/proyectos', () => fs.readdirSync(base).filter((n) => fs.existsSync(path.join(base, n, 'meta.json'))).map(resumen).sort((a, b) => (b.creado || '').localeCompare(a.creado || '')));
  route.post('/proyectos', ({ body }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const d = path.join(base, id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ nombre: String(body?.nombre || 'Pro vs Noob').slice(0, 80), creado: new Date().toISOString() }));
    fs.writeFileSync(path.join(d, 'pvn.json'), JSON.stringify(CFG_DEF, null, 2));
    return resumen(id);
  });
  route.get('/proyectos/:id', ({ params }) => { dir(params.id); return resumen(params.id); });
  route.put('/proyectos/:id/config', ({ params, body }) => {
    const d = dir(params.id);
    const t = (x, n) => String(x ?? '').slice(0, n);
    const col = (c, fb) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : fb);
    const cfg = {
      layout: body.layout === 'lado' ? 'lado' : 'apilado',
      a: { nombre: t(body.a?.nombre, 14) || 'NOOB', color: col(body.a?.color, '#ff4d4d') },
      b: { nombre: t(body.b?.nombre, 14) || 'PRO', color: col(body.b?.color, '#2fd27a') },
      anim: ['pop', 'deslizar', 'caer', 'zoom', 'rebote', 'resorte', 'desenfoque', 'escribir'].includes(body.anim) ? body.anim : 'pop',
      audio: ['a', 'b', 'mezcla'].includes(body.audio) ? body.audio : 'b', vs: body.vs !== false, titulo: t(body.titulo, 60), duracion: ['min', 'a', 'b'].includes(body.duracion) ? body.duracion : 'min',
    };
    fs.writeFileSync(path.join(d, 'pvn.json'), JSON.stringify(cfg, null, 2));
    return cfg;
  });
  route.post('/proyectos/:id/subir/:lado', async ({ params, stream }) => {
    const d = dir(params.id);
    if (!['a', 'b'].includes(params.lado)) throw new Error('Lado inválido');
    if (!stream) throw new Error('No llegó el video');
    const destino = path.join(d, params.lado + '.mp4');
    await pipeline(stream, fs.createWriteStream(destino));
    fs.rmSync(path.join(d, 'final.mp4'), { force: true });
    return resumen(params.id);
  });
  route.get('/proyectos/:id/video/:cual', ({ params }) => {
    const f = { a: 'a.mp4', b: 'b.mp4', final: 'final.mp4' }[params.cual];
    if (!f) throw new Error('Video desconocido');
    return { __file: path.join(dir(params.id), f), type: 'video/mp4' };
  });
  route.post('/proyectos/:id/renderizar', ({ params }) => {
    const d = dir(params.id), py = pythonPath();
    if (!py) throw new Error('Falta instalar el motor. Haz doble clic en Instalar.command y vuelve a intentar.');
    if (jobs.has(params.id)) throw new Error('Ya se está montando este video.');
    if (!fs.existsSync(path.join(d, 'a.mp4')) || !fs.existsSync(path.join(d, 'b.mp4'))) throw new Error('Faltan las dos tomas.');
    fs.writeFileSync(path.join(d, 'status.json'), JSON.stringify({ etapa: 'render', pct: 1, msg: 'Empezando' }));
    const log = fs.openSync(path.join(d, 'motor.log'), 'a');
    const child = spawn(py, [path.join(engine, 'cli.py'), 'pvn', d], { cwd: engine, stdio: ['ignore', log, log] });
    jobs.set(params.id, child);
    child.on('close', (code) => {
      jobs.delete(params.id);
      if (code !== 0) fs.writeFileSync(path.join(d, 'status.json'), JSON.stringify({ etapa: 'error', pct: 0, msg: 'El motor se detuvo', error: 'No pude montar el video. Revisa motor.log en la carpeta del proyecto.' }));
    });
  });
  route.delete('/proyectos/:id', ({ params }) => { fs.rmSync(dir(params.id), { recursive: true, force: true }); });
}
