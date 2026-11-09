// Línea de tiempo con pistas: textos, elementos, voz (onda + palabras), cámara y sonido.
// Lee y edita los campos que ya existen en el plan (events, zooms, lentos, cortes.borradas). Todo en segundos del video original.
const R2 = (n) => Math.round(n * 100) / 100;
const mmss = (t, c) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}${c ? '.' + String(Math.floor((t % 1) * 100)).padStart(2, '0') : ''}`;
const PISTAS = [['textos', 'Textos', 22, 32], ['elem', 'Elementos', 56, 32], ['voz', 'Voz', 90, 56], ['cam', 'Cámara', 148, 32], ['fil', 'Filtros', 182, 32], ['son', 'Sonido', 216, 32]];
const ALTO = 250, MIN_PXS = 1, MAX_PXS = 400, MIN_DUR = 0.2;

// Pega t al punto más cercano (lista ordenada) si está a menos de tol segundos; si no, devuelve t.
export function imanar(t, puntos, tol) {
  if (!puntos.length) return t;
  let lo = 0, hi = puntos.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (puntos[m] < t) lo = m + 1; else hi = m; }
  let mejor = puntos[lo];
  if (lo > 0 && Math.abs(puntos[lo - 1] - t) < Math.abs(mejor - t)) mejor = puntos[lo - 1];
  return Math.abs(mejor - t) <= tol ? mejor : t;
}
// node -e "import('./timeline.js').then(m=>{console.assert(m.imanar(1.02,[0,1,2],0.05)===1);console.assert(m.imanar(1.5,[0,1,2],0.05)===1.5);console.assert(m.imanar(3,[],1)===3)})"

export function crearTimeline({ h, barraExtra = null, getFiltros = () => [], getPlan, getWords, getEnv, getVideo, kinds = {}, unirR, irPaso, onCambio, onSeleccion = () => {}, onIr }) {
  let pxs = 40, ajustar = true, sel = null, rango = null, iman = true, abierto = true, raf = 0, destruido = false, guia = null;
  try { abierto = localStorage.getItem('estudio.timeline') !== '0'; } catch { /* sin memoria */ }
  const dur = () => getPlan().duration || 1;

  // ---------- estructura ----------
  const info = h('span', { class: 'lt-t' }, '0:00.00 / 0:00.00');
  const accion = h('span', { class: 'lt-acc' });
  const btn = (txt, tit, fn, cls = '') => h('button', { type: 'button', class: 'btn ghost sm ' + cls, title: tit, 'aria-label': tit, onclick: fn }, txt);
  const bImn = btn('Imán', 'Pegar a palabras y bordes (tecla S)', () => { iman = !iman; bImn.classList.toggle('on', iman); bImn.setAttribute('aria-pressed', String(iman)); }, 'on');
  bImn.setAttribute('aria-pressed', 'true');
  const bAbrir = btn('', 'Mostrar u ocultar la línea de tiempo', () => { abierto = !abierto; try { localStorage.setItem('estudio.timeline', abierto ? '1' : '0'); } catch { /* sin memoria */ } el.classList.toggle('abierto', abierto); pintar(); }, 'lt-abrir');
  const barra = h('div', { class: 'lt-barra' }, bAbrir, btn('−', 'Alejar', () => zoom(0.7)), btn('+', 'Acercar', () => zoom(1.4)), btn('Ajustar', 'Ver todo el video', () => { ajustar = true; pintar(); }), bImn, barraExtra, accion, info);
  const etiquetas = h('div', { class: 'lt-etq' }, PISTAS.map(([, n, y, a]) => h('span', { style: `top:${y}px;height:${a}px` }, n)));
  const inner = h('div', { class: 'lt-inner' });
  const scroll = h('div', { class: 'lt-scroll' }, inner);
  const cv = h('canvas', { class: 'lt-onda', 'aria-hidden': 'true' });
  const el = h('div', { class: 'lt abierto', tabindex: '0', role: 'application', 'aria-label': 'Línea de tiempo. Flechas mueven el bloque elegido, Supr lo borra, S activa el imán.' },
    barra, h('div', { class: 'lt-cuerpo' }, etiquetas, scroll));
  el.classList.toggle('abierto', abierto);

  const xDe = (t) => t * pxs;
  // El Estudio escala la interfaz con zoom: el mouse viene en píxeles de pantalla y pxs en píxeles de diseño.
  const zk = () => inner.getBoundingClientRect().width / (inner.offsetWidth || 1) || 1;
  const tDe = (clientX) => Math.max(0, Math.min(dur(), (clientX - inner.getBoundingClientRect().left) / zk() / pxs));
  function zoom(f, cx) {
    ajustar = false;
    const w = scroll.clientWidth, c = cx == null ? scroll.scrollLeft + w / 2 : cx, t = c / pxs;
    pxs = Math.max(MIN_PXS, Math.min(MAX_PXS, pxs * f));
    pintar(); scroll.scrollLeft = t * pxs - (cx == null ? w / 2 : cx - scroll.scrollLeft);
  }

  // ---------- dibujo ----------
  function puntosIman(excluir) {
    const P = getPlan(), v = getVideo(), p = [v ? v.currentTime : 0];
    for (const w of getWords() || []) p.push(w.start, w.end);
    for (const e of P.events || []) if (e !== excluir) p.push(e.start, e.end);
    for (const l of P.lentos || []) if (l !== excluir) p.push(l.start, l.end);
    for (const f of P.filtros || []) if (f !== excluir && f.start != null) p.push(f.start, f.end);
    for (const z of P.zooms || []) if (z !== excluir) p.push(z.t);
    const c = P.cortes || {};
    for (const [a, b] of (c.on ? c.rangos || [] : []).concat(c.borradas || [])) p.push(a, b);
    return p.sort((a, b) => a - b);
  }
  function bloque(cls, a, b, y, alto, txt, ref, tipo, aria) {
    const esSel = sel && sel.ref === ref;
    const d = h('div', { class: `lt-b ${cls}${esSel ? ' sel' : ''}`, role: 'button', tabindex: '-1', 'aria-label': aria, title: aria, style: `left:${xDe(a)}px;width:${Math.max(3, xDe(b - a))}px;top:${y}px;height:${alto}px` }, txt);
    d._ref = ref; d._tipo = tipo; return d;
  }
  function pintar() {
    if (destruido) return;
    const P = getPlan(); if (!P) return;
    const d = dur(), w = scroll.clientWidth;
    if (!abierto || !w) { if (abierto && !w) requestAnimationFrame(pintar); return; }
    if (ajustar) pxs = Math.max(MIN_PXS, Math.min(MAX_PXS, w / d));
    inner.style.width = `${xDe(d)}px`; inner.style.height = `${ALTO}px`; etiquetas.style.height = `${ALTO}px`;
    const kids = [];
    const paso = pxs >= 60 ? 1 : pxs >= 15 ? 5 : pxs >= 6 ? 10 : 30;
    for (let t = 0; t <= d; t += paso) kids.push(h('i', { class: 'lt-marca', style: `left:${xDe(t)}px` }, h('span', {}, mmss(t))));
    PISTAS.forEach(([, , y, a]) => kids.push(h('div', { class: 'lt-fila', style: `top:${y}px;height:${a}px` })));
    const nm = (e) => (e.text || '').replace(/\*/g, '');
    const seg = (a, b) => `de ${R2(a).toString().replace('.', ',')} a ${R2(b).toString().replace('.', ',')} segundos`;
    for (const e of P.events || []) {
      if (!e.kind || e.kind === 'frase') kids.push(bloque('lt-tit', e.start, e.end, 22, 32, nm(e), e, 'evento', `Título ${nm(e)}, ${seg(e.start, e.end)}`));
      else { const n = e.kind === 'clip' ? `B-roll ${e.archivo || ''}` : (kinds[e.kind] && kinds[e.kind].n) || e.kind; kids.push(bloque(e.kind === 'clip' ? 'lt-esp lt-clip' : 'lt-esp', e.start, e.end, 56, 32, n, e, 'evento', `${n}, ${seg(e.start, e.end)}`)); }
      if (e.sfx && e.sfx !== 'none') kids.push(h('i', { class: 'lt-nota', title: `Sonido ${e.sfx}`, style: `left:${xDe(e.start) - 5}px;top:224px` }, '♪'));
    }
    const m = P.audio && P.audio.musica;
    if (m && m.archivo) kids.push(h('i', { class: 'lt-musica', title: 'Música de fondo', style: `left:0;width:${xDe(d)}px;top:238px` }, 'música'));
    for (const e of P.events || []) for (const k of e.kf || []) kids.push(h('i', { class: 'lt-kf', title: `Fotograma clave en ${R2(k.t).toString().replace('.', ',')} s`, style: `left:${xDe(e.start + k.t) - 5}px;top:${!e.kind || e.kind === 'frase' ? 22 : 56}px` }, '◆'));
    for (const l of P.lentos || []) kids.push(bloque('lt-lento', l.start, l.end, 148, 32, 'lenta', l, 'lento', `Cámara lenta ${seg(l.start, l.end)}`));
    for (const f of P.filtros || []) if (f.start != null) { const n = (getFiltros().find((x) => x.id === f.filtro) || {}).n || f.filtro; kids.push(bloque('lt-fil', f.start, f.end, 182, 32, n, f, 'filtro', `Filtro ${n}, ${seg(f.start, f.end)}`)); }
    for (const z of P.zooms || []) kids.push(bloque('lt-zoom', z.t, z.t, 152, 24, '', z, 'zoom', `Zoom en el segundo ${R2(z.t)}`));
    const c = P.cortes || {};
    if (c.on) for (const r of c.rangos || []) kids.push(h('div', { class: 'lt-corte auto' + (sel && sel.ref === r ? ' sel' : ''), title: 'Pausa que se corta sola', style: `left:${xDe(r[0])}px;width:${Math.max(2, xDe(r[1] - r[0]))}px` }));
    for (const r of c.borradas || []) kids.push(h('div', { class: 'lt-corte' + (sel && sel.ref === r ? ' sel' : ''), title: 'Quitado con el texto', style: `left:${xDe(r[0])}px;width:${Math.max(2, xDe(r[1] - r[0]))}px` }));
    cv.style.top = '90px';
    kids.push(cv);
    if (hoyPalabras()) for (const wd of getWords() || []) if (wd.end >= scroll.scrollLeft / pxs - 1 && wd.start <= (scroll.scrollLeft + w) / pxs + 1) kids.push(h('span', { class: 'lt-pal', style: `left:${xDe(wd.start)}px;width:${Math.max(8, xDe(wd.end - wd.start))}px` }, wd.word || wd.text || wd.w || ''));
    if (rango) kids.push(h('div', { class: 'lt-rango', style: `left:${xDe(rango[0])}px;width:${xDe(rango[1] - rango[0])}px` }));
    if (guia != null) kids.push(h('i', { class: 'lt-guia', style: `left:${xDe(guia)}px` }));
    kids.push(h('b', { class: 'lt-cabeza' }));
    inner.replaceChildren(...kids);
    pintarOnda(); pintarAccion(); cabeza(true);
  }
  const hoyPalabras = () => pxs >= 80;
  function pintarOnda() {
    const env = getEnv(), w = scroll.clientWidth, dpr = window.devicePixelRatio || 1, ah = 56;
    cv.width = w * dpr; cv.height = ah * dpr; cv.style.width = `${w}px`; cv.style.height = `${ah}px`; cv.style.left = `${scroll.scrollLeft}px`;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, ah);
    if (!env || !env.db) return;
    g.fillStyle = getComputedStyle(el).getPropertyValue('--ink-muted').trim() || '#888';
    const hop = env.hop || 0.01, mx = Math.min(w, Math.ceil(xDe(dur()) - scroll.scrollLeft));
    for (let x = 0; x < mx; x++) {
      const i0 = Math.floor(((scroll.scrollLeft + x) / pxs) / hop), i1 = Math.max(i0 + 1, Math.floor(((scroll.scrollLeft + x + 1) / pxs) / hop));
      let db = -60; for (let i = i0; i < i1 && i < env.db.length; i++) if (env.db[i] > db) db = env.db[i];
      const alto = Math.max(0, Math.min(1, (db + 60) / 60)) * ah;
      if (alto > 0.5) g.fillRect(x, (ah - alto) / 2, 1, alto);
    }
  }
  function pintarAccion() {
    const c = getPlan().cortes || {}, k = [];
    if (rango) k.push(btn('Quitar este tramo', 'Quitar este tramo del video (Supr)', quitarRango, 'gold'));
    else if (sel && sel.tipo === 'borrada') k.push(btn('Restaurar', 'Volver a poner este tramo', restaurar, 'gold'));
    else if (sel && sel.tipo === 'pausa') k.push(h('span', { class: 'lt-nota-t' }, 'Es una pausa que se corta sola. '), btn('Ajustar en Recortar', 'Ir al paso Recortar', () => irPaso('recorte')));
    else if (sel) k.push(h('span', { class: 'lt-nota-t' }, 'Supr lo borra · flechas lo mueven'));
    void c; accion.replaceChildren(...k);
  }
  let tArrastre = null;  // mientras arrastras, la cabeza sigue al mouse y no espera a que el video termine de saltar
  function cabeza(forzar) {
    const v = getVideo(), t = tArrastre != null ? tArrastre : v ? v.currentTime || 0 : 0, ph = inner.querySelector('.lt-cabeza');
    if (ph) ph.style.transform = `translateX(${xDe(t)}px)`;
    info.textContent = `${mmss(t, 1)} / ${mmss(dur(), 1)}`;
    if (v && !v.paused && !forzar) { const x = xDe(t); if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 20) scroll.scrollLeft = Math.max(0, x - 40); }
  }
  function bucle() { if (destruido || !el.isConnected) { if (!destruido) raf = requestAnimationFrame(bucle); return; } cabeza(); raf = requestAnimationFrame(bucle); }
  raf = requestAnimationFrame(bucle);
  let pend = 0;
  scroll.addEventListener('scroll', () => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; pintarOnda(); if (hoyPalabras()) pintar(); }); });
  // Pellizco del trackpad: llegan ~60 eventos por segundo. Se juntan en uno por cuadro y el factor sigue lo que mueves los dedos.
  let fz = 1, cxz = 0, rafZ = 0;
  scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault();
    fz *= Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.004)); cxz = (e.clientX - scroll.getBoundingClientRect().left) / zk() + scroll.scrollLeft;
    if (!rafZ) rafZ = requestAnimationFrame(() => { rafZ = 0; const f = fz; fz = 1; if (Math.abs(f - 1) > 0.002) zoom(f, cxz); });
  }, { passive: false });
  const ro = new ResizeObserver(() => { if (ajustar) pintar(); });
  ro.observe(scroll);

  // ---------- acciones sobre el plan ----------
  function elegir(s) { sel = s; rango = s && s.tipo === 'rango' ? rango : (s ? null : rango); if (s && s.tipo !== 'rango') rango = null; onSeleccion(s); pintar(); }
  function quitarRango() {
    if (!rango) return; const c = getPlan().cortes = getPlan().cortes || {};
    c.borradas = unirR([...(c.borradas || []), [R2(rango[0]), R2(rango[1])]]); rango = null; sel = null; onCambio();
  }
  function restaurar() { const c = getPlan().cortes; if (!c || !sel || sel.tipo !== 'borrada') return; c.borradas.splice(c.borradas.indexOf(sel.ref), 1); sel = null; onCambio(); }
  function borrarSel() {
    const P = getPlan(); if (rango) return quitarRango();
    if (!sel) return; if (sel.tipo === 'borrada') return restaurar();
    const lista = { evento: P.events, zoom: P.zooms, lento: P.lentos, filtro: P.filtros }[sel.tipo]; if (!lista) return;
    lista.splice(lista.indexOf(sel.ref), 1); sel = null; onCambio();
  }
  function aplicar(ref, tipo, a, b) {
    const d = dur();
    if (tipo === 'zoom') { ref.t = R2(Math.max(0, Math.min(d, a))); return; }
    a = Math.max(0, Math.min(d - MIN_DUR, a)); b = Math.max(a + MIN_DUR, Math.min(d, b));
    ref.start = R2(a); ref.end = R2(b);
  }

  // ---------- ratón ----------
  const tooltip = h('div', { class: 'lt-tip', hidden: true });
  el.append(tooltip);
  function arrastrarBloque(e, nodo) {
    const ref = nodo._ref, tipo = nodo._tipo, esZ = tipo === 'zoom';
    const a0 = esZ ? ref.t : ref.start, b0 = esZ ? ref.t : ref.end, x0 = e.clientX, r = nodo.getBoundingClientRect();
    const borde = Math.min(6, r.width / 3), modo = esZ ? 'mover' : e.clientX - r.left < borde ? 'ini' : r.right - e.clientX < borde ? 'fin' : 'mover';
    const pts = iman ? puntosIman(ref) : [], tol = 8 / pxs;
    let a = a0, b = b0, movido = false;
    elegir({ tipo, ref });
    const nodo2 = inner.querySelector('.lt-b.sel') || nodo;
    nodo2.setPointerCapture?.(e.pointerId);
    const mover = (ev) => {
      if (!movido && Math.abs(ev.clientX - x0) < 3) return; movido = true;
      const dt = (ev.clientX - x0) / zk() / pxs, libre = ev.altKey || !iman;
      let na = a0, nb = b0, pegado = null;
      if (modo === 'mover') {
        na = a0 + dt; nb = b0 + dt;
        if (!libre) { const sa = imanar(na, pts, tol), sb = imanar(nb, pts, tol); if (sa !== na && (sb === nb || Math.abs(sa - na) <= Math.abs(sb - nb))) { nb += sa - na; na = sa; pegado = sa; } else if (sb !== nb) { na += sb - nb; nb = sb; pegado = sb; } }
        const len = b0 - a0; if (na < 0) { na = 0; nb = len; } if (nb > dur()) { nb = dur(); na = nb - len; }
      } else if (modo === 'ini') { na = a0 + dt; if (!libre) { const s = imanar(na, pts, tol); if (s !== na) { na = s; pegado = s; } } na = Math.min(na, b0 - MIN_DUR); }
      else { nb = b0 + dt; if (!libre) { const s = imanar(nb, pts, tol); if (s !== nb) { nb = s; pegado = s; } } nb = Math.max(nb, a0 + MIN_DUR); }
      a = na; b = nb;
      nodo2.style.left = `${xDe(a)}px`; nodo2.style.width = `${Math.max(3, xDe(b - a))}px`;
      inner.querySelector('.lt-guia')?.remove();
      if (pegado != null) inner.append(h('i', { class: 'lt-guia', style: `left:${xDe(pegado)}px` }));
      tooltip.hidden = false; tooltip.textContent = esZ ? mmss(a, 1) : `${mmss(a, 1)} → ${mmss(b, 1)}`;
      const er = el.getBoundingClientRect(); tooltip.style.left = `${(ev.clientX - er.left) / zk() + 10}px`; tooltip.style.top = `${(ev.clientY - er.top) / zk() - 28}px`;
    };
    const fin = () => {
      removeEventListener('pointermove', mover); removeEventListener('pointerup', fin); tooltip.hidden = true;
      if (movido) { aplicar(ref, tipo, a, b); onCambio(); } else onIr(esZ ? ref.t : ref.start);
    };
    addEventListener('pointermove', mover); addEventListener('pointerup', fin);
  }
  function arrastrarRegla(e) {
    const mover = (ev) => { tArrastre = tDe(ev.clientX); onIr(tArrastre); cabeza(true); }; mover(e);
    const fin = () => { tArrastre = null; removeEventListener('pointermove', mover); removeEventListener('pointerup', fin); };
    addEventListener('pointermove', mover); addEventListener('pointerup', fin);
  }
  function arrastrarVoz(e) {
    const pts = iman ? puntosIman(null) : [], tol = 8 / pxs, t0 = tDe(e.clientX), x0 = e.clientX;
    const c = getPlan().cortes || {}, hit = (c.borradas || []).find(([a, b]) => t0 >= a && t0 <= b) || (c.on ? (c.rangos || []).find(([a, b]) => t0 >= a && t0 <= b) : null);
    let movido = false;
    const mover = (ev) => {
      if (!movido && Math.abs(ev.clientX - x0) < 4) return; movido = true;
      const sn = (t) => (ev.altKey ? t : imanar(t, pts, tol)), t1 = tDe(ev.clientX);
      rango = [Math.min(sn(t0), sn(t1)), Math.max(sn(t0), sn(t1))]; sel = null; pintar();
    };
    const fin = () => {
      removeEventListener('pointermove', mover); removeEventListener('pointerup', fin);
      if (movido) { if (rango[1] - rango[0] < 0.05) rango = null; pintar(); return; }
      rango = null;
      if (hit) elegir({ tipo: (c.borradas || []).includes(hit) ? 'borrada' : 'pausa', ref: hit }); else { sel = null; pintar(); }
      onIr(t0);
    };
    addEventListener('pointermove', mover); addEventListener('pointerup', fin);
  }
  inner.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; el.focus({ preventScroll: true });
    const nodo = e.target.closest('.lt-b');
    if (nodo) { e.preventDefault(); return arrastrarBloque(e, nodo); }
    const y = e.clientY - inner.getBoundingClientRect().top;
    if (y < 22) { rango = null; sel = null; pintar(); return arrastrarRegla(e); }
    if (y >= 90 && y < 146) return arrastrarVoz(e);
    rango = null; sel = null; pintar(); onIr(tDe(e.clientX));
  });

  // ---------- teclado (solo con el foco en la línea de tiempo) ----------
  el.addEventListener('keydown', (e) => {
    const k = e.key, P = getPlan();
    if (k === 'Escape') { sel = null; rango = null; pintar(); }
    else if (k === 'Delete' || k === 'Backspace') borrarSel();
    else if (k === 's' || k === 'S') bImn.click();
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && sel && ['evento', 'zoom', 'lento', 'filtro'].includes(sel.tipo)) {
      const dt = (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1) / (P.fps || 30), r = sel.ref;
      if (sel.tipo === 'zoom') aplicar(r, 'zoom', r.t + dt, r.t); else aplicar(r, sel.tipo, r.start + dt, r.end + dt);
      onCambio();
    } else return;
    e.preventDefault(); e.stopPropagation();
  });

  setTimeout(pintar, 0);
  return { el, pintar, destroy: () => { destruido = true; cancelAnimationFrame(raf); ro.disconnect(); } };
}
