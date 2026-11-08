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
  const S = { clases: [], temas: [], guiones: [], formatos: [], refs: [], vista: 'guiones', rq: '', rEstado: 'todas', rRobar: '', sel: null, formato: 'talking-head', filtro: 'todos', q: '', borrador: '' };

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

  // ---------- Esta semana ----------
  function semana() {
    const en = S.temas.filter((t) => t.semana);
    const hechos = en.filter((t) => ['grabado', 'publicado'].includes(t.estado)).length;
    const pct = en.length ? Math.round((hechos / en.length) * 100) : 0;
    return h('section', { class: 'week', 'aria-label': 'Esta semana' },
      h('div', { class: 'week-top' },
        h('h2', {}, 'Esta semana'),
        h('span', { class: 'week-count' }, en.length ? `${hechos} de ${en.length} grabados` : 'Elige hasta 3 temas con la estrella')),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'week-list' }, en.map((t) =>
        h('button', { class: 'chip' + (t.id === S.sel ? ' on' : ''), onclick: () => { S.sel = t.id; render(); } },
          h('span', { class: 'dot ' + t.estado }), t.titulo))));
  }

  // ---------- Lista de temas ----------
  function lista() {
    const filtrados = S.temas.filter((t) =>
      (S.filtro === 'todos' || t.estado === S.filtro) && t.titulo.toLowerCase().includes(S.q.toLowerCase()));
    const nuevo = h('input', { type: 'text', placeholder: 'Escribe un tema nuevo', 'aria-label': 'Nuevo tema' });
    const agregar = async () => {
      const titulo = nuevo.value.trim(); if (!titulo) return;
      const t = await api('/guiones/temas', { method: 'POST', body: { titulo } });
      await cargar(); S.sel = t.id; render();
    };
    nuevo.addEventListener('keydown', (e) => e.key === 'Enter' && agregar());
    return h('aside', { class: 'col-list' },
      h('div', { class: 'add' }, nuevo, h('button', { class: 'btn gold', onclick: agregar, 'aria-label': 'Agregar tema', html: icon('plus') })),
      h('button', { class: 'btn ghost wide', onclick: abrirClases, html: icon('folder') + ' Traer temas de mis clases' }),
      h('input', { type: 'search', placeholder: 'Buscar', 'aria-label': 'Buscar temas', value: S.q, oninput: (e) => { S.q = e.target.value; render(true); } }),
      h('div', { class: 'filters', role: 'group', 'aria-label': 'Filtrar por estado' },
        [['todos', 'Todos'], ...ESTADOS].map(([id, n]) =>
          h('button', { class: 'f' + (S.filtro === id ? ' on' : ''), 'aria-pressed': S.filtro === id, onclick: () => { S.filtro = id; render(); } }, n))),
      h('ul', { class: 'temas' }, filtrados.length ? filtrados.map((t) =>
        h('li', {}, h('button', { class: 'tema' + (t.id === S.sel ? ' on' : ''), onclick: () => { S.sel = t.id; S.borrador = ''; render(); } },
          h('span', { class: 'tema-t' }, t.semana ? h('span', { class: 'star', html: icon('star', 14) }) : null, t.titulo),
          h('span', { class: 'tema-m' },
            h('span', { class: 'tag ' + t.estado }, etiqueta(t.estado)),
            S.formatos.filter((f) => guionDe(t.id, f.id)).map((f) => h('span', { class: 'mini' }, f.nombre)))))
      ) : h('li', { class: 'vacio' }, 'Sin temas aquí todavía.')));
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
    if (!t) return h('section', { class: 'col-main empty' },
      h('h2', {}, 'Elige un tema para empezar'),
      h('p', {}, 'Cada tema se convierte en un guion en el formato que prefieras. Si no tienes ideas, trae las preguntas de tus clases.'),
      h('button', { class: 'btn gold', onclick: abrirClases, html: icon('folder') + ' Traer temas de mis clases' }));

    const clase = S.clases.find((c) => c.id === t.claseId);
    const f = S.formatos.find((x) => x.id === S.formato);
    const g = guionDe(t.id, S.formato);
    if (S.borrador === '' && g) S.borrador = g.texto;
    const area = h('textarea', { rows: 12, placeholder: 'Pega aquí el guion que te devolvió Claude', 'aria-label': 'Guion', oninput: (e) => (S.borrador = e.target.value) });
    area.value = S.borrador;
    const tiempo = h('small', { class: 'lectura', 'aria-live': 'polite' });
    const pintarTiempo = () => {
      const { palabras, seg } = minutosLectura(area.value);
      tiempo.textContent = palabras ? `${palabras} palabras · se lee en ${seg} s a ritmo normal${seg > 60 ? ' (más de un minuto)' : ''}` : 'Escribe o pega el guion y te digo cuánto dura.';
    };
    const base = g ? g.texto : '';
    const sin = h('span', { class: 'sin-guardar', hidden: true }, 'Sin guardar');
    const marcar = () => { sin.hidden = area.value.trim() === base.trim(); };
    const guardar = async () => {
      if (!S.borrador.trim()) return toast('Pega un guion primero.');
      await api('/guiones/guiones', { method: 'POST', body: { id: g?.id, temaId: t.id, formato: S.formato, texto: S.borrador.trim() } });
      if (t.estado === 'idea') await api('/guiones/temas', { method: 'POST', body: { id: t.id, estado: 'guion' } });
      await cargar(); render(); toast('Guion guardado.');
    };
    area.addEventListener('input', () => { pintarTiempo(); marcar(); });
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guardar(); } });
    pintarTiempo();
    const plantillas = h('div', { class: 'plantillas' }, h('small', {}, 'Estructura de partida:'),
      PLANTILLAS.map(([n, tx]) => h('button', { type: 'button', class: 'f', title: 'Inserta el esqueleto con gancho, desarrollo y cierre', onclick: () => {
        if (area.value.trim() && area.dataset.plantilla !== n) { area.dataset.plantilla = n; toast('Ya hay texto. Pulsa otra vez para reemplazarlo.'); setTimeout(() => delete area.dataset.plantilla, 4000); return; }
        area.value = tx; S.borrador = tx; delete area.dataset.plantilla; pintarTiempo(); marcar(); area.focus();
      } }, n)));

    return h('section', { class: 'col-main' },
      h('div', { class: 'row-between' },
        tituloEl(t),
        h('button', { class: 'btn ghost' + (t.semana ? ' on' : ''), 'aria-pressed': !!t.semana, onclick: () => {
          const ya = S.temas.filter((x) => x.semana && x.id !== t.id).length;
          if (!t.semana && ya >= 3) return toast('Ya tienes 3 temas esta semana. Quita uno primero.');
          guardarTema({ semana: !t.semana });
        }, html: icon('star') + (t.semana ? ' En esta semana' : ' Agregar a esta semana') })),
      h('p', { class: 'sub' }, clase ? `De la clase: ${clase.titulo}` : 'Sin clase asociada'),
      h('label', { class: 'field' }, 'Ángulo (opcional)',
        h('input', { value: t.angulo || '', placeholder: 'Ej: dirigido a fotógrafos de bodas', onchange: (e) => guardarTema({ angulo: e.target.value }) })),
      h('label', { class: 'field' }, 'Notas e ideas (opcional)',
        h('textarea', { rows: 3, placeholder: 'Apuntes sueltos, frases que te gustaron, ejemplos, datos. Se incluyen en el prompt.', onchange: (e) => guardarTema({ notas: e.target.value }) }, t.notas || '')),
      refsDelTema(t),

      h('div', { class: 'formats', role: 'tablist', 'aria-label': 'Formato' }, S.formatos.map((x) =>
        h('button', { role: 'tab', class: 'format' + (x.id === S.formato ? ' on' : ''), 'aria-selected': x.id === S.formato,
          onclick: () => { S.formato = x.id; S.borrador = ''; render(); } },
          h('strong', {}, x.nombre), h('small', {}, x.resumen), guionDe(t.id, x.id) ? h('span', { class: 'ok', html: icon('check', 14) + ' Listo' }) : null))),

      h('div', { class: 'step' },
        h('div', { class: 'step-n' }, '1'),
        h('div', {}, h('h3', {}, `Pide el guion de ${f.nombre}`),
          h('p', {}, `${f.duracion}. Copia el prompt y pégalo en un chat de Claude con tus skills.`),
          h('button', { class: 'btn gold', onclick: async () => {
            const r = await api('/guiones/prompt', { method: 'POST', body: { temaId: t.id, formato: S.formato } });
            copiar(r.prompt, 'Prompt copiado. Pégalo en Claude.');
          }, html: icon('copy') + ' Copiar prompt' }))),

      h('div', { class: 'step' },
        h('div', { class: 'step-n' }, '2'),
        h('div', { class: 'grow' }, h('h3', {}, 'Guarda el guion final'),
          h('p', {}, 'Las palabras entre *asteriscos* saldrán grandes en pantalla. Lo que va entre [corchetes] son indicaciones de edición.'),
          plantillas, area, tiempo,
          h('div', { class: 'actions' },
            h('button', { class: 'btn gold', title: 'Atajo: Cmd o Ctrl + Enter', onclick: guardar, html: icon('check') + ' Guardar guion' }), sin,
            g ? h('button', { class: 'btn ghost', onclick: () => copiar(g.texto, 'Guion copiado.'), html: icon('copy') + ' Copiar' }) : null,
            g ? doble(h, { clase: 'btn ghost', icono: icon('trash'), texto: 'Borrar guion', aviso: '¿Seguro? Pulsa otra vez', accion: async () => { await api('/guiones/guiones/' + g.id, { method: 'DELETE' }); S.borrador = ''; await cargar(); render(); } }) : null))),

      g ? h('div', { class: 'step' },
        h('div', { class: 'step-n' }, '3'),
        h('div', {}, h('h3', {}, 'Grábalo'),
          h('p', {}, S.formato === 'talking-head' ? 'Modo grabación: texto grande que se desplaza solo. Al subir el video, en Talking Head abre el paso Texto y elige este guion para corregir la transcripción.' : 'Modo grabación: texto grande que se desplaza solo, para leer mirando a cámara.'),
          h('button', { class: 'btn dark', onclick: () => teleprompter(g.texto), html: icon('play') + ' Abrir modo grabación' }))) : null,

      h('div', { class: 'row-between foot' },
        h('label', { class: 'field inline' }, 'Estado',
          h('select', { onchange: (e) => guardarTema({ estado: e.target.value }) }, ESTADOS.map(([id, n]) => h('option', { value: id, selected: t.estado === id }, n)))),
        doble(h, { clase: 'btn danger', icono: icon('trash'), texto: 'Borrar tema', aviso: '¿Seguro? Pulsa otra vez', accion: async () => {
          await api('/guiones/temas/' + t.id, { method: 'DELETE' }); S.sel = null; S.borrador = ''; await cargar(); render();
        } })));
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
      h('div', { class: 'page-head' }, h('h1', {}, 'Guiones'), h('p', {}, 'De una idea o de una clase a un guion listo para grabar.')),
      h('div', { class: 'filters vistas', role: 'tablist', 'aria-label': 'Secciones' }, pestana('guiones', `Temas y guiones (${S.temas.length})`), pestana('referencias', `Referencias (${S.refs.length})`)),
      ...(S.vista === 'referencias' ? [referencias()] : [semana(), h('div', { class: 'cols' }, lista(), detalle())]));
    if (soloLista) { const i = root.querySelector('input[type=search]'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
    else window.scrollTo(0, y);
  }

  await cargar();
  render();
  window.estudioEntrada && window.estudioEntrada(root);
}
