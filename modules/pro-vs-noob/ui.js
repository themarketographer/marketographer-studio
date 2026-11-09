// Interfaz de Pro vs Noob: subes las dos tomas, eliges etiquetas y ves el resultado en vivo mientras ajustas.
const ANIMS = [['pop', 'Pop'], ['deslizar', 'Desliza'], ['caer', 'Cae'], ['zoom', 'Zoom'], ['rebote', 'Rebota'], ['resorte', 'Resorte'], ['desenfoque', 'Enfoca'], ['escribir', 'Escribe']];
const A = '/pro-vs-noob';
const LS_PERFILES = 'estudio.pvn.perfiles', LS_DEFECTO = 'estudio.pvn.defecto';
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin memoria */ } };
const svg = (d, z = 20) => `<svg viewBox="0 0 24 24" width="${z}" height="${z}" fill="currentColor" aria-hidden="true">${d}</svg>`;
const D = { play: '<path d="M7 4l13 8-13 8z"/>', pausa: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>', parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>', inicio: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>' };
const trazo = (d, z = 16) => `<svg viewBox="0 0 24 24" width="${z}" height="${z}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export async function mount(root, { api, toast, h, icon }) {
  const S = { p: null, poll: 0, tab: 'tomas' };
  const seg = (label, opts, val, on) => h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, label),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, opts.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === val), class: 'seg-b' + (v === val ? ' on' : ''), onclick: () => on(v) }, l))));
  const subir = (id, lado, file) => new Promise((ok, no) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${A}/proyectos/${id}/subir/${lado}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.onload = () => (xhr.status === 200 ? ok() : no(new Error('No pude subir el video.')));
    xhr.onerror = () => no(new Error('No pude subir el video.'));
    xhr.send(file);
  });
  // Borrar pide un segundo clic en el mismo botón (sin ventanas del sistema).
  const dobleClic = (btn, fn) => btn.addEventListener('click', () => {
    if (!btn.classList.contains('seguro')) { btn.classList.add('seguro'); const t = btn.textContent; btn.textContent = '¿Seguro?'; setTimeout(() => { btn.classList.remove('seguro'); btn.textContent = t; }, 2500); return; }
    fn();
  });

  async function inicio() {
    clearInterval(S.poll); S.p = null;
    const lista = await api(`${A}/proyectos`).catch(() => []);
    const nuevo = h('button', { type: 'button', class: 'btn gold', onclick: async () => {
      const p = await api(`${A}/proyectos`, { method: 'POST', body: { nombre: 'Pro vs Noob ' + new Date().toLocaleDateString('es') } });
      const def = leer(LS_PERFILES, []).find((x) => x.id === leer(LS_DEFECTO, null));  // el perfil marcado como predeterminado se aplica a los proyectos nuevos
      if (def) await api(`${A}/proyectos/${p.id}/config`, { method: 'PUT', body: { ...p.config, ...def.config } }).catch(() => {});
      abrir(p.id);
    }, html: icon('plus') + ' Nuevo Pro vs Noob' });
    root.replaceChildren(
      h('div', { class: 'page-head' }, h('h1', {}, 'Pro vs Noob')),
      h('div', { class: 'row-gap' }, nuevo),
      lista.length ? h('div', { class: 'pvn-lista' }, lista.map((p) => {
        const borrar = h('button', { type: 'button', class: 'btn danger sm' }, 'Borrar');
        dobleClic(borrar, async () => { await api(`${A}/proyectos/${p.id}`, { method: 'DELETE' }); inicio(); });
        return h('div', { class: 'card pvn-item' },
          h('div', {}, h('strong', {}, p.nombre), h('small', {}, p.tieneFinal ? 'Listo para descargar' : p.tieneA && p.tieneB ? 'Con las dos tomas' : 'Faltan tomas')),
          h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => abrir(p.id) }, 'Abrir'), borrar));
      })) : null);
    window.estudioEntrada && window.estudioEntrada(root);
  }

  async function abrir(id) {
    S.p = await api(`${A}/proyectos/${id}`);
    pintar();
    if (S.p.corriendo) seguir();
  }
  const guardar = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => api(`${A}/proyectos/${S.p.id}/config`, { method: 'PUT', body: S.p.config }).catch(() => {}), 250); }; })();
  const cfg = () => S.p.config;
  const url = (c) => `/api${A}/proyectos/${S.p.id}/video/${c}?v=${S.p.ver || 0}`;

  function seguir() {
    clearInterval(S.poll);
    S.poll = setInterval(async () => {
      const r = await api(`${A}/proyectos/${S.p.id}`).catch(() => null);
      if (!r) return;
      S.p.status = r.status; S.p.corriendo = r.corriendo;
      const barra = root.querySelector('.pvn-prog i'); if (barra) barra.style.width = (r.status?.pct || 0) + '%';
      if (!r.corriendo) { clearInterval(S.poll); S.p = { ...r, ver: Date.now() }; pintar(); if (r.status?.error) toast(r.status.error); else toast('Tu video está listo.'); }
    }, 1200);
  }

  // La vista previa usa las tomas originales y las mismas etiquetas, así que lo que ves es lo que se exporta.
  const turnosDe = (c) => {
    if (c.turnos && c.turnos.length) return c.turnos;
    const da = S.p.duraciones?.a || 6, db = S.p.duraciones?.b || 6, k = c.partes || 3, out = [];
    for (let i = 0; i < k; i++) { out.push({ lado: 'a', desde: (da / k) * i, hasta: (da / k) * (i + 1) }); out.push({ lado: 'b', desde: (db / k) * i, hasta: (db / k) * (i + 1) }); }
    return out;
  };
  // Diálogo: se ve una sola toma a la vez y los turnos se van turnando, como en el video final.
  function vistaDialogo() {
    const c = cfg();
    const va = h('video', { src: S.p.tieneA ? url('a') : '', playsinline: true, preload: 'auto' });
    const vb = h('video', { src: S.p.tieneB ? url('b') : '', playsinline: true, preload: 'auto' });
    const nombre = h('b', {}), et = h('div', { class: `pvn-et a-${c.anim}` }, nombre);
    const panel = (v, l) => h('div', { class: 'pvn-panel pvn-solo', 'data-lado': l }, v);
    const pa = panel(va, 'a'), pb = panel(vb, 'b');
    const pantalla = h('div', { class: 'pvn-pantalla pvn-dialogo' }, pa, pb, et, c.titulo ? h('div', { class: 'pvn-tit' }, c.titulo) : null);
    for (const [x, l] of [[va, 'a'], [vb, 'b']]) x.addEventListener('loadedmetadata', () => { S.p.duraciones = { ...(S.p.duraciones || {}), [l]: x.duration }; });
    let i = 0, activo = null;
    const vid = (l) => (l === 'a' ? va : vb);
    const pintarTurno = (t) => {
      pa.classList.toggle('on', t.lado === 'a'); pb.classList.toggle('on', t.lado === 'b');
      nombre.textContent = t.lado === 'a' ? c.a.nombre : c.b.nombre; et.style.setProperty('--col', t.lado === 'a' ? c.a.color : c.b.color);
      et.style.animation = 'none'; void et.offsetWidth; et.style.animation = '';
    };
    const entrar = (k) => {
      const ts = turnosDe(c), t = ts[k];
      if (!t) { va.pause(); vb.pause(); i = 0; activo = null; if (ts[0]) pintarTurno(ts[0]); return; }
      i = k; activo = t; pintarTurno(t);
      const v = vid(t.lado), otro = vid(t.lado === 'a' ? 'b' : 'a');
      otro.pause(); v.muted = false; otro.muted = true; v.currentTime = t.desde; v.play().catch(() => {});
    };
    const tick = () => { if (activo && !vid(activo.lado).paused && vid(activo.lado).currentTime >= activo.hasta - 0.04) entrar(i + 1); };
    va.addEventListener('timeupdate', tick); vb.addEventListener('timeupdate', tick);
    const suena = () => !!(activo && !vid(activo.lado).paused);
    const alternar = () => { if (suena()) { vid(activo.lado).pause(); return; } if (activo && vid(activo.lado).currentTime > activo.desde + 0.05 && vid(activo.lado).currentTime < activo.hasta - 0.05) vid(activo.lado).play().catch(() => {}); else entrar(0); };
    const parar = () => { va.pause(); vb.pause(); entrar(-1); };
    const t0 = turnosDe(c)[0]; if (t0) pintarTurno(t0);
    const verTurno = (k) => entrar(k);
    const phone = h('div', { class: 'phone', title: 'Clic para reproducir o pausar', onclick: alternar }, pantalla);
    return { el: phone, alternar, parar, reiniciar: () => {}, va, vb, suena, verTurno, dialogo: true };
  }

  function vista() {
    if ((cfg().modo || 'dialogo') === 'dialogo') return vistaDialogo();
    const c = cfg(), lado = c.layout === 'lado';
    const va = h('video', { src: S.p.tieneA ? url('a') : '', playsinline: true, loop: true, preload: 'auto' });
    const vb = h('video', { src: S.p.tieneB ? url('b') : '', playsinline: true, loop: true, preload: 'auto' });
    const aplicarAudio = () => { va.muted = c.audio === 'b'; vb.muted = c.audio === 'a'; };
    aplicarAudio();
    const et = (txt, col, n) => h('div', { class: `pvn-et a-${c.anim}`, style: `--col:${col};--d:${n ? 0.5 : 0.15}s` }, h('b', {}, txt));
    const pantalla = h('div', { class: 'pvn-pantalla' + (lado ? ' lado' : '') },
      h('div', { class: 'pvn-panel' }, va, et(c.a.nombre, c.a.color, 0)),
      h('div', { class: 'pvn-panel' }, vb, et(c.b.nombre, c.b.color, 1)),
      c.vs ? h('div', { class: 'pvn-vs' }, 'VS') : null,
      c.titulo ? h('div', { class: 'pvn-tit' }, c.titulo) : null);
    const reiniciar = () => { pantalla.querySelectorAll('.pvn-et, .pvn-vs, .pvn-tit').forEach((e) => { e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; }); };
    const empezar = () => { va.currentTime = 0; vb.currentTime = 0; reiniciar(); return Promise.all([va.play(), vb.play()]).catch(() => {}); };
    const alternar = () => { if (va.paused) { if (va.currentTime < 0.05 || va.ended) return empezar(); return Promise.all([va.play(), vb.play()]).catch(() => {}); } va.pause(); vb.pause(); };
    const parar = () => { va.pause(); vb.pause(); va.currentTime = 0; vb.currentTime = 0; reiniciar(); };
    // La toma B sigue a la A para que no se desfasen.
    va.addEventListener('timeupdate', () => { if (!vb.paused && Math.abs(vb.currentTime - va.currentTime) > 0.3) vb.currentTime = va.currentTime; });
    const phone = h('div', { class: 'phone', title: 'Clic para reproducir o pausar', onclick: alternar }, pantalla);
    return { el: phone, alternar, parar, reiniciar, va, vb, suena: () => !va.paused };
  }

  // ---------- perfiles: todo lo que se configura, guardado con nombre y aplicado en un clic ----------
  function botonPerfiles() {
    const lista = h('div', { class: 'pop pop-abajo', hidden: true, role: 'dialog', 'aria-label': 'Perfiles' });
    const nombre = h('input', { type: 'text', class: 'perfil-nombre', placeholder: 'Nombre del perfil', 'aria-label': 'Nombre del perfil', autocomplete: 'off' });
    const pintarLista = () => {
      const ps = leer(LS_PERFILES, []), def = leer(LS_DEFECTO, null);
      lista.replaceChildren(
        h('p', { class: 'pop-sec' }, 'Perfiles'),
        ...(ps.length ? ps.map((e) => {
          const borrar = h('button', { type: 'button', class: 'perfil-ic borrar', title: 'Borrar perfil (doble clic)', html: trazo('<path d="M6 6l12 12M18 6L6 18"/>') });
          dobleClic(borrar, () => { escribir(LS_PERFILES, ps.filter((x) => x.id !== e.id)); if (def === e.id) escribir(LS_DEFECTO, null); pintarLista(); });
          return h('div', { class: 'perfil-fila' },
            h('button', { type: 'button', class: 'perfil-usar', title: 'Aplicar a este proyecto', onclick: async () => { cerrar(); Object.assign(cfg(), JSON.parse(JSON.stringify(e.config))); guardar(); pintar(); toast(`Perfil «${e.nombre}» aplicado`); } },
              h('span', { class: 'pvn-punto', style: `background:${e.config.a.color}` }), h('span', { class: 'pvn-punto', style: `background:${e.config.b.color}` }), h('strong', {}, e.nombre)),
            h('button', { type: 'button', class: 'perfil-ic' + (def === e.id ? ' on' : ''), title: def === e.id ? 'Se usa en proyectos nuevos (clic para quitar)' : 'Usar en proyectos nuevos', 'aria-pressed': String(def === e.id), onclick: () => { escribir(LS_DEFECTO, def === e.id ? null : e.id); pintarLista(); }, html: trazo('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>') }),
            h('button', { type: 'button', class: 'perfil-ic', title: 'Actualizar con lo que tienes ahora', onclick: () => { e.config = JSON.parse(JSON.stringify(cfg())); escribir(LS_PERFILES, ps); toast(`«${e.nombre}» actualizado`); }, html: trazo('<path d="M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>') }),
            borrar);
        }) : [h('p', { class: 'pop-vacio' }, 'Sin perfiles')]),
        h('hr', { class: 'pop-sep' }),
        h('div', { class: 'perfil-nuevo' }, nombre, h('button', { type: 'button', class: 'btn gold sm', onclick: () => {
          const n = nombre.value.trim(); if (!n) { nombre.focus(); return; }
          escribir(LS_PERFILES, [...leer(LS_PERFILES, []), { id: 'p' + Date.now().toString(36), nombre: n, config: JSON.parse(JSON.stringify(cfg())) }]); nombre.value = ''; pintarLista(); toast(`Perfil «${n}» guardado`);
        } }, 'Guardar lo actual')));
    };
    nombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lista.querySelector('.perfil-nuevo .btn')?.click(); } });
    const cerrar = () => { lista.hidden = true; document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', esc, true); };
    const fuera = (e) => { if (!wrap.contains(e.target)) cerrar(); }; const esc = (e) => { if (e.key === 'Escape') cerrar(); };
    const b = h('button', { type: 'button', class: 'btn ghost sm', title: 'Perfiles: guardar y aplicar toda la configuración', 'aria-label': 'Perfiles', 'aria-haspopup': 'dialog', html: trazo('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', 18),
      onclick: () => { if (lista.hidden) { pintarLista(); lista.hidden = false; document.addEventListener('pointerdown', fuera, true); document.addEventListener('keydown', esc, true); } else cerrar(); } });
    const wrap = h('div', { class: 'pop-wrap' }, b, lista);
    return wrap;
  }

  function pintar() {
    const p = S.p, c = cfg(), listo = p.tieneA && p.tieneB;
    const caja = (lado, nombre) => {
      const input = h('input', { type: 'file', accept: 'video/*,.mp4,.mov,.m4v', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; toast('Subiendo la toma...'); try { await subir(p.id, lado, f); const r = await api(`${A}/proyectos/${p.id}`); S.p = { ...r, ver: Date.now() }; pintar(); } catch (er) { toast(er.message); } } });
      const tiene = lado === 'a' ? p.tieneA : p.tieneB;
      const el = h('button', { type: 'button', class: 'pvn-toma' + (tiene ? ' ok' : ''), onclick: () => input.click() },
        h('strong', {}, nombre), h('span', {}, tiene ? 'Cambiar video' : 'Subir video'), input);
      // arrastrar un archivo sobre la toma también sirve
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('sobre'); });
      el.addEventListener('dragleave', () => el.classList.remove('sobre'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('sobre'); const f = e.dataTransfer.files[0]; if (f) { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; input.dispatchEvent(new Event('change')); } });
      return el;
    };
    const v = vista();
    const cambiar = (fn) => { fn(); guardar(); pintar(); };
    const color = (label, val, on) => h('label', { class: 'pvn-col' }, h('span', { class: 'lbl' }, label), h('input', { type: 'color', value: val, oninput: (e) => { on(e.target.value); guardar(); } }));
    const txt = (label, val, max, on, ph) => h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, label), h('input', { value: val, maxlength: max, placeholder: ph || '', oninput: (e) => on(e.target.value) }));
    const interruptor = (label, val, on) => h('button', { type: 'button', role: 'switch', 'aria-checked': String(val), class: 'sw-row', onclick: on }, h('span', { class: 'sw' + (val ? ' on' : ''), 'aria-hidden': 'true' }, h('i')), label);
    // Turnos del diálogo: de qué toma sale cada tramo y de qué segundo a qué segundo.
    const editorTurnos = () => {
      const ts = c.turnos || (c.turnos = []);
      const fila = (t, k) => {
        const lado = t.lado, col_ = lado === 'a' ? c.a.color : c.b.color;
        const num = (campo) => h('input', { type: 'number', class: 'pvn-seg', min: 0, step: 0.1, value: Number(t[campo]).toFixed(1), 'aria-label': campo === 'desde' ? 'Desde' : 'Hasta', onchange: (e) => { t[campo] = Math.max(0, Number(e.target.value) || 0); guardar(); } });
        const quitar = h('button', { type: 'button', class: 'pvn-ic borrar', title: 'Quitar turno (doble clic)', html: trazo('<path d="M6 6l12 12M18 6L6 18"/>') });
        dobleClic(quitar, () => cambiar(() => ts.splice(k, 1)));
        return h('div', { class: 'pvn-turno' },
          h('button', { type: 'button', class: 'pvn-lado', style: `--col:${col_}`, title: 'Cambiar de toma', onclick: () => cambiar(() => { t.lado = lado === 'a' ? 'b' : 'a'; }) }, lado === 'a' ? c.a.nombre : c.b.nombre),
          num('desde'), h('span', { class: 'pvn-flecha' }, '→'), num('hasta'),
          h('button', { type: 'button', class: 'pvn-ic', title: 'Ver este turno', onclick: () => v.verTurno(k), html: svg(D.play, 16) }),
          h('button', { type: 'button', class: 'pvn-ic', title: 'Subir', disabled: k === 0, onclick: () => cambiar(() => { [ts[k - 1], ts[k]] = [ts[k], ts[k - 1]]; }), html: trazo('<path d="M6 15l6-6 6 6"/>') }),
          h('button', { type: 'button', class: 'pvn-ic', title: 'Bajar', disabled: k === ts.length - 1, onclick: () => cambiar(() => { [ts[k + 1], ts[k]] = [ts[k], ts[k + 1]]; }), html: trazo('<path d="M6 9l6 6 6-6"/>') }),
          quitar);
      };
      const auto = h('div', { class: 'pvn-auto' },
        h('span', { class: 'lbl' }, 'Alternar en'),
        h('button', { type: 'button', class: 'pvn-ic', title: 'Menos partes', onclick: () => cambiar(() => { c.partes = Math.max(1, (c.partes || 3) - 1); }), html: trazo('<path d="M5 12h14"/>') }),
        h('output', {}, `${c.partes || 3} partes`),
        h('button', { type: 'button', class: 'pvn-ic', title: 'Más partes', onclick: () => cambiar(() => { c.partes = Math.min(12, (c.partes || 3) + 1); }), html: trazo('<path d="M12 5v14M5 12h14"/>') }),
        h('button', { type: 'button', class: 'btn gold sm', disabled: !listo, onclick: () => cambiar(() => { c.turnos = turnosDe({ ...c, turnos: [] }).map((t) => ({ lado: t.lado, desde: +t.desde.toFixed(2), hasta: +t.hasta.toFixed(2) })); }) }, 'Armar'));
      const agregar = h('button', { type: 'button', class: 'btn ghost sm', disabled: !listo, onclick: () => cambiar(() => {
        const ult = ts[ts.length - 1], lado = ult && ult.lado === 'a' ? 'b' : 'a', fin = ts.filter((x) => x.lado === lado).reduce((m, x) => Math.max(m, x.hasta), 0);
        ts.push({ lado, desde: +fin.toFixed(2), hasta: +(fin + 3).toFixed(2) });
      }) }, 'Añadir turno');
      return h('div', { class: 'pvn-turnos' }, auto, ...ts.map(fila), agregar);
    };
    // Tres grupos en pestañas: de dónde salen las tomas, cómo se rotulan y cómo suenan.
    const PEST = {
      tomas: () => [
        h('div', { class: 'pvn-tomas' }, caja('a', c.a.nombre || 'Noob'), caja('b', c.b.nombre || 'Pro')),
        seg('Formato', [['dialogo', 'Diálogo'], ['dividida', 'Pantalla dividida']], c.modo || 'dialogo', (x) => cambiar(() => { c.modo = x; })),
        (c.modo || 'dialogo') === 'dividida' ? seg('Disposición', [['apilado', 'Arriba y abajo'], ['lado', 'Lado a lado']], c.layout, (x) => cambiar(() => { c.layout = x; })) : null,
        (c.modo || 'dialogo') === 'dialogo' ? editorTurnos() : null,
      ],
      etiquetas: () => [
        h('div', { class: 'pvn-dos' },
          txt('Primera', c.a.nombre, 14, (x) => { c.a.nombre = x; guardar(); v.el.querySelectorAll('.pvn-et b')[0].textContent = x; }),
          txt('Segunda', c.b.nombre, 14, (x) => { c.b.nombre = x; guardar(); v.el.querySelectorAll('.pvn-et b')[1].textContent = x; })),
        h('div', { class: 'pvn-dos' },
          color('Color de la primera', c.a.color, (x) => { c.a.color = x; v.el.querySelectorAll('.pvn-et')[0].style.setProperty('--col', x); }),
          color('Color de la segunda', c.b.color, (x) => { c.b.color = x; v.el.querySelectorAll('.pvn-et')[1].style.setProperty('--col', x); })),
        seg('Animación', ANIMS, c.anim, (x) => cambiar(() => { c.anim = x; })),
        txt('Título abajo', c.titulo, 60, (x) => { c.titulo = x; guardar(); }, 'Opcional'),
        interruptor('Insignia VS', c.vs, () => cambiar(() => { c.vs = !c.vs; })),
      ],
      sonido: () => (c.modo || 'dialogo') === 'dialogo' ? [h('p', { class: 'hint' }, 'Cada turno suena con su propio audio.')] : [
        seg('Audio', [['b', 'Segunda'], ['a', 'Primera'], ['mezcla', 'Mezcla']], c.audio, (x) => cambiar(() => { c.audio = x; })),
        seg('Duración', [['min', 'La más corta'], ['a', 'Primera'], ['b', 'Segunda']], c.duracion, (x) => cambiar(() => { c.duracion = x; })),
      ],
    };
    const NOMBRES = [['tomas', 'Tomas'], ['etiquetas', 'Etiquetas'], ['sonido', 'Sonido']];
    const tabs = h('div', { class: 'sec-tabs', role: 'tablist' }, NOMBRES.map(([id, n]) => h('button', { type: 'button', role: 'tab', class: 'sec-tab' + (S.tab === id ? ' on' : ''), 'aria-selected': String(S.tab === id), onclick: () => { S.tab = id; pintar(); } }, n)));
    const ctrl = h('div', { class: 'pvn-ctrl' }, tabs, h('section', { class: 'card' }, ...PEST[S.tab]()));

    const tr = (d, tit, fn, cls = '') => h('button', { type: 'button', class: 'pvn-tr ' + cls, title: tit, 'aria-label': tit, disabled: !listo, onclick: fn, html: svg(d) });
    const bPlay = tr(D.play, 'Reproducir (espacio)', v.alternar, 'pvn-play');
    const sync = () => { const suena = v.suena(); bPlay.innerHTML = svg(suena ? D.pausa : D.play); bPlay.title = suena ? 'Pausa (espacio)' : 'Reproducir (espacio)'; bPlay.classList.toggle('sonando', suena); };
    for (const x of [v.va, v.vb]) { x.addEventListener('play', sync); x.addEventListener('pause', sync); }
    S.alternar = listo ? v.alternar : null;
    const transporte = h('div', { class: 'pvn-transporte', role: 'group', 'aria-label': 'Reproducción' }, tr(D.inicio, 'Desde el principio', () => { v.parar(); v.alternar(); }), bPlay, tr(D.parar, 'Parar', v.parar));

    const estado = p.corriendo ? h('div', { class: 'card pvn-prog' }, h('strong', {}, 'Montando el video'), h('div', { class: 'bar' }, h('i', { style: `width:${p.status?.pct || 0}%` })))
      : h('div', { class: 'row-gap' },
        h('button', { type: 'button', class: 'btn gold', disabled: !listo, onclick: async () => { try { await api(`${A}/proyectos/${p.id}/renderizar`, { method: 'POST' }); S.p.corriendo = true; pintar(); seguir(); } catch (e) { toast(e.message); } }, html: icon('check') + ' Exportar 1080x1920' }),
        p.tieneFinal ? h('a', { class: 'btn ghost', href: url('final'), download: `${p.nombre}.mp4` }, 'Descargar el último') : null);
    root.replaceChildren(
      h('div', { class: 'row-between' }, h('h1', { class: 'pvn-h' }, p.nombre), h('div', { class: 'row-gap' }, botonPerfiles(), h('button', { type: 'button', class: 'btn ghost sm', onclick: inicio }, 'Volver'))),
      h('div', { class: 'pvn-cols' },
        h('div', { class: 'pvn-izq' }, v.el, transporte, estado),
        ctrl));
    window.estudioEntrada && window.estudioEntrada(root);
  }
  // Barra espaciadora: reproducir o pausar (salvo al escribir en un campo).
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || !root.isConnected || !S.alternar) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON')) return;
    e.preventDefault(); S.alternar();
  });
  inicio();
}
