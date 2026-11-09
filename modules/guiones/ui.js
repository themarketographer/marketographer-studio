// Interfaz del módulo Guiones. Flujo: elegir tema, elegir formato, pedir el guion, guardarlo, grabarlo.
const ESTADOS = [
  ['idea', 'Idea'], ['guion', 'Con guion'], ['grabado', 'Grabado'], ['publicado', 'Publicado'],
];
const PLANTILLAS = [
  ['Historia personal', 'Gancho: una escena concreta con lugar y momento.\n\nConflicto: lo que salió mal o lo que costaba.\n\nGiro: lo que descubriste y cambió todo.\n\nMoraleja: lo que te llevas y el siguiente paso para quien ve el video.'],
  ['Error común', 'Gancho: el error que casi todos cometen, dicho sin rodeos.\n\nPor qué pasa: la razón real detrás del error.\n\nCómo se arregla: tres pasos cortos y concretos.\n\nCierre: una pregunta que invite a comentar.'],
  ['Tutorial rápido', 'Gancho: el resultado final que van a lograr.\n\nPaso 1:\n\nPaso 2:\n\nPaso 3:\n\nCierre: qué hacer ahora y dónde seguir aprendiendo.'],
  ['Opinión polémica', 'Gancho: la frase que incomoda.\n\nArgumento: el porqué, con un dato o un ejemplo.\n\nContraargumento: lo que dirán los que no están de acuerdo y por qué se queda corto.\n\nCierre: tu postura y una invitación a debatir.'],
];
const minutosLectura = (txt) => {
  const palabras = (txt.replace(/\[[^\]]*\]/g, ' ').match(/\S+/g) || []).length;
  const seg = Math.round((palabras / 150) * 60);
  return { palabras, seg };
};
const etiqueta = (id) => ESTADOS.find((e) => e[0] === id)?.[1] || id;

// Botón de dos pasos: el primer clic pide confirmar, el segundo ejecuta. Se desarma solo a los 3 s.
function doble(h, { clase, icono, texto, aviso, accion }) {
  const b = h('button', { type: 'button', class: clase });
  let t = 0;
  const normal = () => { b.classList.remove('armado'); b.innerHTML = icono + ' ' + texto; };
  b.onclick = () => {
    if (b.classList.contains('armado')) { clearTimeout(t); normal(); return accion(); }
    b.classList.add('armado'); b.textContent = aviso; t = setTimeout(normal, 3000);
  };
  b.onblur = () => { clearTimeout(t); normal(); };
  normal(); return b;
}

