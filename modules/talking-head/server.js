// API del editor de Talking Head. Cada proyecto vive en data/th/<id>/ con sus archivos de trabajo.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

export default async function register({ route, config }) {
  const base = path.join(config.root, 'data', 'th');
  const engine = path.join(config.root, 'modules', 'talking-head', 'engine');
  fs.mkdirSync(base, { recursive: true });
  const jobs = new Map(); // id -> proceso en marcha

  // Intérprete de Python del motor: el que dejó el instalador, o el que indique STUDIO_PY.
  const pythonPath = () => {
    if (process.env.STUDIO_PY) return process.env.STUDIO_PY;
    const v = path.join(config.root, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
    return fs.existsSync(v) ? v : null;
  };
  const dir = (id) => {
    if (!/^[a-z0-9]+$/.test(id)) throw Object.assign(new Error('Proyecto inválido'), { status: 400 });
    const d = path.join(base, id);
    if (!fs.existsSync(d)) throw Object.assign(new Error('Proyecto no encontrado'), { status: 404 });
    return d;
  };
  const readJson = (d, name, fb = null) => { try { return JSON.parse(fs.readFileSync(path.join(d, name), 'utf8')); } catch { return fb; } };
  const resumen = (id) => {
    const d = path.join(base, id);
    const meta = readJson(d, 'meta.json', {});
    return { ...meta, id, status: readJson(d, 'status.json'), corriendo: jobs.has(id),
      analizado: fs.existsSync(path.join(d, 'plan.json')), tienePreview: fs.existsSync(path.join(d, 'preview.mp4')), tieneFinal: fs.existsSync(path.join(d, 'final.mp4')), tieneOriginal: fs.existsSync(path.join(d, 'words_orig.json')), tieneAlpha: fs.existsSync(path.join(d, 'alpha.mp4')) };
  };

  function lanzar(id, args, alTerminar) {
    const py = pythonPath();
    if (!py) throw new Error('Falta instalar el motor. Haz doble clic en Instalar.command y vuelve a intentar.');
    if (jobs.has(id)) throw new Error('Ya hay un proceso en marcha en este proyecto.');
    const d = dir(id);
    const log = fs.openSync(path.join(d, 'motor.log'), 'a');
    const child = spawn(py, [path.join(engine, 'cli.py'), ...args.slice(0, 1), d, ...args.slice(1)], { cwd: engine, stdio: ['ignore', log, log] });
    jobs.set(id, child);
    child.on('close', (code) => {
      jobs.delete(id);
      if (alTerminar) setImmediate(() => alTerminar(code));
      if (code !== 0 && !readJson(d, 'status.json')?.error) {
        fs.writeFileSync(path.join(d, 'status.json'), JSON.stringify({ etapa: 'error', pct: 0, msg: 'El motor se detuvo', error: 'El motor se detuvo. Revisa motor.log en la carpeta del proyecto.' }));
      }
    });
  }

  route.get('/fuentes', () => ({
    motorListo: !!pythonPath(),
    fuentes: fs.readdirSync(path.join(engine, 'fonts')).filter((f) => /\.(ttf|otf)$/i.test(f)).sort(),
  }));
  route.get('/fuentes/:archivo', ({ params }) => {
    const f = path.join(engine, 'fonts', path.basename(params.archivo));
    return { __file: f, type: 'font/ttf' };
  });

  route.get('/proyectos', () => fs.readdirSync(base).filter((n) => fs.existsSync(path.join(base, n, 'meta.json'))).map(resumen)
    .sort((a, b) => (b.creado || '').localeCompare(a.creado || '')));

  // Subida del video: el navegador manda el archivo tal cual.
  route.post('/subir', async ({ query, stream }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const d = path.join(base, id);
    fs.mkdirSync(d, { recursive: true });
    await pipeline(stream, fs.createWriteStream(path.join(d, 'source.mp4')));
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ nombre: (query.nombre || 'Video').replace(/\.[^.]+$/, ''), creado: new Date().toISOString() }));
    return resumen(id);
  });

  // Animaciones y emojis predefinidos para las frases de la voz en off (una sola fuente para el motor y para el editor).
  route.get('/filtros', () => readJson(engine, 'filtros.json', { filtros: [] }));
  route.get('/combos', () => readJson(engine, 'combos.json', { combos: [], emojis: {}, mezcla: [] }));

  // Plantillas de voz en off: fondo, animaciones, estilo y música con un nombre, guardadas en data/plantillas-voz.json.
  const plantillasFile = path.join(config.root, 'data', 'plantillas-voz.json');
  const leerPlantillas = () => { try { return JSON.parse(fs.readFileSync(plantillasFile, 'utf8')); } catch { return []; } };
  route.get('/plantillas-voz', () => leerPlantillas());
  route.post('/plantillas-voz', ({ body }) => {
    const nombre = String(body?.nombre || '').trim().slice(0, 40);
    if (!nombre) throw new Error('Ponle un nombre a la plantilla.');
    const col = (c, fb) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : fb);
    const t = { id: Date.now().toString(36), nombre, fondo: ['degradado', 'color', 'imagen', 'blanco', 'cuadricula', 'negro', 'cuadnegra'].includes(body.fondo) ? body.fondo : 'cuadricula',
      c1: col(body.c1, '#2b1b4d'), c2: col(body.c2, '#0b0b12'), imagen: body.imagen ? limpio(body.imagen) : '', style: body.style || null, voz: body.voz || null, audio: body.audio || null, creado: new Date().toISOString() };
    fs.mkdirSync(path.dirname(plantillasFile), { recursive: true });
    fs.writeFileSync(plantillasFile, JSON.stringify([...leerPlantillas().filter((x) => x.nombre.toLowerCase() !== nombre.toLowerCase()), t], null, 2));
    return t;
  });
  route.delete('/plantillas-voz/:id', ({ params }) => { fs.writeFileSync(plantillasFile, JSON.stringify(leerPlantillas().filter((x) => x.id !== params.id), null, 2)); });

  // Voz en off: llega solo el audio. El motor arma el video con el fondo elegido y lo analiza como cualquier otro.
  route.post('/voz', async ({ query, stream }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const d = path.join(base, id);
    fs.mkdirSync(d, { recursive: true });
    const ext = (/\.[a-z0-9]{2,5}$/i.exec(String(query.nombre || '')) || ['.webm'])[0].toLowerCase();
    const audio = path.join(d, 'voz_original' + ext);
    await pipeline(stream, fs.createWriteStream(audio));
    const col = (c, fb) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : fb);
    const modo = ['degradado', 'color', 'imagen', 'blanco', 'cuadricula', 'negro', 'cuadnegra'].includes(query.fondo) ? query.fondo : 'cuadricula';
    const tpl = leerPlantillas().find((t) => t.id === query.plantilla);
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ nombre: (query.titulo || 'Voz en off').replace(/\.[^.]+$/, '').slice(0, 80), tipo: 'voz', fondo: modo, c1: col(query.c1, '#2b1b4d'), c2: col(query.c2, '#0b0b12'), imagen: query.imagen ? limpio(query.imagen) : '',
      ...(tpl ? { plantilla: { nombre: tpl.nombre, style: tpl.style, voz: tpl.voz, audio: tpl.audio } } : {}), creado: new Date().toISOString() }));
    lanzar(id, ['voz', '--audio', audio, '--fondo', modo, '--c1', col(query.c1, '#2b1b4d'), '--c2', col(query.c2, '#0b0b12'), '--imagen', query.imagen ? limpio(query.imagen) : '']);
    return resumen(id);
  });

  route.get('/proyectos/:id', ({ params }) => {
    const d = dir(params.id);
    return { ...resumen(params.id), plan: readJson(d, 'plan.json'), palabras: readJson(d, 'words.json')?.words || [] };
  });
  route.get('/proyectos/:id/estado', ({ params }) => { dir(params.id); return resumen(params.id); });
  route.put('/proyectos/:id/plan', ({ params, body }) => {
    fs.writeFileSync(path.join(dir(params.id), 'plan.json'), JSON.stringify(body, null, 2));
  });
  route.post('/proyectos/:id/analizar', ({ params }) => { lanzar(params.id, ['analizar']); });
  route.post('/proyectos/:id/replanear', ({ params, body }) => {
    const solo = body && ['zooms', 'titulos'].includes(body.solo) ? ['--solo', body.solo] : [];
    lanzar(params.id, ['plan', ...solo]);
  });
  // Guion corregido: se guardan las palabras con sus tiempos. La copia original queda en words_orig.json.
  // Cola: varios videos uno tras otro (analizar, aplicar ajustes, exportar el final). Uno a la vez para no ahogar la memoria.
  const cola = { items: [], activa: false };
  const mezcla = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? mezcla(o[k], v) : v; return o; };
  const correr = (id, args) => new Promise((ok) => { try { lanzar(id, args, ok); } catch (e) { ok(-1); } });
  async function procesarCola() {
    if (cola.activa) return;
    cola.activa = true;
    for (const it of cola.items) {
      if (it.estado !== 'espera') continue;
      try {
        it.estado = 'analizando';
        if (!fs.existsSync(path.join(base, it.id, 'plan.json'))) await correr(it.id, ['analizar']);
        const d = path.join(base, it.id);
        const plan = readJson(d, 'plan.json');
        if (!plan) throw new Error('No se pudo analizar');
        fs.writeFileSync(path.join(d, 'plan.json'), JSON.stringify(mezcla(plan, it.ajustes), null, 2));
        it.estado = 'exportando';
        const code = await correr(it.id, ['render', '--calidad', 'final']);
        it.estado = code === 0 && fs.existsSync(path.join(d, 'final.mp4')) ? 'listo' : 'error';
      } catch (e) { it.estado = 'error'; it.error = String(e.message || e); }
    }
    cola.activa = false;
  }
  route.get('/cola', () => cola.items.map((it) => ({ id: it.id, nombre: readJson(path.join(base, it.id), 'meta.json', {}).nombre || it.id, estado: it.estado })));
  route.post('/cola', ({ body }) => {
    const ids = (body.ids || []).filter((id) => /^[a-z0-9]+$/.test(id) && fs.existsSync(path.join(base, id)));
    if (!ids.length) throw new Error('No hay videos para procesar.');
    for (const id of ids) { cola.items = cola.items.filter((x) => x.id !== id); cola.items.push({ id, estado: 'espera', ajustes: body.ajustes || {} }); }
    procesarCola();
  });
  route.delete('/cola', () => { cola.items = cola.items.filter((x) => ['analizando', 'exportando'].includes(x.estado)); });

  // Biblioteca de música propia: carpeta data/musica del Estudio.
  const musicaDir = path.join(config.root, 'data', 'musica');
  fs.mkdirSync(musicaDir, { recursive: true });
  const limpio = (n) => path.basename(String(n || 'musica')).replace(/[^\w .()-]/g, '_').slice(0, 120);
  const AUDIO = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;
  route.get('/musica', () => fs.readdirSync(musicaDir).filter((f) => AUDIO.test(f)).sort().map((nombre) => ({ nombre, mb: +(fs.statSync(path.join(musicaDir, nombre)).size / 1048576).toFixed(1) })));
  route.post('/musica/subir', async ({ query, stream }) => {
    const nombre = limpio(query.nombre);
    if (!AUDIO.test(nombre)) throw new Error('Sube un archivo de audio: mp3, wav, m4a, aac, flac u ogg.');
    await pipeline(stream, fs.createWriteStream(path.join(musicaDir, nombre)));
    return { nombre };
  });
  route.get('/musica/:archivo', ({ params }) => ({ __file: path.join(musicaDir, limpio(params.archivo)), type: /\.wav$/i.test(params.archivo) ? 'audio/wav' : /\.m4a|aac$/i.test(params.archivo) ? 'audio/mp4' : 'audio/mpeg' }));
  route.delete('/musica/:archivo', ({ params }) => { fs.rmSync(path.join(musicaDir, limpio(params.archivo)), { force: true }); });

  // Efectos de sonido propios: carpeta data/sfx. En el plan se nombran "u:archivo".
  const sfxDir = path.join(config.root, 'data', 'sfx');
  fs.mkdirSync(sfxDir, { recursive: true });
  route.get('/sfx', () => fs.readdirSync(sfxDir).filter((f) => AUDIO.test(f)).sort().map((nombre) => ({ nombre, kb: Math.round(fs.statSync(path.join(sfxDir, nombre)).size / 1024) })));
  route.post('/sfx/subir', async ({ query, stream }) => {
    const nombre = limpio(query.nombre);
    if (!AUDIO.test(nombre)) throw new Error('Sube un archivo de audio: mp3, wav, m4a, aac, flac u ogg.');
    await pipeline(stream, fs.createWriteStream(path.join(sfxDir, nombre)));
    return { nombre };
  });
  route.get('/sfx/:archivo', ({ params }) => ({ __file: path.join(sfxDir, limpio(params.archivo)), type: /\.wav$/i.test(params.archivo) ? 'audio/wav' : /\.m4a|aac$/i.test(params.archivo) ? 'audio/mp4' : 'audio/mpeg' }));
  route.delete('/sfx/:archivo', ({ params }) => { fs.rmSync(path.join(sfxDir, limpio(params.archivo)), { force: true }); });

  // Imágenes para las escenas de texto: carpeta data/escenas. En el plan se nombran por archivo.
  const escDir = path.join(config.root, 'data', 'escenas');
  fs.mkdirSync(escDir, { recursive: true });
  const IMG = /\.(png|jpe?g|webp)$/i;
  route.get('/escenas', () => fs.readdirSync(escDir).filter((f) => IMG.test(f)).sort().map((nombre) => ({ nombre, kb: Math.round(fs.statSync(path.join(escDir, nombre)).size / 1024) })));
  route.post('/escenas/subir', async ({ query, stream }) => {
    const nombre = limpio(query.nombre);
    if (!IMG.test(nombre)) throw new Error('Sube una imagen png, jpg o webp.');
    await pipeline(stream, fs.createWriteStream(path.join(escDir, nombre)));
    return { nombre };
  });
  route.get('/escenas/:archivo', ({ params }) => ({ __file: path.join(escDir, limpio(params.archivo)), type: /\.png$/i.test(params.archivo) ? 'image/png' : /\.webp$/i.test(params.archivo) ? 'image/webp' : 'image/jpeg' }));
  route.delete('/escenas/:archivo', ({ params }) => { fs.rmSync(path.join(escDir, limpio(params.archivo)), { force: true }); });

  // B-roll: videos e imágenes extra para poner sobre tu video (carpeta data/broll). En el plan se nombran por archivo.
  const brollDir = path.join(config.root, 'data', 'broll');
  fs.mkdirSync(brollDir, { recursive: true });
  const VID = /\.(mp4|mov|m4v|webm)$/i, MEDIA = /\.(mp4|mov|m4v|webm|png|jpe?g|webp)$/i;
  const tipoBroll = (n) => (/\.png$/i.test(n) ? 'image/png' : /\.webp$/i.test(n) ? 'image/webp' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.webm$/i.test(n) ? 'video/webm' : /\.mov$/i.test(n) ? 'video/quicktime' : 'video/mp4');
  route.get('/broll', () => fs.readdirSync(brollDir).filter((f) => MEDIA.test(f)).sort().map((nombre) => ({ nombre, video: VID.test(nombre), mb: Math.round(fs.statSync(path.join(brollDir, nombre)).size / 1e5) / 10 })));
  route.post('/broll/subir', async ({ query, stream }) => {
    const nombre = limpio(query.nombre);
    if (!MEDIA.test(nombre)) throw new Error('Sube un video (mp4, mov, webm) o una imagen (png, jpg, webp).');
    await pipeline(stream, fs.createWriteStream(path.join(brollDir, nombre)));
    return { nombre };
  });
  route.get('/broll/:archivo', ({ params }) => ({ __file: path.join(brollDir, limpio(params.archivo)), type: tipoBroll(params.archivo) }));
  route.delete('/broll/:archivo', ({ params }) => { fs.rmSync(path.join(brollDir, limpio(params.archivo)), { force: true }); });

  // Looks propios: el estilo completo con un nombre, guardado en data/looks.json.
  const looksFile = path.join(config.root, 'data', 'looks.json');
  const leerLooks = () => { try { return JSON.parse(fs.readFileSync(looksFile, 'utf8')); } catch { return []; } };
  route.get('/looks', () => leerLooks());
  route.post('/looks', ({ body }) => {
    const nombre = String(body?.nombre || '').trim().slice(0, 40);
    if (!nombre || !body.style || typeof body.style !== 'object') throw new Error('Ponle un nombre al look.');
    const todos = leerLooks().filter((l) => l.nombre.toLowerCase() !== nombre.toLowerCase());
    const look = { id: Date.now().toString(36), nombre, style: body.style, creado: new Date().toISOString() };
    fs.writeFileSync(looksFile, JSON.stringify([...todos, look], null, 2));
    return look;
  });
  route.delete('/looks/:id', ({ params }) => { fs.writeFileSync(looksFile, JSON.stringify(leerLooks().filter((l) => l.id !== params.id), null, 2)); });

  // Volumen del audio cada 10 ms, para dibujar la onda y detectar silencios en el navegador.
  route.get('/proyectos/:id/envolvente', async ({ params }) => {
    const d = dir(params.id);
    const f = path.join(d, 'envolvente.json');
    if (!fs.existsSync(f)) {
      const py = pythonPath();
      if (!py) throw new Error('Falta instalar el motor. Haz doble clic en Instalar.command.');
      await new Promise((ok, no) => execFile(py, [path.join(engine, 'cli.py'), 'onda', d], { cwd: engine, maxBuffer: 1 << 24 }, (e) => (e ? no(new Error('No pude leer el audio del video.')) : ok())));
    }
    return readJson(d, 'envolvente.json');
  });
  // Vocabulario propio: términos que Whisper debe respetar y reemplazos fijos. Se comparte entre todos los videos.
  const vocabFile = path.join(config.root, 'data', 'vocabulario.json');
  const VOCAB_DEF = {
    terminos: ['The Marketographers', 'marketographers', 'Marketographer', 'Pablo Villarroel', 'Estudio Graphica', 'membresía', 'membresías', 'TikTok', 'Instagram', 'Reels', 'storytelling', 'StorySelling', 'branding', 'Lightroom', 'Photoshop'],
    reemplazos: [{ de: 'marketógrafos', a: 'marketographers' }, { de: 'marketógrafo', a: 'marketographer' }, { de: 'marquetógrafos', a: 'marketographers' }, { de: 'marquetógrafo', a: 'marketographer' }],
  };
  // Modo de transcripción: rápida (por defecto) o precisa. Lo lee el motor Python en cada transcripción.
  const transFile = path.join(config.root, 'data', 'transcripcion.json');
  route.get('/transcripcion', () => { try { return JSON.parse(fs.readFileSync(transFile, 'utf8')); } catch { return { modo: 'rapida' }; } });
  route.put('/transcripcion', ({ body }) => {
    const modo = body && body.modo === 'precisa' ? 'precisa' : 'rapida';
    fs.mkdirSync(path.dirname(transFile), { recursive: true });
    fs.writeFileSync(transFile, JSON.stringify({ modo }));
    return { modo };
  });
  route.get('/vocabulario', () => { try { return JSON.parse(fs.readFileSync(vocabFile, 'utf8')); } catch { return VOCAB_DEF; } });
  route.put('/vocabulario', ({ body }) => {
    const limpio = {
      terminos: (body.terminos || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 200),
      reemplazos: (body.reemplazos || []).map((r) => ({ de: String(r.de || '').trim(), a: String(r.a || '').trim() })).filter((r) => r.de && r.a).slice(0, 200),
    };
    fs.mkdirSync(path.dirname(vocabFile), { recursive: true });
    fs.writeFileSync(vocabFile, JSON.stringify(limpio, null, 2));
    return limpio;
  });
  route.post('/proyectos/:id/vocabulario/aplicar', async ({ params }) => {
    const d = dir(params.id);
    const py = pythonPath();
    if (!py) throw new Error('Falta instalar el motor. Haz doble clic en Instalar.command.');
    const salida = await new Promise((ok, no) => execFile(py, [path.join(engine, 'cli.py'), 'vocab', d], { cwd: engine, maxBuffer: 1 << 24 }, (e, so) => (e ? no(new Error('No pude aplicar el vocabulario.')) : ok(so))));
    let cambios = [];
    try { cambios = JSON.parse(salida.trim().split('\n').pop()); } catch {}
    return { cambios, words: readJson(d, 'words.json', { words: [] }).words };
  });
  route.get('/proyectos/:id/palabras-originales', ({ params }) => ({ words: readJson(dir(params.id), 'words_orig.json', { words: [] }).words }));
  route.put('/proyectos/:id/palabras', async ({ params, body }) => {
    const d = dir(params.id);
    const orig = path.join(d, 'words_orig.json');
    if (!fs.existsSync(orig)) fs.copyFileSync(path.join(d, 'words.json'), orig);
    const data = readJson(d, 'words.json', {});
    const words = (body.words || []).map((w) => ({ w: String(w.w), start: Number(w.start), end: Number(w.end) }));
    fs.writeFileSync(path.join(d, 'words.json'), JSON.stringify({ ...data, words }, null, 2));
    // Voz en off: las frases animadas se rehacen solas con el texto nuevo y conservan lo que elegiste en cada una.
    if (readJson(d, 'meta.json', {}).tipo === 'voz' && (body.plan || fs.existsSync(path.join(d, 'plan.json')))) {
      const py = pythonPath();
      if (!py) return { ok: true, sincronizado: false };
      if (body.plan) fs.writeFileSync(path.join(d, 'plan.json'), JSON.stringify(body.plan, null, 2));
      await new Promise((ok) => execFile(py, [path.join(engine, 'cli.py'), 'plan', d, '--solo', 'frases'], { cwd: engine, maxBuffer: 1 << 24 }, () => ok()));
      return { ok: true, sincronizado: true, plan: readJson(d, 'plan.json') };
    }
    return { ok: true };
  });
  route.post('/proyectos/:id/renderizar', ({ params, body }) => {
    const a = ['render', '--calidad', ['final', 'medio'].includes(body.calidad) ? body.calidad : 'borrador'];
    if (body.desde != null) a.push('--desde', String(Math.max(0, Number(body.desde))));
    if (body.hasta != null) a.push('--hasta', String(Number(body.hasta)));
    lanzar(params.id, a);
  });
  // Exportar con presets (una pasada de ffmpeg sobre final.mp4)
  route.get('/presets-export', () => readJson(engine, 'presets_export.json', { presets: [] }));
  route.post('/proyectos/:id/exportar', ({ params, body }) => {
    const ids = readJson(engine, 'presets_export.json', { presets: [] }).presets.map((p) => p.id);
    const pid = body.preset === 'custom' ? 'custom' : ids.includes(body.preset) ? body.preset : null;
    if (!pid) throw new Error('Ajuste no válido');
    lanzar(params.id, ['exportar', '--preset', pid, ...(pid === 'custom' ? ['--custom', JSON.stringify(body.custom || {})] : [])]);
  });
  route.get('/proyectos/:id/exportados', ({ params }) => {
    const d = path.join(dir(params.id), 'export'), med = readJson(d, 'medidas.json', {});
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => f !== 'medidas.json').map((nombre) => ({ nombre, mb: +(fs.statSync(path.join(d, nombre)).size / 1048576).toFixed(1), ...(med[nombre] || {}) }));
  });
  route.get('/proyectos/:id/exportados/:archivo', ({ params }) => {
    const f = limpio(params.archivo), e = path.extname(f).slice(1).toLowerCase();
    return { __file: path.join(dir(params.id), 'export', f), type: { mp4: 'video/mp4', mov: 'video/quicktime', gif: 'image/gif', wav: 'audio/wav', mp3: 'audio/mpeg' }[e] || 'application/octet-stream' };
  });
  // Portada: el motor guarda portada.png en la carpeta del proyecto.
  route.post('/proyectos/:id/portada', async ({ params, body }) => {
    const d = dir(params.id);
    const py = pythonPath();
    if (!py) throw new Error('Falta instalar el motor. Haz doble clic en Instalar.command.');
    const ok = (v, lista, def) => (lista.includes(v) ? v : def);
    const args = [path.join(engine, 'cli.py'), 'portada', d, '--t', String(Math.max(0, Number(body.t) || 0)), '--texto', String(body.texto || '').slice(0, 60),
      '--pos', ok(body.pos, ['detras', 'arriba', 'centro', 'abajo'], 'detras'), '--size', ok(body.size, ['S', 'M', 'L', 'XL'], 'XL'), '--color', ok(body.color, ['accent', 'text'], 'accent')];
    if (body.y != null) args.push('--y', String(Number(body.y)));
    if (/^portada(_v[1-3])?\.png$/.test(body.salida || '')) args.push('--salida', body.salida);
    await new Promise((res, rej) => execFile(py, args, { cwd: engine }, (e, so, se) => (e ? rej(new Error('No pude armar la portada.')) : res())));
  });
  route.get('/proyectos/:id/luz', async ({ params }) => {
    const d = dir(params.id);
    const f = path.join(d, 'luz.json');
    if (!fs.existsSync(f)) {
      const py = pythonPath();
      if (!py) throw new Error('Falta instalar el motor. Haz doble clic en Instalar.command.');
      await new Promise((res, rej) => execFile(py, [path.join(engine, 'cli.py'), 'luz', d], { cwd: engine }, (e) => (e ? rej(new Error('No pude medir la luz del fondo.')) : res())));
    }
    return readJson(d, 'luz.json');
  });
  route.get('/proyectos/:id/portada/imagen', ({ params, query }) => ({ __file: path.join(dir(params.id), /^portada_v[1-3]\.png$/.test(query.n || '') ? query.n : 'portada.png'), type: 'image/png' }));
  // Los mejores fotogramas para la portada, elegidos por el motor (cara, ojos, nitidez, luz).
  route.post('/proyectos/:id/portada/candidatos', async ({ params }) => {
    const d = dir(params.id);
    const py = pythonPath();
    if (!py) throw new Error('Falta instalar el motor. Haz doble clic en Instalar.command.');
    await new Promise((res, rej) => execFile(py, [path.join(engine, 'cli.py'), 'candidatos', d], { cwd: engine, maxBuffer: 1 << 24 }, (e) => (e ? rej(new Error('No pude elegir los fotogramas.')) : res())));
    return readJson(d, 'candidatos.json', []);
  });
  route.get('/proyectos/:id/portada/candidatos', ({ params }) => readJson(dir(params.id), 'candidatos.json', []));
  route.get('/proyectos/:id/candidato/:i', ({ params }) => ({ __file: path.join(dir(params.id), `cand_${Number(params.i) | 0}.jpg`), type: 'image/jpeg' }));
  // Miniatura del proyecto (se crea la primera vez que se pide).
  route.get('/proyectos/:id/miniatura', async ({ params }) => {
    const d = dir(params.id);
    const f = path.join(d, 'thumb.jpg');
    if (!fs.existsSync(f)) {
      const py = pythonPath();
      if (!py || !fs.existsSync(path.join(d, 'source.mp4'))) throw new Error('Sin miniatura');
      await new Promise((res, rej) => execFile(py, [path.join(engine, 'cli.py'), 'miniatura', d], { cwd: engine }, (e) => (e ? rej(new Error('Sin miniatura')) : res())));
    }
    return { __file: f, type: 'image/jpeg' };
  });
  route.post('/proyectos/:id/duplicar', ({ params }) => {
    const d = dir(params.id);
    const nuevo = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const destino = path.join(base, nuevo);
    fs.cpSync(d, destino, { recursive: true, filter: (src) => !/(^|\/)(final\.mp4|final_4x5\.mp4|final_1x1\.mp4|final_9x16\.mp4|final_16x9\.mp4|subtitulos\.srt|transcripcion\.md|preview\.mp4|_video\.mp4|_proxy\.mp4|motor\.log)$/.test(src) });
    const meta = readJson(destino, 'meta.json', {});
    fs.writeFileSync(path.join(destino, 'meta.json'), JSON.stringify({ ...meta, nombre: `${meta.nombre || 'Video'} (copia)`, creado: new Date().toISOString() }));
    return { id: nuevo };
  });
  route.get('/proyectos/:id/video/:cual', ({ params }) => {
    const f = { source: 'source.mp4', preview: 'preview.mp4', final: 'final.mp4', alpha: 'alpha.mp4' }[params.cual];
    if (!f) throw new Error('Video desconocido');
    return { __file: path.join(dir(params.id), f), type: 'video/mp4' };
  });
  // Extras de exportación: subtítulos .srt y versiones 4:5, 1:1, 9:16 y 16:9 del video final.
  const EXTRA = { srt: 'subtitulos.srt', md: 'transcripcion.md', '4x5': 'final_4x5.mp4', '1x1': 'final_1x1.mp4', '9x16': 'final_9x16.mp4', '16x9': 'final_16x9.mp4' };
  route.post('/proyectos/:id/extra', ({ params, body }) => {
    if (!EXTRA[body.tipo]) throw new Error('Formato desconocido');
    if (body.tipo === 'srt') lanzar(params.id, ['srt']);
    else if (body.tipo === 'md') lanzar(params.id, ['transcripcion']);
    else lanzar(params.id, ['formato', '--fmt', body.tipo, '--y', String(Math.min(1, Math.max(0, Number(body.y ?? 0.45)))), '--x', String(Math.min(1, Math.max(0, Number(body.x ?? 0.5))))]);
  });
  route.get('/proyectos/:id/extra/:tipo', ({ params }) => {
    const f = EXTRA[params.tipo];
    if (!f) throw new Error('Formato desconocido');
    const ruta = path.join(dir(params.id), f);
    if (!fs.existsSync(ruta)) throw new Error('Todavía no lo has generado');
    return { __file: ruta, type: params.tipo === 'srt' ? 'text/plain; charset=utf-8' : params.tipo === 'md' ? 'text/markdown; charset=utf-8' : 'video/mp4' };
  });
  route.get('/proyectos/:id/extras', ({ params }) => { const d = dir(params.id); return Object.fromEntries(Object.entries(EXTRA).map(([k, f]) => [k, fs.existsSync(path.join(d, f))])); });
  route.delete('/proyectos/:id', ({ params }) => { fs.rmSync(dir(params.id), { recursive: true, force: true }); });
}
