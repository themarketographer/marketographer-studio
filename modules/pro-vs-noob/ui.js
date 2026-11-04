// Interfaz de Pro vs Noob: subes las dos tomas, eliges etiquetas y ves el resultado en vivo mientras ajustas.
const ANIMS = [['pop', 'Pop'], ['deslizar', 'Desliza'], ['caer', 'Cae'], ['zoom', 'Zoom'], ['rebote', 'Rebota'], ['resorte', 'Resorte'], ['desenfoque', 'Enfoca'], ['escribir', 'Escribe']];
const A = '/pro-vs-noob';

export async function mount(root, { api, toast, h, icon }) {
  const S = { p: null, poll: 0 };
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

  async function inicio() {
    clearInterval(S.poll); S.p = null;
    const lista = await api(`${A}/proyectos`).catch(() => []);
    root.replaceChildren(
      h('div', { class: 'page-head' }, h('h1', {}, 'Pro vs Noob'), h('p', {}, 'Pon dos tomas en la misma pantalla: cómo lo hace quien empieza y cómo lo hace quien sabe. Cada una lleva su etiqueta animada.')),
      h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn gold', onclick: async () => { const p = await api(`${A}/proyectos`, { method: 'POST', body: { nombre: 'Pro vs Noob ' + new Date().toLocaleDateString('es') } }); abrir(p.id); }, html: icon('plus') + ' Nuevo Pro vs Noob' })),
      lista.length ? h('div', { class: 'pvn-lista' }, lista.map((p) => h('div', { class: 'card pvn-item' },
        h('div', {}, h('strong', {}, p.nombre), h('small', {}, p.tieneFinal ? 'Listo para descargar' : p.tieneA && p.tieneB ? 'Con las dos tomas' : 'Faltan tomas')),
        h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => abrir(p.id) }, 'Abrir'),
          h('button', { type: 'button', class: 'btn danger sm', onclick: async () => { if (confirm(`Borrar "${p.nombre}"?`)) { await api(`${A}/proyectos/${p.id}`, { method: 'DELETE' }); inicio(); } } }, 'Borrar'))))) : h('p', { class: 'hint' }, 'Todavía no tienes ninguno.'));
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
  function vista() {
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
    const alternar = () => {
      if (va.paused) { va.currentTime = 0; vb.currentTime = 0; reiniciar(); Promise.all([va.play(), vb.play()]).catch(() => {}); } else { va.pause(); vb.pause(); }
    };
    // La toma B sigue a la A para que no se desfasen.
    va.addEventListener('timeupdate', () => { if (!vb.paused && Math.abs(vb.currentTime - va.currentTime) > 0.3) vb.currentTime = va.currentTime; });
    return { el: h('div', { class: 'phone' }, pantalla), alternar, reiniciar };
  }

  function pintar() {
    const p = S.p, c = cfg(), listo = p.tieneA && p.tieneB;
    const caja = (lado, nombre) => {
      const input = h('input', { type: 'file', accept: 'video/*,.mp4,.mov,.m4v', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; toast('Subiendo la toma...'); try { await subir(p.id, lado, f); const r = await api(`${A}/proyectos/${p.id}`); S.p = { ...r, ver: Date.now() }; pintar(); } catch (er) { toast(er.message); } } });
      const tiene = lado === 'a' ? p.tieneA : p.tieneB;
      return h('div', { class: 'pvn-toma' + (tiene ? ' ok' : '') }, h('strong', {}, `Toma de ${nombre}`),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => input.click() }, tiene ? 'Cambiar video' : 'Subir video'), input);
    };
    const v = vista();
    const cambiar = (fn, anim) => { fn(); guardar(); pintar(); };
    const color = (label, val, on) => h('label', { class: 'pvn-col' }, h('span', { class: 'lbl' }, label), h('input', { type: 'color', value: val, oninput: (e) => { on(e.target.value); guardar(); } }));
    const ctrl = h('div', { class: 'pvn-ctrl' },
      h('section', { class: 'card' }, h('h2', {}, '1. Las dos tomas'), h('div', { class: 'pvn-tomas' }, caja('a', c.a.nombre || 'Noob'), caja('b', c.b.nombre || 'Pro')),
        h('small', { class: 'hint' }, 'Funcionan mejor verticales. Si no lo son, se recortan desde el centro para llenar su mitad.')),
      h('section', { class: 'card' }, h('h2', {}, '2. Cómo se ven'),
        seg('Disposición', [['apilado', 'Una arriba y otra abajo'], ['lado', 'Lado a lado']], c.layout, (x) => cambiar(() => { c.layout = x; })),
        h('div', { class: 'pvn-dos' },
          h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Etiqueta de la primera'), h('input', { value: c.a.nombre, maxlength: 14, oninput: (e) => { c.a.nombre = e.target.value; guardar(); v.el.querySelectorAll('.pvn-et b')[0].textContent = c.a.nombre; } })),
          h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Etiqueta de la segunda'), h('input', { value: c.b.nombre, maxlength: 14, oninput: (e) => { c.b.nombre = e.target.value; guardar(); v.el.querySelectorAll('.pvn-et b')[1].textContent = c.b.nombre; } }))),
        h('div', { class: 'pvn-dos' }, color('Color de la primera', c.a.color, (x) => { c.a.color = x; v.el.querySelectorAll('.pvn-et')[0].style.setProperty('--col', x); }), color('Color de la segunda', c.b.color, (x) => { c.b.color = x; v.el.querySelectorAll('.pvn-et')[1].style.setProperty('--col', x); })),
        seg('Animación de las etiquetas', ANIMS, c.anim, (x) => cambiar(() => { c.anim = x; })),
        h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Título abajo (opcional)'), h('input', { value: c.titulo, maxlength: 60, placeholder: 'Por ejemplo: el mismo retrato, dos luces', oninput: (e) => { c.titulo = e.target.value; guardar(); } , onchange: () => pintar() })),
        h('button', { type: 'button', role: 'switch', 'aria-checked': String(c.vs), class: 'sw-row', onclick: () => cambiar(() => { c.vs = !c.vs; }) }, h('span', { class: 'sw' + (c.vs ? ' on' : ''), 'aria-hidden': 'true' }, h('i')), 'Insignia VS en el centro')),
      h('section', { class: 'card' }, h('h2', {}, '3. Sonido y duración'),
        seg('Qué audio suena', [['b', 'El de la segunda'], ['a', 'El de la primera'], ['mezcla', 'Las dos mezcladas']], c.audio, (x) => cambiar(() => { c.audio = x; })),
        seg('Duración del video', [['min', 'La de la toma más corta'], ['a', 'La de la primera'], ['b', 'La de la segunda']], c.duracion, (x) => cambiar(() => { c.duracion = x; }))));
    const estado = p.corriendo ? h('div', { class: 'card pvn-prog' }, h('strong', {}, 'Montando el video'), h('div', { class: 'bar' }, h('i', { style: `width:${p.status?.pct || 0}%` })), h('small', {}, 'Puedes dejar esta pantalla abierta.'))
      : h('div', { class: 'row-gap' },
        h('button', { type: 'button', class: 'btn gold', disabled: !listo, onclick: async () => { try { await api(`${A}/proyectos/${p.id}/renderizar`, { method: 'POST' }); S.p.corriendo = true; pintar(); seguir(); } catch (e) { toast(e.message); } }, html: icon('check') + ' Exportar video 1080x1920' }),
        p.tieneFinal ? h('a', { class: 'btn ghost', href: url('final'), download: `${p.nombre}.mp4` }, 'Descargar el último exportado') : null);
    root.replaceChildren(
      h('div', { class: 'row-between' }, h('h1', { class: 'pvn-h' }, p.nombre), h('button', { type: 'button', class: 'btn ghost sm', onclick: inicio }, 'Volver')),
      h('div', { class: 'pvn-cols' },
        h('div', { class: 'pvn-izq' }, v.el, h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn ghost', disabled: !listo, onclick: v.alternar }, 'Reproducir o pausar'), h('button', { type: 'button', class: 'btn ghost', onclick: v.reiniciar }, 'Ver la animación otra vez')), estado),
        ctrl));
    window.estudioEntrada && window.estudioEntrada(root);
  }
  inicio();
}