export async function mount(root, { api, toast, h, icon }) {
  const S = { clases: [], temas: [], guiones: [], formatos: [], refs: [], vista: 'guiones', rq: '', rEstado: 'todas', rRobar: '', tab: 'guion', sel: null, formato: 'talking-head', filtro: 'todos', q: '', borrador: '' };

  async function cargar() {
    [S.clases, S.temas, S.guiones, S.formatos, S.refs] = await Promise.all([
      api('/guiones/clases'), api('/guiones/temas'), api('/guiones/guiones'), api('/guiones/formatos'), api('/guiones/referencias'),
    ]);
    if (!S.temas.find((t) => t.id === S.sel)) S.sel = null;
  }
  const guionDe = (temaId, formato) => S.guiones.find((g) => g.temaId === temaId && g.formato === formato);
  const tema = () => S.temas.find((t) => t.id === S.sel);

  async function copiar(texto, msg) {
    try { await navigator.clipboard.writeText(texto); }
    catch { const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = texto; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(msg);
  }
  async function guardarTema(patch) {
    await api('/guiones/temas', { method: 'POST', body: { id: S.sel, ...patch } });
    await cargar(); render();
  }

  // ---------- Esta semana (solo fichas, sin texto) ----------
  function semana() {
    const en = S.temas.filter((t) => t.semana);
    if (!en.length) return null;
    return h('div', { class: 'week-list', 'aria-label': 'Esta semana' },
      h('span', { class: 'week-ic', html: icon('star', 16) }),
      en.map((t) => h('button', { class: 'chip' + (t.id === S.sel ? ' on' : ''), onclick: () => { S.sel = t.id; S.borrador = ''; render(); } }, h('span', { class: 'dot ' + t.estado }), t.titulo)));
  }

  // ---------- Lista de temas con captura rápida ----------
  // Una sola caja: escribes una idea y Enter. Si pegas un guion largo, el primer renglón es el título y el resto queda como guion.
  function lista() {
    const filtrados = S.temas.filter((t) => (S.filtro === 'todos' || t.estado === S.filtro) && t.titulo.toLowerCase().includes(S.q.toLowerCase()));
    const caja = h('textarea', { class: 'cap-in', rows: 1, placeholder: 'Anota una idea o pega un guion', 'aria-label': 'Nueva idea o guion' });
    const ajusta = () => { caja.style.height = 'auto'; caja.style.height = Math.min(caja.scrollHeight, 180) + 'px'; };
    caja.addEventListener('input', ajusta);
    const agregar = async () => {
      const txt = caja.value.trim(); if (!txt) return;
      const lineas = txt.split('\n').map((x) => x.trim()).filter(Boolean);
      const largo = txt.length > 160 || lineas.length > 3;
      const titulo = (lineas[0] || txt).slice(0, 80);
      const t = await api('/guiones/temas', { method: 'POST', body: { titulo, estado: largo ? 'guion' : 'idea' } });
      if (largo) await api('/guiones/guiones', { method: 'POST', body: { temaId: t.id, formato: S.formato, texto: txt } });
      await cargar(); S.sel = t.id; S.borrador = ''; S.tab = 'guion'; render(); toast(largo ? 'Guion guardado' : 'Idea guardada');
    };
    caja.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agregar(); } });
    return h('aside', { class: 'col-list' },
      h('div', { class: 'cap' }, caja, h('button', { class: 'btn gold', onclick: agregar, 'aria-label': 'Guardar', title: 'Guardar (Enter)', html: icon('plus') })),
      h('div', { class: 'row-gap-s' },
        h('input', { type: 'search', placeholder: 'Buscar', 'aria-label': 'Buscar temas', value: S.q, oninput: (e) => { S.q = e.target.value; render(true); } }),
        h('button', { class: 'btn ghost ib-s', onclick: abrirClases, title: 'Traer temas de mis clases', 'aria-label': 'Traer temas de mis clases', html: icon('folder') })),
      h('div', { class: 'filters', role: 'group', 'aria-label': 'Filtrar por estado' },
        [['todos', 'Todos'], ...ESTADOS].map(([id, n]) => h('button', { class: 'f' + (S.filtro === id ? ' on' : ''), 'aria-pressed': S.filtro === id, onclick: () => { S.filtro = id; render(); } }, n))),
      h('ul', { class: 'temas' }, filtrados.length ? filtrados.map((t) =>
        h('li', {}, h('button', { class: 'tema' + (t.id === S.sel ? ' on' : ''), onclick: () => { S.sel = t.id; S.borrador = ''; render(); } },
          h('span', { class: 'tema-t' }, h('span', { class: 'dot ' + t.estado }), t.semana ? h('span', { class: 'star', html: icon('star', 14) }) : null, t.titulo),
          S.formatos.some((f) => guionDe(t.id, f.id)) ? h('span', { class: 'tema-m' }, S.formatos.filter((f) => guionDe(t.id, f.id)).map((f) => h('span', { class: 'mini' }, f.nombre))) : null))
      ) : h('li', { class: 'vacio' }, 'Nada por aquí')));
  }

  // Título editable que crece con su contenido (un input recortaría los títulos largos).
  function tituloEl(t) {
    const el = h('textarea', { class: 'titulo', rows: 1, 'aria-label': 'Título del tema', onchange: (e) => guardarTema({ titulo: e.target.value.trim() || t.titulo }) });
    el.value = t.titulo;
    const ajustar = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
    el.addEventListener('input', ajustar);
    el.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), el.blur()));
    requestAnimationFrame(ajustar);
    return el;
  }

  // ---------- Detalle ----------
  function detalle() {
    const t = tema();
    if (!t) return h('section', { class: 'col-main empty' }, h('div', { class: 'empty-ic', html: icon('pen', 34) }), h('h2', {}, 'Anota una idea'));

    const f = S.formatos.find((x) => x.id === S.formato) || S.formatos[0];
    const g = guionDe(t.id, S.formato);
    if (S.borrador === '' && g) S.borrador = g.texto;
    const area = h('textarea', { class: 'guion-area', rows: 16, placeholder: 'Pega o escribe el guion', 'aria-label': 'Guion', spellcheck: 'true' });
    area.value = S.borrador;
    const meta = h('span', { class: 'meta', 'aria-live': 'polite' });
    const estado = h('span', { class: 'estado-g' });
    const pintarMeta = () => { const { palabras, seg } = minutosLectura(area.value); meta.textContent = palabras ? `${palabras} palabras · ${seg} s` : ''; };
    let base = g ? g.texto : '', tAuto = 0, guardando = false;
    const guardar = async (silencio) => {
      const txt = area.value.trim(); if (!txt || txt === base.trim() || guardando) return;
      guardando = true; clearTimeout(tAuto); estado.textContent = 'Guardando…';
      try {
        const r = await api('/guiones/guiones', { method: 'POST', body: { id: (guionDe(t.id, S.formato) || {}).id, temaId: t.id, formato: S.formato, texto: txt } });
        base = txt; S.borrador = txt;
        const ix = S.guiones.findIndex((x) => x.id === r.id); if (ix >= 0) S.guiones[ix] = r; else S.guiones.push(r);
        if (t.estado === 'idea') { t.estado = 'guion'; await api('/guiones/temas', { method: 'POST', body: { id: t.id, estado: 'guion' } }); }
        estado.textContent = 'Guardado'; setTimeout(() => { if (estado.textContent === 'Guardado') estado.textContent = ''; }, 1800);
        if (!silencio) render();
      } catch (e) { estado.textContent = ''; toast(e.message); } finally { guardando = false; }
    };
    // Se guarda solo: un momento después de dejar de escribir o pegar.
    area.addEventListener('input', () => { S.borrador = area.value; pintarMeta(); estado.textContent = 'Sin guardar'; clearTimeout(tAuto); tAuto = setTimeout(() => guardar(true), 1200); });
    area.addEventListener('blur', () => guardar(true));
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guardar(false); } });
    pintarMeta();

    const estructura = h('select', { class: 'sel-s', 'aria-label': 'Estructura de partida', onchange: (e) => {
      const p = PLANTILLAS.find(([n]) => n === e.target.value); e.target.value = ''; if (!p) return;
      if (area.value.trim() && !confirm('Reemplazar el texto por esta estructura?')) return;
      area.value = p[1]; S.borrador = p[1]; pintarMeta(); guardar(true); area.focus();
    } }, h('option', { value: '' }, 'Estructura…'), PLANTILLAS.map(([n]) => h('option', { value: n }, n)));
    const bar = h('div', { class: 'tb' },
      h('div', { class: 'formats-s', role: 'tablist', 'aria-label': 'Formato' }, S.formatos.map((x) =>
        h('button', { role: 'tab', class: 'f' + (x.id === S.formato ? ' on' : ''), 'aria-selected': x.id === S.formato, title: x.resumen, onclick: async () => { await guardar(true); S.formato = x.id; S.borrador = ''; render(); } },
          x.nombre, guionDe(t.id, x.id) ? h('i', { class: 'dot guion' }) : null))),
      h('div', { class: 'tb-acc' }, estructura,
        h('button', { class: 'btn ghost sm', title: 'Copia la petición lista para pegar en Claude', onclick: async () => { const r = await api('/guiones/prompt', { method: 'POST', body: { temaId: t.id, formato: S.formato } }); copiar(r.prompt, 'Prompt copiado'); }, html: icon('copy') + ' Pedir a Claude' }),
        g ? h('button', { class: 'btn dark sm', onclick: () => teleprompter(area.value || g.texto), html: icon('play') + ' Grabar' }) : null));

    const PEST = {
      guion: () => [bar, area,
        h('div', { class: 'pie-g' }, meta, estado, h('span', { class: 'grow' }),
          g ? h('button', { class: 'btn ghost sm', onclick: () => copiar(area.value, 'Guion copiado'), html: icon('copy') + ' Copiar' }) : null,
          g ? doble(h, { clase: 'btn ghost sm', icono: icon('trash'), texto: 'Borrar', aviso: '¿Seguro?', accion: async () => { await api('/guiones/guiones/' + g.id, { method: 'DELETE' }); S.borrador = ''; await cargar(); render(); } }) : null)],
      notas: () => [
        h('label', { class: 'field' }, 'Ángulo', h('input', { value: t.angulo || '', placeholder: 'Para quién o desde dónde', onchange: (e) => guardarTema({ angulo: e.target.value }) })),
        h('label', { class: 'field' }, 'Notas', h('textarea', { class: 'notas-area', rows: 10, placeholder: 'Ideas sueltas, frases, datos, copy', onchange: (e) => guardarTema({ notas: e.target.value }) }, t.notas || ''))],
      refs: () => {
        const rs = S.refs.filter((r) => r.temaId === t.id);
        const link = h('input', { type: 'text', placeholder: 'Pega un link y Enter', 'aria-label': 'Link de referencia' });
        link.addEventListener('keydown', async (e) => {
          if (e.key !== 'Enter') return; e.preventDefault();
          const urls = link.value.match(/https?:\/\/\S+/g) || []; if (!urls.length) return toast('Pega un link');
          for (const url of urls) { try { await api('/guiones/referencias', { method: 'POST', body: { url, temaId: t.id } }); } catch (er) { toast(er.message); } }
          await cargar(); render();
        });
        return [link, rs.length ? h('ul', { class: 'refs' }, rs.map(tarjetaRef)) : null];
      },
    };
    const nRefs = S.refs.filter((r) => r.temaId === t.id).length;
    const tabs = h('div', { class: 'sec-tabs', role: 'tablist' }, [['guion', 'Guion'], ['notas', 'Notas'], ['refs', nRefs ? `Referencias (${nRefs})` : 'Referencias']].map(([id, n]) =>
      h('button', { type: 'button', role: 'tab', class: 'sec-tab' + (S.tab === id ? ' on' : ''), 'aria-selected': String(S.tab === id), onclick: async () => { await guardar(true); S.tab = id; render(); } }, n)));
    const estados = h('div', { class: 'estados', role: 'group', 'aria-label': 'Estado' }, ESTADOS.map(([id, n]) =>
      h('button', { type: 'button', class: 'est' + (t.estado === id ? ' on' : ''), 'aria-pressed': String(t.estado === id), title: n, onclick: () => guardarTema({ estado: id }) }, h('span', { class: 'dot ' + id }), n)));

    return h('section', { class: 'col-main' },
      h('div', { class: 'row-between' },
        tituloEl(t),
        h('div', { class: 'row-gap-s' },
          h('button', { class: 'btn ghost ib-s' + (t.semana ? ' on' : ''), 'aria-pressed': !!t.semana, title: t.semana ? 'Quitar de esta semana' : 'Agregar a esta semana', onclick: () => {
            const ya = S.temas.filter((x) => x.semana && x.id !== t.id).length;
            if (!t.semana && ya >= 3) return toast('Ya tienes 3 esta semana');
            guardarTema({ semana: !t.semana });
          }, html: icon('star') }),
          doble(h, { clase: 'btn ghost ib-s', icono: icon('trash'), texto: '', aviso: '¿Seguro?', accion: async () => { await api('/guiones/temas/' + t.id, { method: 'DELETE' }); S.sel = null; S.borrador = ''; await cargar(); render(); } }))),
      estados, tabs, ...PEST[S.tab]());
  }

  // ---------- Panel de clases ----------
  async function abrirClases() {
    const zoom = await api('/guiones/zoom-local').catch(() => ({ existe: false, carpetas: [] }));
    const cerrar = () => { dlg.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => e.key === 'Escape' && cerrar();
    document.addEventListener('keydown', esc);

    const filaClase = (c) => {
      const det = h('details', { class: 'clase' });
      const resumen = h('textarea', { rows: 6, placeholder: 'Pega aquí el resumen o los puntos clave de la clase. Mientras más material, mejor el guion.' });
      resumen.value = c.resumen || '';
      const nuevo = h('input', { placeholder: 'Escribe un tema que salga de esta clase' });
      const crear = async (titulo) => {
        if (!titulo.trim()) return;
        await api('/guiones/temas', { method: 'POST', body: { titulo: titulo.trim(), claseId: c.id } });
        await cargar(); render(); toast('Tema creado.'); nuevo.value = '';
      };
      det.append(
        h('summary', {}, h('span', {}, c.titulo), h('small', {}, c.fecha || '')),
        h('div', { class: 'clase-body' },
          h('label', { class: 'field' }, 'Material de la clase', resumen,
            h('button', { class: 'btn ghost sm', onclick: async () => { await api('/guiones/clases', { method: 'POST', body: { id: c.id, resumen: resumen.value } }); await cargar(); toast('Resumen guardado.'); } }, 'Guardar resumen')),
          c.preguntas?.length ? h('div', {}, h('h4', {}, 'Preguntas de tus alumnos'),
            h('ul', { class: 'preg' }, c.preguntas.map((q) => h('li', {}, h('span', {}, q), h('button', { class: 'btn ghost sm', onclick: () => crear(q) }, 'Usar como tema'))))) : null,
          h('div', { class: 'add' }, nuevo, h('button', { class: 'btn gold', onclick: () => crear(nuevo.value) }, 'Crear tema'))));
      return det;
    };

    const pendientes = zoom.carpetas.filter((c) => !c.importada);
    const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mis clases', onclick: (e) => e.target === dlg && cerrar() },
      h('div', { class: 'modal-box' },
        h('div', { class: 'row-between' }, h('h2', {}, 'Mis clases'), h('button', { class: 'btn ghost sm', onclick: cerrar, 'aria-label': 'Cerrar', html: icon('x') })),
        h('p', { class: 'sub' }, 'Abre una clase para pegar su resumen y sacar temas. Si la clase no está en la lista, impórtala desde tu carpeta de Zoom.'),
        h('div', {}, S.clases.map(filaClase)),
        h('h3', { class: 'sep' }, 'Importar desde tu carpeta de Zoom'),
        zoom.existe
          ? (pendientes.length ? h('ul', { class: 'zoomlist' }, pendientes.map((c) =>
              h('li', {}, h('span', {}, h('strong', {}, c.titulo), h('small', {}, ` ${c.fecha}${c.tieneChat ? ' · con chat' : ''}${c.tieneAudio ? ' · con audio' : ''}`)),
                h('button', { class: 'btn ghost sm', onclick: async () => {
                  await api('/guiones/zoom-local/importar', { method: 'POST', body: c }); await cargar(); cerrar(); abrirClases(); toast('Clase importada con las preguntas de su chat.');
                } }, 'Importar'))))
            : h('p', { class: 'sub' }, 'Todas las clases de tu carpeta ya están importadas.'))
          : h('p', { class: 'sub' }, `No encontré la carpeta ${zoom.zoomDir || 'de Zoom'}. Puedes cambiarla abriendo el estudio con ZOOM_DIR=/ruta/a/tu/carpeta.`)));
    document.body.append(dlg);
  }

  // ---------- Modo grabación ----------
  function teleprompter(texto) {
    let size = 44, vel = 0, raf, ultimo = 0;
    const cuerpo = h('div', { class: 'tp-body', tabindex: '0' });
    texto.split('\n').forEach((linea) => {
      const p = h('p', {});
      linea.split(/(\*[^*]+\*|\[[^\]]+\])/).forEach((tk) => {
        if (!tk) return;
        if (tk.startsWith('*')) p.append(h('mark', {}, tk.slice(1, -1)));
        else if (tk.startsWith('[')) p.append(h('span', { class: 'tp-tag' }, tk));
        else p.append(tk);
      });
      if (!linea.trim()) p.className = 'gap';
      cuerpo.append(p);
    });
    let espejo = false;
    const aplicar = () => { cuerpo.style.fontSize = size + 'px'; cuerpo.style.transform = espejo ? 'scaleX(-1)' : ''; };
    const paso = (t) => { if (vel) cuerpo.scrollTop += ((t - ultimo) / 1000) * vel * 14; ultimo = t; raf = requestAnimationFrame(paso); };
    const cerrar = () => { cancelAnimationFrame(raf); ov.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); if (e.key === ' ') { e.preventDefault(); vel = vel ? 0 : Number(slider.value); btn.textContent = vel ? 'Pausar' : 'Desplazar'; } };
    const slider = h('input', { type: 'range', min: 1, max: 10, value: 3, 'aria-label': 'Velocidad', oninput: () => vel && (vel = Number(slider.value)) });
    const btn = h('button', { class: 'btn gold', onclick: () => { vel = vel ? 0 : Number(slider.value); btn.textContent = vel ? 'Pausar' : 'Desplazar'; } }, 'Desplazar');
    const ov = h('div', { class: 'tp', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Modo grabación' },
      h('div', { class: 'tp-bar' },
        btn, h('label', {}, 'Velocidad ', slider),
        h('button', { class: 'btn ghost', onclick: () => { size = Math.max(24, size - 4); aplicar(); }, 'aria-label': 'Letra más pequeña' }, 'A-'),
        h('button', { class: 'btn ghost', onclick: () => { size = Math.min(96, size + 4); aplicar(); }, 'aria-label': 'Letra más grande' }, 'A+'),
        h('button', { class: 'btn ghost', 'aria-pressed': 'false', title: 'Para grabar con espejo o teleprompter de cristal', onclick: (e) => { espejo = !espejo; e.currentTarget.setAttribute('aria-pressed', String(espejo)); e.currentTarget.classList.toggle('on', espejo); aplicar(); } }, 'Espejo'),
        h('span', { class: 'tp-help' }, 'Espacio: desplazar o pausar. Esc: salir.'),
        h('button', { class: 'btn ghost', onclick: cerrar, 'aria-label': 'Cerrar', html: icon('x') })),
      cuerpo);
    document.body.append(ov); aplicar(); document.addEventListener('keydown', tecla); raf = requestAnimationFrame(paso); cuerpo.focus();
  }

  // ---------- Referencias: videos de otros para robar la mecánica ----------
  const ROBAR = ['Gancho', 'Estructura', 'Edición', 'Tema', 'Música', 'Estilo', 'Voz'];
  const REF_ESTADOS = [['porver', 'Por ver'], ['vista', 'Vista'], ['usada', 'Usada']];
  const ytId = (u) => { try { const x = new URL(u); if (/youtu\.be$/.test(x.hostname)) return x.pathname.slice(1, 12); if (/youtube\.com$/.test(x.hostname)) return x.searchParams.get('v') || (/^\/(shorts|embed|live)\/([\w-]{11})/.exec(x.pathname) || [])[2] || null; } catch { /* link raro */ } return null; };
  async function guardarRef(r, patch, repintar) {
    try { Object.assign(r, await api('/guiones/referencias', { method: 'POST', body: { id: r.id, ...patch } })); } catch (e) { return toast(e.message); }
    if (repintar) render(true);
  }
  function refsDelTema(t) {
    const rs = S.refs.filter((r) => r.temaId === t.id);
    if (!rs.length) return null;
    return h('div', { class: 'refs-tema' }, h('strong', {}, `Referencias de este tema (${rs.length})`),
      h('ul', {}, rs.map((r) => h('li', {}, h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.titulo || r.url),
        h('small', {}, ` ${r.plataforma}${r.robar?.length ? ' · ' + r.robar.join(', ') : ''}`)))));
  }
  function tarjetaRef(r) {
    const id = ytId(r.url);
    const miniatura = id ? h('img', { class: 'ref-img', src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
      : h('div', { class: 'ref-img ref-ph' }, r.plataforma);
    const copiaUrl = h('button', { type: 'button', class: 'btn ghost sm', onclick: () => copiar(r.url, 'Link copiado.'), html: icon('copy') + ' Copiar link' });
    return h('li', { class: 'ref' + (r.estado === 'usada' ? ' usada' : '') },
      h('a', { class: 'ref-thumb', href: r.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Abrir el video', title: 'Abrir el video' }, miniatura),
      h('div', { class: 'ref-body' },
        h('div', { class: 'row-between' },
          h('input', { class: 'ref-titulo', value: r.titulo || '', placeholder: 'Ponle un título para reconocerlo', 'aria-label': 'Título', onchange: (e) => guardarRef(r, { titulo: e.target.value.trim() }) }),
          h('span', { class: 'tag' }, r.plataforma)),
        h('a', { class: 'ref-url', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)),
        h('div', { class: 'filters', role: 'group', 'aria-label': 'Qué quieres robar' }, ROBAR.map((x) => {
          const on = (r.robar || []).includes(x);
          return h('button', { type: 'button', class: 'f' + (on ? ' on' : ''), 'aria-pressed': String(on),
            onclick: () => guardarRef(r, { robar: on ? r.robar.filter((y) => y !== x) : [...(r.robar || []), x] }, true) }, x);
        })),
        h('textarea', { rows: 2, class: 'ref-nota', placeholder: '¿Qué quieres robar? Ej: arranca con una pregunta incómoda y corta cada 3 segundos', 'aria-label': 'Nota', onchange: (e) => guardarRef(r, { nota: e.target.value }) }, r.nota || ''),
        h('div', { class: 'ref-acc' },
          h('select', { 'aria-label': 'Estado', onchange: (e) => guardarRef(r, { estado: e.target.value }, true) }, REF_ESTADOS.map(([v, n]) => h('option', { value: v, selected: (r.estado || 'porver') === v }, n))),
          h('select', { 'aria-label': 'Asociar a un tema', onchange: (e) => guardarRef(r, { temaId: e.target.value || null }) },
            h('option', { value: '' }, 'Sin tema'), S.temas.map((t) => h('option', { value: t.id, selected: r.temaId === t.id }, t.titulo.slice(0, 50)))),
          r.temaId ? null : h('button', { type: 'button', class: 'btn gold sm', onclick: async () => { try { const t = await api(`/guiones/referencias/${r.id}/a-tema`, { method: 'POST' }); await cargar(); S.vista = 'guiones'; S.sel = t.id; render(); toast('Tema creado desde la referencia.'); } catch (e) { toast(e.message); } } }, 'Crear tema'),
          copiaUrl,
          doble(h, { clase: 'btn danger sm', icono: icon('trash'), texto: 'Borrar', aviso: '¿Seguro? Pulsa otra vez', accion: async () => { await api('/guiones/referencias/' + r.id, { method: 'DELETE' }); await cargar(); render(); } }))));
  }
  function referencias() {
    const entrada = h('textarea', { rows: 2, placeholder: 'Pega uno o varios links (YouTube, TikTok, Instagram…) y pulsa Guardar', 'aria-label': 'Links de videos' });
    const agregar = async () => {
      const links = entrada.value.match(/https?:\/\/\S+/g) || [];
      if (!links.length) return toast('Pega al menos un link que empiece con http.');
      let ok = 0, falla = '';
      for (const url of links) { try { await api('/guiones/referencias', { method: 'POST', body: { url } }); ok++; } catch (e) { falla = e.message; } }
      await cargar(); S.rEstado = 'todas'; render();
      toast(ok ? `${ok} link${ok === 1 ? '' : 's'} guardado${ok === 1 ? '' : 's'}.${falla ? ' ' + falla : ''}` : falla);
    };
    entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); agregar(); } });
    const q = S.rq.toLowerCase();
    const lista = S.refs.filter((r) => (S.rEstado === 'todas' || (r.estado || 'porver') === S.rEstado) && (!S.rRobar || (r.robar || []).includes(S.rRobar))
      && (!q || [r.titulo, r.nota, r.url, r.plataforma].join(' ').toLowerCase().includes(q)));
    const nodos = h('ul', { class: 'refs' }, lista.length ? lista.map(tarjetaRef) : h('li', { class: 'vacio' }, S.refs.length ? 'Nada con ese filtro.' : 'Aquí guardas los videos de otros que te gustaría "robar como artista": el gancho, la estructura, la edición. Pega el primer link arriba.'));
    return h('section', { class: 'col-main refs-main' },
      h('div', {}, h('h2', {}, 'Referencias'), h('p', { class: 'sub' }, 'Roba la mecánica, no las palabras: guarda el link, marca qué te gustó y conviértelo en un tema. Tus notas viajan en el prompt para Claude.')),
      h('div', { class: 'ref-add' }, entrada, h('button', { class: 'btn gold', onclick: agregar, title: 'Atajo: Cmd o Ctrl + Enter', html: icon('plus') + ' Guardar' })),
      h('div', { class: 'ref-filtros' },
        h('input', { type: 'search', placeholder: 'Buscar en títulos, notas y links', 'aria-label': 'Buscar referencias', value: S.rq, oninput: (e) => { S.rq = e.target.value; render(true); } }),
        h('div', { class: 'filters', role: 'group', 'aria-label': 'Filtrar por estado' }, [['todas', 'Todas'], ...REF_ESTADOS].map(([id, n]) =>
          h('button', { class: 'f' + (S.rEstado === id ? ' on' : ''), 'aria-pressed': S.rEstado === id, onclick: () => { S.rEstado = id; render(); } }, n))),
        h('div', { class: 'filters', role: 'group', 'aria-label': 'Filtrar por lo que robas' }, ROBAR.map((x) =>
          h('button', { class: 'f' + (S.rRobar === x ? ' on' : ''), 'aria-pressed': S.rRobar === x, onclick: () => { S.rRobar = S.rRobar === x ? '' : x; render(); } }, x)))),
      nodos);
  }

  // ---------- Render ----------
  function render(soloLista) {
    const y = window.scrollY;
    const pestana = (id, n) => h('button', { role: 'tab', class: 'f' + (S.vista === id ? ' on' : ''), 'aria-selected': String(S.vista === id), onclick: () => { S.vista = id; render(); } }, n);
    root.replaceChildren(
      h('div', { class: 'page-head' }, h('h1', {}, 'Guiones')),
      h('div', { class: 'filters vistas', role: 'tablist', 'aria-label': 'Secciones' }, pestana('guiones', `Temas y guiones (${S.temas.length})`), pestana('referencias', `Referencias (${S.refs.length})`)),
      ...(S.vista === 'referencias' ? [referencias()] : [semana(), h('div', { class: 'cols' }, lista(), detalle())].filter(Boolean)));
    if (soloLista) { const i = root.querySelector('input[type=search]'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
    else window.scrollTo(0, y);
  }

  await cargar();
  render();
  window.estudioEntrada && window.estudioEntrada(root);
}
