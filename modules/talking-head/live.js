// Vista en vivo: dibuja el video con títulos, subtítulos, zooms, looks y cortes en el navegador, al momento de cambiar un ajuste.
// Es una copia fiel del motor de render (mismas proporciones, mismas animaciones). La vista previa generada sigue siendo la versión exacta.

const SIZE_FRAC = { S: 0.40, M: 0.60, L: 0.78, XL: 0.92 };
const SUB_SIZE = { S: 0.030, M: 0.038, L: 0.047, XL: 0.058 };
const POS_Y = { detras: 0.19, arriba: 0.17, centro: 0.53, abajo: 0.62 };
const DETRAS = ['detras', 'arriba'];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = (u) => 1 - (1 - u) ** 3;
const easeInOut = (u) => u * u * (3 - 2 * u);
const easeBack = (u) => { const c = 2.2; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
const ZOOM_ESTILO = { suave: [0.5, easeInOut], normal: [0.22, easeOut], punch: [0.14, easeBack] };

const STOP = new Set('a al algo algun alguna algunas alguno algunos ante antes asi aun aunque bien cada casi como con contra cual cuando cuanto de del desde donde dos el ella ellas ellos en entre era eres es esa ese eso esos esta estas este esto estos fue ha han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otro para pero poco por porque que quien se ser si sin sobre su sus tambien te tengo tiene todo todos tu tus un una uno unos y ya yo'.split(' '));
const CLAVES = new Set('marketing ventas vender venderse negocio negocios cliente clientes dinero ingresos curso cursos fotografia fotografo fotografos informacion resultados marca contenido redes precio cobrar comunidad estrategia audiencia seguidores talento pasion'.split(' '));
const limpia = (w) => w.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ%$]/g, '');
const norm = (w) => limpia(w).toLowerCase().replace(/[áéíóú]/g, (c) => 'aeiou'['áéíóú'.indexOf(c)]);
const VERBAL = ['aba', 'aron', 'ieron', 'ando', 'iendo', 'ara', 'ase', 'emos', 'amos', 'ian', 'ia', 'an', 'en', 'ar', 'er', 'ir'];
function puntaje(w) {
  const n = norm(w);
  if (!n || STOP.has(n)) return 0;
  let s = n.length;
  if (CLAVES.has(n)) s += 5;
  else if (VERBAL.some((v) => n.endsWith(v)) || /[óé]$/.test(w)) s -= 3;
  if (n.endsWith('mente')) s -= 3;
  if (/\d/.test(n)) s += 6;
  if (w[0] && w[0] !== w[0].toLowerCase() && w[0] === w[0].toUpperCase()) s += 1;
  return s;
}
const nz = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');

export function casoTexto(t, caso) {
  if (caso === 'mayus') return t.toUpperCase();
  if (caso === 'minus') return t.toLowerCase();
  const low = t.toLowerCase();
  const i = low.search(/\p{L}/u);
  return i < 0 ? low : low.slice(0, i) + low[i].toUpperCase() + low.slice(i + 1);
}

function animState(ev, t) {
  const d = t - ev.start, dur = Math.max(ev.end - ev.start, 0.2), tail = ev.end - t;
  let alpha = clamp(d / 0.12) * clamp(tail / 0.15);
  let sc = 1 + 0.03 * clamp(d / dur), dx = 0, dy = 0, reveal = 1, squash = 1;
  const kind = ev.anim || 'pop';
  if (kind === 'pop' || kind === 'ruleta') { const u = clamp(d / 0.22); sc *= u < 0.55 ? 0.7 + 0.4 * easeOut(u / 0.55) : 1.1 - 0.1 * easeOut((u - 0.55) / 0.45); }
  else if (kind === 'deslizar') dy = (1 - easeOut(clamp(d / 0.3))) * 0.045;
  else if (kind === 'escribir') reveal = clamp(d / Math.min(0.4, dur * 0.5));
  else if (kind === 'fade') alpha = clamp(d / 0.3) * clamp(tail / 0.2);
  else if (kind === 'bajar') dy = -(1 - easeOut(clamp(d / 0.3))) * 0.05;
  else if (kind === 'crecer') sc *= 1.7 - 0.7 * easeOut(clamp(d / 0.28));
  else if (kind === 'rebote') { const u = clamp(d / 0.6); sc *= 1 - Math.exp(-6 * u) * Math.cos(14 * u) * 0.35; }
  else if (kind === 'elastico') { const u = clamp(d / 1.0), wob = Math.exp(-5.5 * u) * Math.cos(19 * u); squash = 1 + 0.34 * wob; sc *= 1 - 0.1 * wob; alpha = clamp(d / 0.06) * clamp(tail / 0.15); }
  else if (kind === 'tiembla') { const k = Math.max(0, 1 - d / 0.3); dx = Math.sin(d * 90) * 0.012 * k; dy = Math.cos(d * 120) * 0.01 * k; }
  sc *= 1 - 0.04 * (1 - clamp(tail / 0.15));
  return { sc, alpha, dx, dy, reveal, squash };
}

function zoomScale(zooms, t, estilo, deriva) {
  let prev = 1, cur = 1, t0 = -9;
  for (const z of zooms) { if (z.t <= t) { prev = cur; cur = z.level; t0 = z.t; } else break; }
  const [dur, curve] = ZOOM_ESTILO[estilo] || ZOOM_ESTILO.normal;
  let s = prev + (cur - prev) * curve(clamp((t - t0) / dur));
  if (deriva && cur > 1.001) s *= 1 + 0.025 * clamp((t - t0) / 4.0);
  return s;
}

export const DIM_FORMATO = { '9x16': [720, 1280], '16x9': [1280, 720], '1x1': [900, 900], '4x5': [800, 1000] };

export function crearLive({ onEdit, h, srcUrl, alphaUrl, getPlan, getWords, fam, estatico = false, sfxBase = '', sfxUserUrl = null, musicUrl = null, escenaUrl = null }) {
  // El lienzo toma la proporción del formato elegido (9:16, 16:9, 1:1 o 4:5). Si el original es distinto, se recorta, nunca se estira.
  const [W, H] = DIM_FORMATO[(getPlan() || {}).formato] || DIM_FORMATO['9x16'];
  const ZY = H > W ? 0.38 : 0.45;
  const encuadre = () => { const e = (getPlan() || {}).encuadre || {}; return [e.x ?? 0.5, e.y ?? 0.4]; };
  function areaOrigen(v) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const asp = W / H;
    if (Math.abs(vw / vh - asp) / asp < 0.02) return [0, 0, vw, vh];
    const cw = vw / vh > asp ? vh * asp : vw, ch = vw / vh > asp ? vh : vw / asp, [fx, fy] = encuadre();
    return [(vw - cw) * fx, (vh - ch) * fy, cw, ch];
  }
  const dibujarVideo = (c, v, w, hh) => { const r = areaOrigen(v); if (r) c.drawImage(v, r[0], r[1], r[2], r[3], 0, 0, w, hh); else c.drawImage(v, 0, 0, w, hh); };
  const canvas = h('canvas', { class: 'live-canvas', width: W, height: H, 'aria-label': 'Vista en vivo del video con tus ajustes' });
  const ctx = canvas.getContext('2d');
  const mk = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  const frameC = mk(W, H), layerC = mk(W, H), subjC = mk(W, H), smallC = mk(W / 6, H / 6), maskSmall = mk(W / 2, H / 2), maskC = mk(W / 2, H / 2), hiC = mk(W / 4, H / 4), glowC = mk(W / 4, H / 4), glow2C = mk(W / 4, H / 4), glow3C = mk(W / 4, H / 4), veilC = mk(W / 4, H / 4), edgeC = mk(W, H), pmC = mk(W / 4, H / 4);
  const hictx = hiC.getContext('2d'), gctx = glowC.getContext('2d'), g2ctx = glow2C.getContext('2d'), g3ctx = glow3C.getContext('2d'), vctx = veilC.getContext('2d'), ectx = edgeC.getContext('2d'), pmctx = pmC.getContext('2d');
  const fctx = frameC.getContext('2d'), lctx = layerC.getContext('2d'), sctx = subjC.getContext('2d'), smctx = smallC.getContext('2d');
  const mkctx = maskSmall.getContext('2d', { willReadFrequently: true }), mctx = maskC.getContext('2d');
  const hid = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0';
  const vs = h('video', { src: srcUrl, playsinline: true, preload: 'auto', style: hid, 'aria-hidden': 'true' });
  const va = h('video', { src: alphaUrl, playsinline: true, muted: true, preload: 'auto', style: hid, 'aria-hidden': 'true' });
  va.muted = true;
  let antes = false, raf = 0, vivo = true, ultimo = -1, tieneAlpha = true, sucio = true, tDib = -1;
  va.onerror = () => { tieneAlpha = false; };

  // ---------- texto ----------
  const fontOf = (file) => (file ? fam(file) : 'Poppins');
  function medida(items, px, tr) {
    ctx.letterSpacing = `${tr}px`;
    let w = 0;
    items.forEach((it, i) => { ctx.font = `${px}px ${it.font}, sans-serif`; w += ctx.measureText(it.t).width + (i ? ctx.measureText(' ').width + tr : 0); });
    return w;
  }
  const splitLines = (items) => { if (items.length < 3) return [items]; const mid = Math.floor(items.length / 2) + (items.length % 2); return [items.slice(0, mid), items.slice(mid)]; };
  function dibujarTexto(c, lines, cx, cy, px, st, o = {}) {
    const tr = (o.tracking ?? st.tracking) * px, lh = px * 1.12;
    c.letterSpacing = `${tr}px`; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const glow = o.glow ?? st.glow, outline = o.contorno ?? st.contorno;
    const ws = lines.map((l) => medida(l, px, tr));
    c.font = `${px}px ${lines[0][0].font}, sans-serif`;
    const capH = c.measureText('H').actualBoundingBoxAscent || px * 0.7;
    const draw = (mode) => {
      lines.forEach((line, li) => {
        const base = cy + (li - (lines.length - 1) / 2) * lh + capH / 2;
        let x = cx - ws[li] / 2;
        line.forEach((it) => {
          c.font = `${px}px ${it.font}, sans-serif`;
          const al = it.alpha ?? 1, ga0 = c.globalAlpha;
          c.globalAlpha = ga0 * al;
          if (mode === 'contorno' && al < 1) { /* una palabra apagada no lleva contorno */ }
          else if (mode === 'sombra') { if ((st.sombra ?? 1) <= 0.01) return; c.shadowColor = `rgba(0,0,0,${0.55 * (st.sombra ?? 1)})`; c.shadowBlur = px * 0.1; c.shadowOffsetY = px * 0.04; c.fillStyle = '#000'; c.fillText(it.t, x, base); }
          else if (mode === 'contorno') { c.shadowColor = 'transparent'; c.lineJoin = 'round'; c.lineWidth = px * 0.14 * outline; c.strokeStyle = '#000'; c.strokeText(it.t, x, base); }
          else if (mode === 'glow') { c.shadowColor = it.color; c.shadowBlur = px * (0.1 + 0.12 * glow); c.fillStyle = it.color; c.globalAlpha *= Math.min(1, glow * 1.2); c.fillText(it.t, x, base); c.globalAlpha /= Math.min(1, glow * 1.2) || 1; }
          else { c.shadowColor = 'transparent'; c.fillStyle = it.color; c.fillText(it.t, x, base); }
          c.globalAlpha = ga0;
          x += c.measureText(it.t).width + tr + c.measureText(' ').width + tr;
        });
      });
    };
    c.save();
    draw('sombra');
    if (outline > 0.02) draw('contorno');
    if (glow > 0.02) draw('glow');
    draw('relleno');
    c.restore();
    return { w: Math.max(...ws), h: lh * lines.length };
  }

  const colores = (st) => ({ accent: st.accent, text: st.text });
  function itemsTitulo(txt, ev, st) {
    const base = fontOf(st.font), emph = fontOf(st.emphFont || st.font), col = colores(st);
    const cBase = ev.color === 'accent' ? col.accent : col.text, cAlt = ev.color === 'accent' ? col.text : col.accent;
    return casoTexto(txt, st.titulosCaso || 'mayus').split(/\s+/).filter(Boolean).map((tk) => {
      const e = tk.length > 2 && tk.startsWith('*') && tk.endsWith('*');
      return { t: tk.replace(/\*/g, ''), font: e ? emph : base, color: e ? cAlt : cBase };
    });
  }
  // tamaño de un título: se ajusta al ancho como en el motor
  function tamTitulo(items, ev, st) {
    const lines = splitLines(items);
    const w200 = Math.max(...lines.map((l) => medida(l, 200, st.tracking * 200)));
    let px = Math.min(200 * (SIZE_FRAC[ev.size] || 0.7) * W / Math.max(w200, 1), 0.17 * H);
    if (ev.pxf) px = Math.min(ev.pxf * H, 200 * 0.9 * W / Math.max(w200, 1));
    return { lines, px: Math.max(px, 10) };
  }

  // Ruleta: tiempos en segundos; rebote y desenfoque son fracciones de una línea.
  const RULETA = { POR_PALABRA: 0.14, BASE: 0.25, REBOTE: 0.04, ASENTAR: 0.18, DESENFOQUE: 0.10 };

  // Opacidad del evento (ev.opacidad, 0-1): el código de dibujo fija globalAlpha a su manera, así que se intercepta el ajuste y se multiplica.
  function conOp(c, e, fn) {
    const o = Math.min(Math.max(Number(e.opacidad ?? 1), 0), 1);
    if (o >= 0.999) return fn();
    const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha');
    d.set.call(c, d.get.call(c) * o);
    Object.defineProperty(c, 'globalAlpha', { configurable: true, get() { return d.get.call(c) / o; }, set(v) { d.set.call(c, v * o); } });
    try { fn(); } finally { const a = d.get.call(c) / o; delete c.globalAlpha; d.set.call(c, a); }
  }
  function dibujarTitulo(c, ev, t, st) {
    const a = animState(ev, t);
    if (a.alpha <= 0.01) return;
    let txt = ev.text;
    let dy = a.dy, alpha = a.alpha;
    let ruleta = null;
    if (ev.anim === 'ruleta' && txt.includes('|')) {
      const alts = txt.split('|').map((x) => x.trim()).filter(Boolean);
      const entries = alts.map((alt) => {
        const items = itemsTitulo(alt, ev, st), size = tamTitulo(items, ev, st);
        // Incluye el margen de sombra para que cada alternativa entre completa en la ventana.
        return { ...size, slot: size.px * (size.lines.length * 1.12 + 1) };
      });
      if (!entries.length) return;
      const d = t - ev.start, gira = RULETA.POR_PALABRA * entries.length + RULETA.BASE;
      const u = clamp(d / gira), pasos = Math.max(entries.length - 1, 0);
      const progreso = pasos * easeOut(u);
      // La velocidad normalizada permite que el desenfoque no dependa del número de palabras.
      const velocidad = pasos ? (1 - u) ** 2 : 0;
      const asiento = d > gira ? clamp((d - gira) / RULETA.ASENTAR) : 0;
      const rebote = d >= gira && asiento < 1 ? -RULETA.REBOTE * Math.sin(Math.PI * asiento) : 0;
      ruleta = { entries, progreso, slot: Math.max(...entries.map((x) => x.slot)), rebote, blur: RULETA.DESENFOQUE * velocidad };
      txt = alts[alts.length - 1];
    }
    const items = itemsTitulo(txt, ev, st);
    if (!items.length) return;
    const { lines, px } = tamTitulo(items, ev, st);
    const y = ev.y != null ? ev.y : (ajustes.get(ev) ?? POS_Y[ev.pos] ?? 0.3);
    c.save();
    c.globalAlpha = alpha;
    c.translate(W * (0.5 + a.dx), H * (y + dy));
    c.scale(a.sc * a.squash, a.sc / a.squash ** 0.7);
    if (a.reveal < 1) { const wd = Math.max(...lines.map((l) => medida(l, px, st.tracking * px))); c.beginPath(); c.rect(-wd, -px * 2, wd * (2 * a.reveal), px * 4); c.clip(); }
    if (ruleta) {
      c.beginPath(); c.rect(-ruleta.slot, -ruleta.slot / 2, ruleta.slot * 2, ruleta.slot); c.clip();
      // Capas desplazadas: emulan desenfoque exclusivamente vertical en Canvas.
      const offsets = ruleta.blur > 0.002 ? [-ruleta.blur, 0, ruleta.blur] : [0];
      offsets.forEach((off) => {
        c.save(); c.globalAlpha *= offsets.length === 1 ? 1 : 1 / offsets.length;
        ruleta.entries.forEach((entry, i) => dibujarTexto(c, entry.lines, 0, (i - ruleta.progreso + ruleta.rebote) * ruleta.slot + off * ruleta.slot, entry.px, st));
        c.restore();
      });
    } else dibujarTexto(c, lines, 0, 0, px, st);
    c.restore();
  }

  // ---------- que nada se solape ----------
  const KIND_Y0 = { lista: 0.4, conexion: 0.3, numero: 0.42, barras: 0.36 };
  let ajustes = new Map();
  function altoEv(e, st) {
    const k = e.kind, n = Math.max((e.items || []).length, 1);
    if (!k) {
      const txt = (e.anim === 'ruleta' && e.text.includes('|')) ? e.text.split('|').pop().trim() : e.text;
      const it = itemsTitulo(txt, e, st), { lines, px } = tamTitulo(it, e, st);
      return [(lines.length * px * 1.12 - px * 0.3) / H * 1.05, 0];
    }
    const f = { S: 0.045, M: 0.06, L: 0.075, XL: 0.09 }[e.size] || 0.06;
    if (k === 'lista') return [Math.min(n, 6) * f * 1.12 * 1.2, 0];
    if (k === 'conexion') return [0.13 * (Math.min(n, 4) - 1) + 0.09, 0.065 * (Math.min(n, 4) - 1)];
    if (k === 'numero') return [0.22, 0.06];
    return [0.1 * Math.min(n, 4), 0.05 * (Math.min(n, 4) - 1)];
  }
  function evitarSolapes(P, events, t) {
    ajustes = new Map();
    const st = P.style, s = st.subs;
    const act = events.filter((e) => e.start - 0.02 <= t && t < e.end);
    if (!act.length) return;
    let sub = null;
    if (s.on) sub = [s.y, (SUB_SIZE[s.size] || 0.038) * 1.12 * (s.maxPal >= 3 ? 2 : 1) + 0.03];
    const its = events.filter((e) => e.kind !== 'punto' && e.kind !== 'escena' && e.kind !== 'frase' && e.kind !== 'sticker' && !(!e.kind && DETRAS.includes(e.pos)) && act.some((a) => e.start < a.end && a.start < e.end)).map((e) => {
      const [h, off] = altoEv(e, st), manual = e.y != null;
      const base = manual ? e.y : (e.kind ? (KIND_Y0[e.kind] ?? 0.4) : (POS_Y[e.pos] ?? 0.3));
      return { e, h, off, c: base + off, manual };
    }).sort((a, b) => (a.manual === b.manual ? a.e.start - b.e.start : a.manual ? -1 : 1));
    const placed = [];
    for (const it of its) {
      const obst = (sub ? [sub] : []).concat(placed.filter((p) => p.e.start < it.e.end && it.e.start < p.e.end).map((p) => [p.c, p.h]));
      if (!it.manual && obst.length) {
        const choca = (x) => obst.some(([bc, bh]) => Math.abs(x - bc) < it.h / 2 + bh / 2 + 0.008);
        if (choca(it.c)) {
          const cand = [];
          obst.forEach(([bc, bh]) => cand.push(bc - bh / 2 - it.h / 2 - 0.012, bc + bh / 2 + it.h / 2 + 0.012));
          const ok = cand.filter((x) => x >= 0.03 + it.h / 2 && x <= 0.97 - it.h / 2 && !choca(x));
          if (ok.length) { ok.sort((a, b) => Math.abs(a - it.c) - Math.abs(b - it.c)); it.c = ok[0]; ajustes.set(it.e, it.c - it.off); }
        }
      }
      placed.push(it);
    }
  }

  // ---------- elementos especiales ----------
  function sprItems(txt, color, st, ev) {
    const caso = st.titulosCaso || 'mayus';
    return [{ t: casoTexto(txt, caso), font: fontOf(st.font), color }];
  }
  // ---------- frases: texto que se arma al ritmo de la voz ----------
  const FRASE_PX = { S: 0.05, M: 0.065, L: 0.08, XL: 0.1 }, PATRON_PILA = [1.0, 1.3, 0.95, 1.2];
  const esEmoji = (ch) => { const o = ch.codePointAt(0); return o >= 0x1F000 || (o >= 0x2600 && o <= 0x27BF) || [0x2B50, 0x2B55, 0x2B06, 0x2B07, 0x203C, 0x2049, 0xA9, 0xAE].includes(o); };
  function piezas(token) {
    const out = []; let buf = ''; const ch = [...token]; let i = 0;
    while (i < ch.length) {
      const c0 = ch[i];
      if (esEmoji(c0)) {
        if (buf) { out.push(['t', buf]); buf = ''; }
        let cl = c0; i++;
        while (i < ch.length && (ch[i] === '\u200d' || ch[i] === '\ufe0f' || (ch[i].codePointAt(0) >= 0x1F3FB && ch[i].codePointAt(0) <= 0x1F3FF) || (cl.endsWith('\u200d') && esEmoji(ch[i])))) { cl += ch[i]; i++; }
        out.push(['e', cl]);
      } else if (c0 === '\ufe0f' || c0 === '\u200d') i++;
      else { buf += c0; i++; }
    }
    if (buf) out.push(['t', buf]);
    return out;
  }
  function tiemposPalabras(ev, n) {
    const ts = (ev.times && ev.times.length ? ev.times : [ev.start]).map(Number);
    if (n <= 1) return [ts[0]];
    return Array.from({ length: n }, (_, i) => (ts.length === n ? ts[i] : ts[Math.round(i * (ts.length - 1) / (n - 1))]));
  }
  const largoTxt = (tk) => tk.p.filter((x) => x[0] === 't').reduce((a, x) => a + x[1].length, 0) || 2;
  function agruparLineas(tokens, modo) {
    const lineas = []; let act = [];
    for (const tk of tokens) {
      const largo = largoTxt(tk), nAct = act.reduce((a, x) => a + largoTxt(x), 0), cortaPrev = act.length && largoTxt(act[act.length - 1]) <= 2;
      const tope = modo === 'pila' ? 2 : 99, lim = modo === 'pila' ? 16 : 20;
      if (act.length && !cortaPrev && (act.length >= tope || nAct + largo > lim)) { lineas.push(act); act = []; }
      act.push(tk);
    }
    if (act.length) lineas.push(act);
    return lineas;
  }
  const BOUNCE = (u) => { const n1 = 7.5625, d1 = 2.75; if (u < 1 / d1) return n1 * u * u; if (u < 2 / d1) { u -= 1.5 / d1; return n1 * u * u + 0.75; } if (u < 2.5 / d1) { u -= 2.25 / d1; return n1 * u * u + 0.9375; } u -= 2.625 / d1; return n1 * u * u + 0.984375; };
  function estadoEntrada(anim, wd) {
    let sc = 1, dy = 0, al = clamp(wd / 0.08), rev = 1, bl = 0;
    if (anim === 'deslizar') { dy = (1 - easeOut(clamp(wd / 0.3))) * 0.05; al = clamp(wd / 0.2); }
    else if (anim === 'caer') { dy = -(1 - BOUNCE(clamp(wd / 0.5))) * 0.12; al = clamp(wd / 0.06); }
    else if (anim === 'escribir') { rev = clamp(wd / 0.22); al = 1; }
    else if (anim === 'desenfoque') { bl = (1 - clamp(wd / 0.3)) * 14; al = clamp(wd / 0.22); }
    else if (anim === 'zoom') { sc = 2.2 - 1.2 * easeOut(clamp(wd / 0.28)); al = clamp(wd / 0.12); }
    else if (anim === 'rebote') { const u = clamp(wd / 0.6); sc = 1 - Math.exp(-6 * u) * Math.cos(14 * u) * 0.35; }
    else if (anim === 'resorte') { const u = clamp(wd / 1.0); sc = 1 - 0.22 * Math.exp(-5.5 * u) * Math.cos(19 * u); al = clamp(wd / 0.05); }
    else { const u = clamp(wd / 0.22); sc = u < 0.55 ? 0.7 + 0.4 * easeOut(u / 0.55) : 1.1 - 0.1 * easeOut((u - 0.55) / 0.45); }
    return { sc, dy, al, rev, bl };
  }
  const luminancia = (hex) => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0'), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
  // El diseño de una frase se calcula una vez por texto y tamaño de letra, no en cada fotograma.
  const cacheFrase = new Map();
  function disenoFrase(ev, st) {
    const clave = [ev.id, ev.text, ev.size, ev.layout, ev.marcador, st.font, st.emphFont, st.titulosCaso, st.tracking, st.accent, st.text].join('|');
    const hit = cacheFrase.get(ev.id);
    if (hit && hit.clave === clave) return hit.d;
    const crudo = ev.text.split(/\s+/).filter(Boolean), tiempos = tiemposPalabras(ev, crudo.length);
    const toks = crudo.map((c, i) => ({ p: piezas(c.replace(/\*/g, '')), emph: c.startsWith('*') && (c.match(/\*/g) || []).length >= 2 && c.replace(/\*/g, '').length > 1, s: tiempos[i] }));
    const modo = ev.layout || 'pila', lineas = agruparLineas(toks, modo), base = (FRASE_PX[ev.size] || 0.08) * H;
    const fBase = fontOf(st.font), fEmph = fontOf(st.emphFont || st.font), tr = st.tracking;
    const tinta = luminancia(st.accent) > 140 ? '#111111' : '#ffffff';
    const cuerpo = lineas.map((linea, li) => {
      const esc = modo === 'pila' ? PATRON_PILA[li % PATRON_PILA.length] : 1;
      let ancho = 0, hMax = 1;
      const items = linea.map((tk) => {
        const px = base * esc * (tk.emph ? 1.18 : 1), grupo = []; let gw = 0;
        for (const [tipo, txt] of tk.p) {
          if (tipo === 't') {
            const t2 = casoTexto(txt, st.titulosCaso || 'mayus'), font = tk.emph ? fEmph : fBase;
            const it = { t: t2, font, color: tk.emph ? (ev.marcador ? tinta : st.accent) : st.text };
            const w = medida([it], px, tr * px);
            grupo.push({ tipo, it, dx: gw, w, px }); gw += w + px * 0.08; hMax = Math.max(hMax, px * 0.78);
          } else {
            const w = px * 0.95 * 1.05;
            grupo.push({ tipo, txt, dx: gw, w, px }); gw += w + px * 0.08; hMax = Math.max(hMax, px * 0.95);
          }
        }
        gw -= px * 0.08;
        const it = { g: grupo, w: gw, px, emph: tk.emph, s: tk.s, x: ancho };
        ancho += gw + px * 0.26;
        return it;
      });
      ancho -= items.length ? items[items.length - 1].px * 0.26 : 0;
      return { items, w: ancho, k: Math.min(1, 0.88 * W / Math.max(ancho, 1)), h: hMax };
    });
    const altoTotal = cuerpo.reduce((a, l) => a + l.h * l.k * 1.18, 0), fy = Math.min(1, 0.86 * H / Math.max(altoTotal, 1));
    const d = { lineas: cuerpo, fy, alto: altoTotal * fy };
    if (!document.fonts || document.fonts.status === 'loaded') cacheFrase.set(ev.id, { clave, d });  // con la tipografía sin cargar las medidas saldrían de otra fuente
    return d;
  }
  function dibujarFrase(c, ev, t, st) {
    const tail = ev.end - t;
    if (t < ev.start - 0.02 || tail <= 0 || !ev.text) return;
    const d = disenoFrase(ev, st), anim = ev.anim || 'pop', salida = ev.salida || 'fade';
    const v = salida === 'corte' ? 0 : 1 - clamp(tail / 0.25);
    const sDy = salida === 'subir' ? -0.06 * v : salida === 'bajar' ? 0.06 * v : 0, sSc = salida === 'encoger' ? 1 - 0.3 * v : 1, sAl = salida === 'corte' ? 1 : 1 - v;
    const y0 = ev.y != null ? ev.y : 0.5;
    let top = H * y0 - d.alto / 2;
    for (const ln of d.lineas) {
      const altoL = ln.h * ln.k * d.fy * 1.18, cy = top + altoL / 2; top += altoL;
      const xIni = W / 2 - ln.w * ln.k / 2;
      for (const it of ln.items) {
        const wd = t - (it.s - 0.03);
        if (wd < 0) continue;
        const e = estadoEntrada(anim, wd), al = e.al * sAl;
        if (al <= 0.01) continue;
        const k = ln.k * d.fy, gx = xIni + it.x * ln.k, sk = k * e.sc * sSc, py = cy + H * (e.dy + sDy);
        if (ev.marcador && it.emph) {
          const pad = it.px * 0.12 * k, an = it.w * k * easeOut(clamp(wd / 0.22));
          c.save(); c.globalAlpha = 0.92 * al; c.fillStyle = st.accent; c.fillRect(gx - pad, cy - it.px * 0.55 * k, an + pad * 2, it.px * k); c.restore();
        }
        for (const pz of it.g) {
          const cx = gx + (pz.dx + pz.w / 2) * k;
          c.save(); c.globalAlpha = al; c.translate(cx, py); c.scale(sk, sk);
          if (e.bl > 0.5) c.filter = `blur(${e.bl * 0.5}px)`;
          if (e.rev < 1) { c.beginPath(); c.rect(-pz.w / 2, -pz.px, pz.w * e.rev, pz.px * 2); c.clip(); }
          if (pz.tipo === 't') dibujarTexto(c, [[pz.it]], 0, 0, pz.px, st);
          else { c.font = `${pz.px * 0.95}px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(pz.txt, 0, 0); }
          c.restore();
        }
      }
    }
  }

  // ---------- escenas de texto ----------
  const imgsEscena = new Map();
  function imgEscena(nombre) {
    if (!nombre || !escenaUrl) return null;
    let im = imgsEscena.get(nombre);
    if (!im) { im = new Image(); im.onload = () => { sucio = true; }; im.src = escenaUrl(nombre); imgsEscena.set(nombre, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  const segmentar = (s) => { try { return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment).filter((x) => x.trim()).slice(0, 6); } catch { return [...s].filter((x) => x.trim()).slice(0, 6); } };
  function dibujarEscena(c, ev, t, st) {
    const tr = ev.trans || 'fade', d = t - ev.start, tail = ev.end - t;
    if (tr === 'fade' || tr === 'cruce') {
      const en = tr === 'cruce' ? 0.55 : 0.22, sa = tr === 'cruce' ? 0.55 : 0.25;
      return pintarEscena(c, ev, t, st, clamp(d / en) * clamp(tail / sa));
    }
    if (d < 0 || tail <= 0) return;
    if (tr === 'zoom') {
      const k = 1 + 0.22 * (1 - easeOut(clamp(d / 0.28)));
      c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2); c.beginPath(); c.rect(0, 0, W, H); c.clip();
      pintarEscena(c, ev, t, st, 1); c.restore(); return;
    }
    // barrido: una cortina cruza de izquierda a derecha al entrar y otra vez al salir
    const ent = easeInOut(clamp(d / 0.38)), sal = easeInOut(clamp((0.38 - tail) / 0.38));
    const x0 = sal > 0 ? Math.round(W * sal) : 0, x1 = sal > 0 ? W : Math.round(W * ent), borde = sal > 0 ? x0 : x1;
    if (x1 > x0) { c.save(); c.beginPath(); c.rect(x0, 0, x1 - x0, H); c.clip(); pintarEscena(c, ev, t, st, 1); c.restore(); }
    if (borde > 0 && borde < W) { c.save(); c.fillStyle = colores(st).accent; c.fillRect(borde - 3, 0, 6, H); c.restore(); }
  }
  function pintarEscena(c, ev, t, st, alpha) {
    const d = t - ev.start;
    if (alpha <= 0.01) return;
    const modo = ev.fondo || 'degradado', c1 = ev.c1 || '#1b1b1b', c2 = ev.c2 || '#000000';
    c.save(); c.globalAlpha = alpha;
    if (modo === 'color') { c.fillStyle = c1; c.fillRect(0, 0, W, H); }
    else if (modo === 'degradado') { const g = c.createLinearGradient(W * 0.15, 0, W * 0.0, H * 0.85); g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    else if (modo === 'imagen') {
      const im = imgEscena(ev.imagen);
      c.fillStyle = c1; c.fillRect(0, 0, W, H);
      if (im) {
        const k = Math.max(W / im.naturalWidth, H / im.naturalHeight) * (1 + 0.05 * clamp(d / Math.max(ev.end - ev.start, 0.5))), w = im.naturalWidth * k, hh = im.naturalHeight * k;
        c.drawImage(im, (W - w) / 2, (H - hh) / 2, w, hh);
        if (ev.velo !== false) { c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(0, 0, W, H); }
      }
    }
    c.restore();
    const y0 = ev.y != null ? ev.y : (modo === 'ninguno' ? 0.3 : 0.5), tieneTxt = (ev.items || []).some((x) => String(x).trim());
    const emo = segmentar(ev.emoji || '');
    if (emo.length) {
      const px = 0.12 * H * (ev.emojiTam || 1) * 0.86;
      c.save(); c.font = `${px}px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const gap = px * 1.2, x0 = W / 2 - gap * (emo.length - 1) / 2;
      emo.forEach((e, i) => {
        const u = clamp((d - 0.08 * i) / 0.34), sc = 0.2 + 0.8 * (1 + 3.2 * (u - 1) ** 3 + 2.2 * (u - 1) ** 2);
        const fl = Math.sin(t * 3 + i * 1.3) * H * 0.006 * clamp(d / 0.5);
        c.globalAlpha = alpha * clamp(u * 3); c.save(); c.translate(x0 + gap * i, H * (tieneTxt ? y0 - 0.12 : y0) + fl); c.scale(Math.max(sc, 0.05), Math.max(sc, 0.05)); c.fillText(e, 0, 0); c.restore();
      });
      c.restore();
    }
    if (tieneTxt) dibujarTitulo(c, { ...ev, kind: undefined, text: ev.items.join(' '), y: emo.length ? y0 + 0.04 : y0, start: ev.start + (emo.length ? 0.18 : 0), pos: 'centro', size: ev.size || 'L' }, t, st);
  }
  function dibujarSticker(c, ev, t) {
    const im = imgEscena(ev.archivo); if (!im) return;
    const d = t - ev.start, tail = ev.end - t; if (d < 0 || tail <= 0) return;
    const w = Math.max(ev.ancho || 0.3, 0.03) * W, hh = w * im.naturalHeight / im.naturalWidth, op = ev.op ?? 1;
    let sc = 1, dy = 0, al = 1, bl = 0, rev = 1;
    if (!ev.fija) {
      const e = estadoEntrada(ev.anim || 'pop', d), v = 1 - clamp(tail / 0.25), sal = ev.salida || 'fade';
      sc = e.sc * (sal === 'encoger' ? 1 - 0.3 * v : 1); dy = e.dy + (sal === 'subir' ? -0.05 * v : sal === 'bajar' ? 0.05 * v : 0); al = Math.min(e.al, 1) * (sal === 'corte' ? 1 : 1 - v); bl = e.bl; rev = e.rev;
    }
    if (al <= 0.01) return;
    c.save(); c.globalAlpha = op * al; if (bl > 0.5) c.filter = `blur(${bl}px)`;
    c.translate(W * (ev.x ?? 0.5), H * ((ev.y ?? 0.3) + dy)); c.rotate((ev.rot || 0) * Math.PI / 180); c.scale(Math.max(sc, 0.05), Math.max(sc, 0.05));
    if (rev < 1) { c.beginPath(); c.rect(-w / 2, -hh / 2, w * rev, hh); c.clip(); }
    c.drawImage(im, -w / 2, -hh / 2, w, hh); c.restore();
  }
  function dibujarKind(c, ev, t, st) {
    if (ev.kind === 'sticker') return dibujarSticker(c, ev, t);
    if (ev.kind === 'escena') return dibujarEscena(c, ev, t, st);
    if (ev.kind === 'frase') return dibujarFrase(c, ev, t, st);
    const k = ev.kind, d = t - ev.start, tail = ev.end - t, col = colores(st);
    const alpha = clamp(d / 0.2) * clamp(tail / 0.25);
    const items = (ev.items || []).filter((x) => String(x).trim());
    const f = { S: 0.045, M: 0.06, L: 0.075, XL: 0.09 }[ev.size] || 0.06;
    const caso = st.titulosCaso || 'mayus';
    const una = (txt, px, color, cx, cy, alp, sc = 1, blur = 0) => {
      const it = sprItems(txt, color, st, ev); c.save(); c.globalAlpha = alp; if (blur) c.filter = `blur(${blur}px)`;
      c.translate(cx, cy); c.scale(sc, sc); dibujarTexto(c, [it], 0, 0, px, st); c.restore();
    };
    if (k === 'punto') {
      const dur = Math.max(ev.end - ev.start, 0.3), u = d / dur;
      if (u < 0 || u > 1) return;
      const cx = W * (ev.x ?? 0.5), cy = H * (ev.y ?? 0.5), rmax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.02;
      let r = rmax * (u < 0.5 ? easeInOut(u / 0.5) : 1 - easeInOut((u - 0.5) / 0.5));
      r = Math.max(r, 0) + (u > 0.02 && u < 0.98 ? W * 0.012 : 0);
      if (r > 1) { c.save(); c.fillStyle = col.accent; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); c.restore(); }
      return;
    }
    if (alpha <= 0.01 || !items.length) return;
    const y0 = ev.y != null ? ev.y : (ajustes.has(ev) ? ajustes.get(ev) : null);
    if (k === 'lista') {
      const n = Math.min(items.length, 6), yy = y0 ?? 0.4, px = f * H;
      const paso = (ev.end - ev.start - 0.3) / n, gap = px * 1.12 * 1.2, top = H * yy - gap * (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const u = i < n - 1 ? clamp((d - 0.15 - i * paso) / 0.25) * (1 - clamp((d - 0.15 - (i + 1) * paso) / 0.25)) : clamp((d - 0.15 - i * paso) / 0.25);
        const cy = top + gap * i;
        una(items[i], px, col.text, W / 2, cy, alpha * (0.75 - 0.25 * u), 1, W / 90);
        if (u > 0.01) una(items[i], px, col.accent, W / 2, cy, alpha * u, 1 + 0.07 * easeOut(u));
      }
    } else if (k === 'conexion') {
      const n = Math.min(items.length, 4), yy = y0 ?? 0.3, xs = [0.3, 0.7, 0.32, 0.68], px = f * 0.9 * H;
      const paso = Math.min(0.8, Math.max((ev.end - ev.start - 0.4) / (n + 0.5), 0.3));
      const pos = items.slice(0, n).map((_, i) => [W * xs[i], H * (yy + 0.13 * i)]);
      for (let i = 0; i < n; i++) {
        const u = clamp((d - i * paso) / 0.25);
        if (u <= 0) continue;
        una(items[i], px, i % 2 ? col.text : col.accent, pos[i][0], pos[i][1], alpha * u, 0.85 + 0.15 * easeOut(u));
        if (i > 0) {
          const a = pos[i - 1], b = pos[i], p0 = [a[0], a[1] + px * 0.6 + 12], p2 = [b[0], b[1] - px * 0.6 - 12];
          const cc = [(p0[0] + p2[0]) / 2 + (i % 2 ? 40 : -40), (p0[1] + p2[1]) / 2], prog = easeInOut(clamp((d - i * paso + 0.35) / 0.35));
          c.save(); c.strokeStyle = col.accent; c.lineWidth = Math.max(H / 400, 3); c.lineCap = 'round'; c.beginPath();
          let last = p0;
          for (let s = 0; s <= 24; s++) { const q = (s / 24) * prog; last = [(1 - q) ** 2 * p0[0] + 2 * (1 - q) * q * cc[0] + q * q * p2[0], (1 - q) ** 2 * p0[1] + 2 * (1 - q) * q * cc[1] + q * q * p2[1]]; s ? c.lineTo(...last) : c.moveTo(...last); }
          c.stroke(); c.fillStyle = col.accent; c.beginPath(); c.arc(last[0], last[1], Math.max(H / 220, 6), 0, Math.PI * 2); c.fill(); c.restore();
        }
      }
    } else if (k === 'numero') {
      const yy = y0 ?? 0.42, valor = String(items[0]), etq = items[1] || '';
      const m = /^(\D*?)(\d[\d.,]*)(.*)$/.exec(valor);
      const pre = m ? m[1] : '', num = m ? m[2] : '0', suf = m ? m[3] : valor;
      const miles = /^\d{1,3}([.,]\d{3})+$/.test(num);
      const fin = miles ? parseFloat(num.replace(/[.,]/g, '')) : parseFloat(num.replace(',', '.'));
      const dec = /^\d+,\d{1,2}$/.test(num) ? num.split(',')[1].length : 0;
      const u = easeOut(clamp(d / 1.0)), val = fin * u;
      const txt = pre + (dec ? val.toFixed(dec) : fin >= 10000 ? Math.round(val).toLocaleString('es').replace(/,/g, '.') : String(Math.round(val))) + suf;
      una(txt, { S: 0.1, M: 0.13, L: 0.16, XL: 0.19 }[ev.size] * H || 0.16 * H, col.accent, W / 2, H * yy, alpha, 1 + 0.04 * (1 - u));
      if (etq) una(String(etq), 0.04 * H, col.text, W / 2, H * (yy + 0.12), alpha * clamp((d - 0.3) / 0.3));
    } else if (k === 'barras') {
      const yy = y0 ?? 0.36, bw = W * 0.72, bh = Math.max(H / 60, 14), x0 = (W - bw) / 2;
      const filas = items.slice(0, 4).map((tx) => { const [nombre, ...r] = String(tx).split(':'); const v = parseFloat((r.join(':') || '50').replace('%', '').replace(',', '.')); return [nombre.trim(), isNaN(v) ? 50 : v]; });
      const mx = Math.max(1, ...filas.map((x) => x[1]));
      filas.forEach(([nombre, val], i) => {
        const y = H * yy + i * H * 0.1, u = easeOut(clamp((d - 0.15 - i * 0.18) / 0.6));
        una(nombre, 0.035 * H, col.text, W / 2, y, alpha * clamp((d - i * 0.18) / 0.2));
        c.save(); c.globalAlpha = alpha; c.fillStyle = '#464646'; c.fillRect(x0, y + H / 30, bw, bh); c.fillStyle = col.accent; c.fillRect(x0, y + H / 30, bw * val / mx * u, bh); c.restore();
      });
    }
  }

  // ---------- subtítulos ----------
  let chunksCache = { key: '', chunks: [] };
  const FINAL_DEBIL = new Set('no ni a al la los las un una unos unas de del en con por para que y e o u pero porque como se su sus mi mis tu tus lo le les me te nos muy mas sin sobre entre hasta desde cuando donde es son'.split(' '));
  const INICIO_BUENO = new Set('y e o pero porque que cuando donde para con si como aunque entonces pues sino'.split(' '));
  const nk = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
  const RUIDO = /^(e+h+m*|e+m+|h?m{2,}|u+h+m*)$/i;
  const AUXILIARES = new Set('ha he has han hemos voy vas va vamos van estoy estamos puedo puede pueden quiero quiere tengo tiene tienen debo debe hay ni no tan tanto menos mas'.split(' '));
  const AUTONOMAS = new Set('si no mira ojo bueno pues claro exacto listo ahora entonces hola gracias atencion ok ya vale jamas nunca siempre mentira verdad'.split(' '));
  const esCap = (t) => { const x = t.replace(/^[¿¡(«"']+/, ''); return !!x && x[0] !== x[0].toLowerCase() && x[0] === x[0].toUpperCase(); };
  function partirGrupo(ws, maxPal) {
    const n = ws.length;
    if (n <= maxPal) return [ws];
    const autonoma = (j) => {
      const w = ws[j].w.trim(), k = nk(w);
      const cierra = /[,.!?;:…]$/.test(w) || (j + 1 < n && ws[j + 1].start - ws[j].end >= 0.25);
      return cierra && (AUTONOMAS.has(k) || /\d/.test(w));
    };
    const corte = (i) => {
      const a = ws[i - 1].w.trim(), b = ws[i].w.trim(), ka = nk(a), kb = nk(b);
      let c = 0;
      if (FINAL_DEBIL.has(ka)) c += 6; else if (AUXILIARES.has(ka)) c += 4;
      if (INICIO_BUENO.has(kb)) c -= 2;
      if (/\d$/.test(a) && !/[,.!?;:]$/.test(a)) c += 3;
      if (esCap(a) && esCap(b) && i - 2 >= 0 && !/[.?!]$/.test(ws[i - 2].w.trim())) c += 5;
      if (/,$/.test(a)) c -= 3;
      return c - Math.min(Math.max(ws[i].start - ws[i - 1].end, 0), 0.5) * 6;
    };
    const tamano = (j, i) => (i - j === 1 && autonoma(j) ? 0 : 0.15 * (maxPal - (i - j)) ** 2);
    const dp = Array(n + 1).fill(Infinity), prev = Array(n + 1).fill(0);
    dp[0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = Math.max(0, i - maxPal); j < i; j++) {
        if (dp[j] === Infinity) continue;
        const c = dp[j] + 0.5 + tamano(j, i) + (i < n ? corte(i) : 0);
        if (c < dp[i]) { dp[i] = c; prev[i] = j; }
      }
    }
    const out = [];
    for (let i = n; i > 0; i = prev[i]) out.unshift(ws.slice(prev[i], i));
    return out;
  }
  let vivasCache = { src: null, key: '', out: [] };
  function palabrasVivas(words) {
    const br = (getPlan()?.cortes?.borradas) || [];
    if (!br.length) return words;
    const key = JSON.stringify(br);
    if (vivasCache.src === words && vivasCache.key === key && vivasCache.n === words.length) return vivasCache.out;
    const out = words.filter((w) => { const m = (w.start + w.end) / 2; return !br.some(([a, b]) => m >= a && m < b); });
    vivasCache = { src: words, key, out, n: words.length };
    return out;
  }
  function chunksDe(words, s) {
    const caso = s.caso || (s.mayus ? 'mayus' : 'tal');
    const key = `v3|${words.length}|${words[0]?.w}|${words[words.length - 1]?.w}|${words.map((w) => w.w).join('').length}|${s.maxPal}|${caso}`;
    if (chunksCache.key === key && chunksCache.words === words) return chunksCache.chunks;
    const bloques = []; let cur = [];
    words.forEach((w, i) => {
      cur.push(w);
      const sig = i + 1 < words.length ? words[i + 1].start - w.end : 99, t = w.w.trim();
      if (sig >= 0.4 || /[.?!;:…]$/.test(t) || (/,$/.test(t) && (cur.length >= 2 || sig >= 0.2))) { bloques.push(cur); cur = []; }
    });
    if (cur.length) bloques.push(cur);
    const grupos = bloques.flatMap((g) => partirGrupo(g, Math.max(Number(s.maxPal) || 3, 1)));
    const out = [];
    for (const g of grupos) {
      const ws = [];
      for (const w of g) {
        let tx = w.w.trim().replace(/[.,;:]+$/, '');
        tx = caso === 'tal' ? tx : casoTexto(tx, caso);
        if (tx && !RUIDO.test(tx.replace(/[¿¡.,;:!?…]/g, ''))) ws.push({ t: tx, start: w.start, end: w.end, key: puntaje(limpia(w.w)) >= 7 });
      }
      if (ws.length) out.push({ words: ws, start: Math.max(0, ws[0].start - 0.05), end: ws[ws.length - 1].end + 0.22 });
    }
    for (let i = 0; i + 1 < out.length; i++) if (out[i + 1].start - out[i].end < 0.3) out[i].end = Math.min(out[i].end, out[i + 1].start);
    chunksCache = { key, words, chunks: out };
    return out;
  }
  function dibujarSubs(c, t, st, events, keepStart) {
    const s = st.subs;
    if (!s.on) return;
    const words = palabrasVivas(getWords());
    if (!words.length) return;
    const chunks = chunksDe(words, s);
    let ci = chunks.findIndex((ch) => t >= ch.start - 0.02 && t < ch.end);
    if (ci < 0) return;
    const ch = chunks[ci];
    let ai = 0;
    ch.words.forEach((w, j) => { if (w.start <= t + 0.03) ai = j; });
    // Por defecto el subtítulo sale completo. 'atenuar' deja la palabra en su lugar, apagada; 'quitar' es el modo viejo.
    const modoG = s.conGrande || 'completo';
    let ocultas = new Set(), tenues = new Set(), pulsan = new Set(), bump = 0;
    if (modoG !== 'completo' || s.pulso !== false) {
      const grandes = events.filter((e) => !e.kind && e.start - 0.4 <= t && t < e.end).map((e) => [new Set(e.text.split('|').pop().replace(/\*/g, ' ').split(/\s+/).map(nz).filter(Boolean)), e.start - 0.4, e.end + 0.1]);
      ch.words.forEach((w, j) => {
        const hit = grandes.filter(([ws, d0, d1]) => ws.has(nz(w.t)) && w.start >= d0 && w.start <= d1);
        if (!hit.length) return;
        if (modoG === 'quitar') ocultas.add(j); else if (modoG === 'atenuar') tenues.add(j);
        if (s.pulso !== false) hit.forEach(([, d0]) => { const dd = t - (d0 + 0.4); if (dd >= 0 && dd < 0.35) { pulsan.add(j); bump = Math.max(bump, Math.sin(Math.PI * dd / 0.35)); } });
      });
    }
    const vis = ch.words.map((_, j) => j).filter((j) => !ocultas.has(j));
    if (!vis.length) return;
    if (!vis.includes(ai)) { const prev = vis.filter((j) => j < ai); ai = prev.length ? prev[prev.length - 1] : vis[0]; }
    const base = fontOf(s.font || st.font), emph = fontOf(s.emphFont || s.font || st.font), col = colores(st);
    const items = vis.map((j) => { const wd = ch.words[j]; const clave = s.claves && wd.key, act = s.resalte === 'palabra' && j === ai; return { t: wd.t, font: clave ? emph : base, color: clave || act || pulsan.has(j) ? col.accent : col.text, alpha: tenues.has(j) ? 0.3 : 1 }; });
    let px = H * (SUB_SIZE[s.size] || 0.038);
    let lines = [items];
    if (medida(items, px, s.tracking * px) > 0.88 * W && items.length > 1) lines = items.length > 2 ? splitLines(items) : [items.slice(0, 1), items.slice(1)];
    const wMax = Math.max(...lines.map((l) => medida(l, px, s.tracking * px)));
    if (wMax > 0.88 * W) px *= 0.88 * W / wMax;
    const d = t - Math.max(ch.start, keepStart);
    const sc = (0.92 + 0.08 * easeOut(clamp(d / 0.09))) * (1 + 0.07 * bump);
    const alpha = clamp(d / 0.05) * clamp((ch.end - t) / 0.06);
    c.save();
    c.globalAlpha = alpha;
    c.translate(W / 2, H * s.y); c.scale(sc, sc);
    if (s.caja) {
      const w = Math.max(...lines.map((l) => medida(l, px, s.tracking * px))) , hh = px * 1.12 * lines.length, pad = px * 0.32;
      c.fillStyle = 'rgba(0,0,0,.59)'; c.beginPath(); c.roundRect(-w / 2 - pad, -hh / 2 - pad, w + 2 * pad, hh + 2 * pad, px * 0.4); c.fill();
    }
    dibujarTexto(c, lines, 0, 0, px, st, { tracking: s.tracking, glow: s.glow, contorno: s.contorno });
    c.restore();
  }

  // ---------- imagen ----------
  const filtroOk = 'filter' in ctx;
  function dibujarFrame(c, s, st, bn) {
    const im = st.imagen;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    if (filtroOk) {
      const partes = [];
      if (Math.abs(im.contraste - 1) > 0.01) partes.push(`contrast(${im.contraste})`);
      if (Math.abs(im.brillo) > 0.5) partes.push(`brightness(${1 + im.brillo / 255})`);
      if (Math.abs(im.saturacion - 1) > 0.01) partes.push(`saturate(${im.saturacion})`);
      if (bn > 0) partes.push(`grayscale(${bn})`);
      if (partes.length) c.filter = partes.join(' ');
    }
    if (s > 1.001) { c.translate(W / 2, H * ZY); c.scale(s, s); c.translate(-W / 2, -H * ZY); }
    dibujarVideo(c, vs, W, H);
    c.restore();
  }
  function viñeta(c, st) {
    const im = st.imagen;
    if (im.vineta > 0.01) {
      const g = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, H * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${im.vineta * 0.8})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (im.degradado > 0.01) {
      const g = c.createLinearGradient(0, 0, 0, H), d = im.degradado;
      g.addColorStop(0, `rgba(0,0,0,${d * 0.65 * 0.7})`); g.addColorStop(0.22, 'rgba(0,0,0,0)'); g.addColorStop(0.62, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${d * 0.65})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  }

  // ---------- recorte de la persona ----------
  let matteT = -1, matteOk = false;
  function actualizarMatte() {
    if (!tieneAlpha) { matteOk = false; return false; }
    // Si el video de la máscara se queda un instante atrás (se resincroniza), se sigue usando la última silueta:
    // así el halo y el desenfoque no parpadean ni desaparecen entre zooms.
    if (va.readyState < 2) { matteOk = matteT >= 0; return matteOk; }
    const key = va.currentTime;
    if (key !== matteT) {
      dibujarVideo(mkctx, va, maskSmall.width, maskSmall.height);
      const img = mkctx.getImageData(0, 0, maskSmall.width, maskSmall.height), px = img.data;
      for (let i = 0; i < px.length; i += 4) { px[i + 3] = px[i]; px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; }
      mctx.putImageData(img, 0, 0);
      matteT = key;
    }
    matteOk = true; return true;
  }
  const zoomTo = (c, s) => { if (s > 1.001) { c.translate(W / 2, H * ZY); c.scale(s, s); c.translate(-W / 2, -H * ZY); } };
  // la persona, recortada con el zoom actual (se dibuja sobre el fondo ya tratado)
  function recortar(s) {
    sctx.save(); sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalCompositeOperation = 'source-over'; sctx.clearRect(0, 0, W, H); sctx.drawImage(frameC, 0, 0);
    sctx.globalCompositeOperation = 'destination-in'; zoomTo(sctx, s); sctx.imageSmoothingQuality = 'high'; sctx.drawImage(maskC, 0, 0, W, H); sctx.restore();
  }
  // máscara de la persona a escala chica, con el zoom y un poco suavizada (para que el brillo no la toque)
  function matteChico(s) {
    pmctx.save(); pmctx.setTransform(1, 0, 0, 1, 0, 0); pmctx.clearRect(0, 0, pmC.width, pmC.height); pmctx.scale(pmC.width / W, pmC.height / H); zoomTo(pmctx, s);
    pmctx.filter = filtroOk ? `blur(${W / 140}px)` : 'none'; pmctx.drawImage(maskC, 0, 0, W, H); pmctx.restore();
  }

  // ---------- película: brillo en las luces del fondo, halación, grano ----------
  let ruido = null;
  function crearRuido() {
    const n = mk(256, 256), c = n.getContext('2d'), im = c.createImageData(256, 256);
    for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    c.putImageData(im, 0, 0); return n;
  }
  function brilloFondo(p, s) {
    if (!filtroOk || !(p.bloom > 0.02 || p.halacion > 0.02) || !matteOk) return;
    const u = clamp(Number(p.umbral), 0.3, 0.9), w = hiC.width, hh = hiC.height, t = Number(p.tamano);
    // luces: umbral suave (brillo y contraste moderado, sin bordes duros) y sin la persona
    const b = 0.5 / (u * 0.62 + 0.02);
    hictx.save(); hictx.clearRect(0, 0, w, hh); hictx.filter = `brightness(${b}) contrast(2.4) saturate(1.15)`; hictx.drawImage(frameC, 0, 0, w, hh); hictx.restore();
    matteChico(s);
    hictx.save(); hictx.globalCompositeOperation = 'destination-out'; hictx.drawImage(pmC, 0, 0); hictx.restore();
    const px = (f) => `blur(${(w * f).toFixed(2)}px)`;
    const capa = (cx, f, alpha, filtro) => { cx.save(); cx.clearRect(0, 0, w, hh); cx.filter = px(f); cx.drawImage(hiC, 0, 0); cx.restore(); };
    capa(gctx, 0.012 + 0.03 * t); capa(g2ctx, 0.05 + 0.09 * t); capa(g3ctx, 0.13 + 0.22 * t);
    // velo de difusión: el fondo entero suavizado, sin la persona
    vctx.save(); vctx.clearRect(0, 0, w, hh); vctx.filter = px(0.06); vctx.drawImage(frameC, 0, 0, w, hh); vctx.restore();
    for (const c of [gctx, g2ctx, g3ctx, vctx]) { c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(pmC, 0, 0); c.restore(); }
    fctx.save(); fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.globalCompositeOperation = 'screen'; fctx.imageSmoothingQuality = 'high';
    const k = p.bloom;
    if (k > 0.02) {
      fctx.globalAlpha = clamp(k * 0.9); fctx.drawImage(glowC, 0, 0, W, H);
      fctx.globalAlpha = clamp(k * 1.1); fctx.drawImage(glow2C, 0, 0, W, H);
      fctx.globalAlpha = clamp(k * 1.2); fctx.filter = 'sepia(0.55) saturate(1.6) brightness(1.15)'; fctx.drawImage(glow3C, 0, 0, W, H); fctx.filter = 'none';
      fctx.globalAlpha = clamp(k * 0.4); fctx.drawImage(veilC, 0, 0, W, H);
    }
    if (p.halacion > 0.02) { fctx.globalAlpha = clamp(p.halacion * 1.1); fctx.filter = 'sepia(1) saturate(7) hue-rotate(-20deg) brightness(1.2)'; fctx.drawImage(glow3C, 0, 0, W, H); fctx.filter = 'none'; }
    fctx.restore();
  }
  function peliculaGlobal(c, p, s) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    if (p.desvanecido > 0.01) { c.globalCompositeOperation = 'lighten'; c.fillStyle = `rgba(${Math.round(30 * p.desvanecido * 2)},${Math.round(26 * p.desvanecido * 2)},${Math.round(34 * p.desvanecido * 2)},1)`; c.fillRect(0, 0, W, H); }
    if (p.calidez > 0.01) { c.globalCompositeOperation = 'soft-light'; c.fillStyle = `rgba(255,160,80,${clamp(p.calidez * 0.35, 0, 1)})`; c.fillRect(0, 0, W, H); }
    if (p.grano > 0.01) {
      ruido = ruido || crearRuido();
      c.globalCompositeOperation = 'overlay'; c.globalAlpha = clamp(p.grano * 0.55, 0, 1);
      const ox = -Math.floor(Math.random() * 256), oy = -Math.floor(Math.random() * 256);
      for (let x = ox; x < W; x += 256) for (let y = oy; y < H; y += 256) c.drawImage(ruido, x, y);
    }
    c.restore();
  }

  // ---------- cuadro ----------
  let sMemo = { t: -1 }, sPrev = 1, tPrev = -1;
  function dibujar() {
    const P = getPlan();
    if (!P || !P.style) return;
    if (antes) {  // mantener pulsado: el video tal como se grabó, sin ningún efecto
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); dibujarVideo(ctx, vs, W, H);
      ctx.font = '600 26px Poppins, sans-serif'; const tx = 'ORIGINAL', tw = ctx.measureText(tx).width + 36;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect(28, 28, tw, 48, 24); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(tx, 46, 53); ctx.restore();
      return;
    }
    const st = P.style, t = vs.currentTime || 0;
    const inten = Number(st.zoomIntensidad ?? 1);
    const zooms = st.zooms ? (P.zooms || []).slice().sort((a, b) => a.t - b.t).map((z) => ({ t: z.t, level: 1 + (z.level - 1) * inten })) : [];
    let s = zoomScale(zooms, t, st.zoomEstilo, st.zoomDeriva);
    const events = st.titulos ? (P.events || []).slice().sort((a, b) => a.start - b.start) : [];
    const puntos = events.filter((e) => e.kind === 'punto').map((e) => e.start + Math.max(e.end - e.start, 0.3) / 2);
    if (puntos.filter((m) => m <= t).length % 2 === 1) s *= 1.12;
    const bn = st.zoomBN && s > 1.03 ? clamp((s - 1.03) / 0.05) : 0;
    evitarSolapes(P, events, t);
    const activos = events.filter((e) => e.start - 0.02 <= t && t < e.end);
    const back = activos.filter((e) => !e.kind && DETRAS.includes(e.pos));
    const front = activos.filter((e) => e.kind || !DETRAS.includes(e.pos));
    let k = 0;
    for (const e of events) if (!e.kind && DETRAS.includes(e.pos)) k = Math.max(k, clamp((t - e.start) / 0.18) * clamp((e.end + 0.1 - t) / 0.2));
    const pel = st.pelicula || {}, modo = st.fondoModo || 'titulos', bw = clamp(Number(st.desenfoque ?? 0.8));
    const mb = Number(st.motionBlur || 0), vel = tPrev >= 0 && Math.abs(t - tPrev) < 0.2 && t !== tPrev ? Math.abs(s - sPrev) / Math.abs(t - tPrev) : 0;
    const siempre = st.motionBlurModo === 'siempre', baseMb = siempre ? 0.55 + 0.25 * Math.sin(t * 1.9) : 0;
    const fuerzaMb = Math.max(vel > 0.05 ? Math.min(vel * 3, 1) : 0, baseMb);
    sPrev = s; tPrev = t;
    dibujarFrame(fctx, s, st, bn);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const quiereMatte = back.length || k > 0.01 || (pel.on && (pel.bloom > 0.02 || pel.halacion > 0.02 || pel.sobreMi === false)) || (modo !== 'titulos' && modo !== 'off' && bw > 0.01) || (mb > 0.02 && fuerzaMb > 0.02);
    const conMatte = quiereMatte && actualizarMatte();
    if (conMatte && pel.on) brilloFondo(pel, s);
    let w = 0, osc = 0.5;
    if (modo === 'siempre' || modo === 'bordes') { w = bw; osc = 0.1; } else if (modo !== 'off') { w = k * bw; }
    const motion = mb > 0.02 && fuerzaMb > 0.02;
    if (conMatte) {
      lctx.clearRect(0, 0, W, H); lctx.drawImage(frameC, 0, 0);
      if (w > 0.01) {
        smctx.clearRect(0, 0, smallC.width, smallC.height); smctx.drawImage(frameC, 0, 0, smallC.width, smallC.height);
        if (osc > 0) { smctx.fillStyle = `rgba(0,0,0,${osc})`; smctx.fillRect(0, 0, smallC.width, smallC.height); }
        lctx.save(); lctx.globalAlpha = w; lctx.imageSmoothingQuality = 'high';
        if (modo === 'bordes') {
          ectx.save(); ectx.clearRect(0, 0, W, H); ectx.imageSmoothingQuality = 'high'; ectx.drawImage(smallC, 0, 0, W, H);
          const g = ectx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.32, W / 2, H * 0.45, H * 0.62);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
          ectx.globalCompositeOperation = 'destination-in'; ectx.fillStyle = g; ectx.fillRect(0, 0, W, H); ectx.restore();
          lctx.drawImage(edgeC, 0, 0, W, H);
        } else lctx.drawImage(smallC, 0, 0, W, H);
        lctx.restore();
      }
      if (motion) {  // estela horizontal del fondo
        const kpx = (3 + (Math.min(vel, 1.2) * 14 + (siempre ? 18 * baseMb : 0)) * mb * 1.3) * (W / 720) * 1.3, n = 7;
        ectx.save(); ectx.clearRect(0, 0, W, H);
        for (let i = 0; i < n; i++) { ectx.globalAlpha = 1 / (i + 1); ectx.drawImage(frameC, (i - (n - 1) / 2) * kpx, 0); }
        const g = ectx.createLinearGradient(0, 0, W, 0);
        if (siempre) { g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
        else { g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.18, 'rgba(0,0,0,0.1)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(0.82, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
        ectx.globalAlpha = 1; ectx.globalCompositeOperation = 'destination-in'; ectx.fillStyle = g; ectx.fillRect(0, 0, W, H); ectx.restore();
        lctx.save(); lctx.globalAlpha = clamp(fuerzaMb * Math.min(mb * 1.6, 1)); lctx.drawImage(edgeC, 0, 0); lctx.restore();
      }
      back.forEach((e) => conOp(lctx, e, () => dibujarTitulo(lctx, e, t, st)));
      recortar(s);
      ctx.drawImage(layerC, 0, 0); ctx.drawImage(subjC, 0, 0);
    } else {
      ctx.drawImage(frameC, 0, 0);
    }
    if (pel.on) {
      peliculaGlobal(ctx, pel, s);
      if (pel.sobreMi === false && conMatte) ctx.drawImage(subjC, 0, 0);
    }
    viñeta(ctx, st);
    front.filter((e) => e.kind !== 'punto').forEach((e) => conOp(ctx, e, () => (e.kind ? dibujarKind(ctx, e, t, st) : dibujarTitulo(ctx, e, t, st))));
    dibujarSubs(ctx, t, st, events, 0);
    front.filter((e) => e.kind === 'punto').forEach((e) => dibujarKind(ctx, e, t, st));
    ctx.restore();
  }

  // ---------- sonido en vivo: efectos y música (la mezcla final se oye exacta en la vista previa generada) ----------
  const GSFX = { click: 0.5, pop: 0.45, whoosh: 0.4, tick: 0.5, ding: 0.4 };
  let ac = null, master = null, tAud = -1, musEl = null, musVol = 0, volSfx = 1, ganSfx = {};
  const bufs = {};
  async function cargarSfx(n) {
    if (!ac || !sfxBase || bufs[n] !== undefined) return;
    bufs[n] = null;
    try { const r = await fetch(n.startsWith('u:') ? (sfxUserUrl ? sfxUserUrl(n.slice(2)) : '') : `${sfxBase}/${n}.wav`); bufs[n] = await ac.decodeAudioData(await r.arrayBuffer()); } catch { delete bufs[n]; }
  }
  function sonar(n) {
    if (!ac || !(n.startsWith('u:') || GSFX[n])) return;
    const b = bufs[n]; if (!b) { cargarSfx(n); return; }
    const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = b; g.gain.value = Math.min((n.startsWith('u:') ? 0.5 : GSFX[n]) * 1.5 * volSfx * Number(ganSfx[n] ?? 1), 2);
    src.connect(g); g.connect(master || ac.destination); src.start();
  }
  // Voz mejorada en vivo: filtro de graves, compresor, nivelado y una compuerta contra el ruido de fondo (aproximación de la mezcla final)
  let voz = null;
  function crearVoz() {
    try {
      const src = ac.createMediaElementSource(vs), hp = ac.createBiquadFilter(), comp = ac.createDynamicsCompressor(), gate = ac.createGain(), mk = ac.createGain(), an = ac.createAnalyser();
      hp.type = 'highpass'; an.fftSize = 1024;
      src.connect(hp); hp.connect(an); hp.connect(comp); comp.connect(gate); gate.connect(mk); mk.connect(master || ac.destination);
      voz = { hp, comp, gate, mk, an, buf: new Float32Array(an.fftSize) };
    } catch { voz = { off: true }; }
  }
  function aplicarVoz(A) {
    if (!voz || voz.off) return;
    const now = ac.currentTime, on = !!(A && A.mejorar);
    voz.hp.frequency.setTargetAtTime(on && A.graves ? 90 : 10, now, 0.05);
    voz.comp.threshold.setTargetAtTime(on && A.compresion ? -26 : 0, now, 0.05);
    voz.comp.ratio.setTargetAtTime(on && A.compresion ? 3.5 : 1, now, 0.05);
    voz.comp.knee.value = 18; voz.comp.attack.value = 0.01; voz.comp.release.value = 0.2;
    voz.mk.gain.setTargetAtTime(on ? (A.compresion ? 1.7 : 1) * (A.volumen ? 1.25 : 1) : 1, now, 0.05);
    let g = 1;
    if (on && Number(A.ruido) > 0.03) {
      voz.an.getFloatTimeDomainData(voz.buf);
      let s = 0; for (let i = 0; i < voz.buf.length; i++) s += voz.buf[i] * voz.buf[i];
      const db = 10 * Math.log10(s / voz.buf.length + 1e-12);
      if (db < -50) g = 10 ** (-(Number(A.ruido) * 20) / 20);
    }
    voz.gate.gain.setTargetAtTime(g, now, g < 1 ? 0.12 : 0.02);
  }

  function pararMusica() { if (musEl) musEl.pause(); tAud = -1; }
  function audioTick(P) {
    if (estatico) return;
    if (vs.paused) { pararMusica(); return; }
    if (antes) { pararMusica(); if (ac && voz && !voz.off) aplicarVoz({ mejorar: false }); tAud = vs.currentTime; return; }
    const st = P.style, t = vs.currentTime;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.connect(ac.destination); } catch { ac = null; master = null; } }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    if (ac && tAud >= 0 && t > tAud && t - tAud < 0.3 && st.sonidos) {
      if (st.titulos) for (const e of P.events || []) if (e.sfx && e.sfx !== 'none' && e.start > tAud && e.start <= t) sonar(e.sfx);
      if (st.sfxZoom && st.sfxZoom !== 'none' && st.zooms) for (const z of P.zooms || []) if (z.level > 1.01 && z.t > tAud && z.t <= t) sonar(st.sfxZoom);
    }
    if (ac && !voz) crearVoz();
    aplicarVoz(P.audio);
    volSfx = Number(st.sfxVol ?? 1); ganSfx = st.sfxGanancia || {};
    tAud = t;
    const M = P.audio && P.audio.musica;
    if (!M || !M.archivo || !musicUrl) { if (musEl) musEl.pause(); return; }
    const url = musicUrl(M.archivo);
    if (!musEl || musEl.dataset.u !== url) { if (musEl) musEl.pause(); musEl = new Audio(url); musEl.dataset.u = url; musEl.loop = true; musVol = 0; try { ac.createMediaElementSource(musEl).connect(master); } catch { /* sin medidor para la música */ } }
    const want = Number(M.inicio || 0) + t;
    if (musEl.paused) { musEl.currentTime = want % (musEl.duration || 1e9); musEl.play().catch(() => {}); }
    else if (Math.abs(musEl.currentTime - want) > 1.2 && !(musEl.duration && want > musEl.duration)) musEl.currentTime = want;
    const hablando = (getWords() || []).some((w) => w.start <= t && t <= w.end + 0.15);
    const base = Math.min(10 ** (Number(M.vol) / 20) * 0.55, 1);
    const meta = hablando ? base * 10 ** (-Number(M.duck) / 20) : base;
    musVol += (meta - musVol) * 0.12;
    musEl.volume = clamp(musVol);
  }

  // ---------- reproducción: cortes y cámara lenta ----------
  function reglas() {
    const P = getPlan();
    if (!P) return;
    const t = vs.currentTime;
    const c = P.cortes;
    if (c && !vs.paused) { const quitar = (c.on ? c.rangos || [] : []).concat(c.borradas || []); for (const [a, b] of quitar) if (t >= a && t < b - 0.02) { vs.currentTime = b; break; } }
    const l = (P.lentos || []).find((x) => t >= x.start && t < x.end);
    const rate = l ? 1 / (l.factor || 2) : 1;
    if (Math.abs(vs.playbackRate - rate) > 0.01) vs.playbackRate = rate;
    if (l && l.grave) { /* la voz grave solo se oye en la vista previa generada */ }
  }
  function bucle() {
    if (!vivo) return;
    if (!estatico) { reglas(); const PP = getPlan(); if (PP && PP.style) audioTick(PP); }
    if (!va.paused !== !vs.paused) { vs.paused ? va.pause() : va.play().catch(() => {}); }
    if (tieneAlpha && Math.abs(va.currentTime - vs.currentTime) > (vs.paused ? 0.03 : 0.15)) va.currentTime = vs.currentTime;
    if (va.playbackRate !== vs.playbackRate) va.playbackRate = vs.playbackRate;
    // solo se dibuja cuando algo cambió: el video avanza, se movió un ajuste o se arrastró un texto
    if (!vs.paused || sucio || vs.currentTime !== tDib) { sucio = false; tDib = vs.currentTime; dibujar(); }
    if (!estatico) pintarControles();
    raf = requestAnimationFrame(bucle);
  }

  // ---------- controles ----------
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const bPlay = h('button', { type: 'button', class: 'btn gold sm live-play', 'aria-label': 'Reproducir o pausar', onclick: alternar }, 'Reproducir');
  const barra = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'live-seek', 'aria-label': 'Posición en el video', oninput: (e) => { vs.currentTime = (Number(e.target.value) / 1000) * (vs.duration || 0); va.currentTime = vs.currentTime; dibujar(); } });
  const tiempo = h('span', { class: 'live-time' }, '0:00');
  function alternar() { if (vs.paused) { vs.play().catch(() => {}); va.play().catch(() => {}); } else { vs.pause(); va.pause(); } }
  function pintarControles() {
    const dur = vs.duration || 0;
    bPlay.textContent = vs.paused ? 'Reproducir' : 'Pausar';
    if (document.activeElement !== barra && dur) barra.value = Math.round((vs.currentTime / dur) * 1000);
    tiempo.textContent = `${fmt(vs.currentTime)} / ${fmt(dur)}`;
  }
  // arrastrar textos: mover un título, un elemento o los subtítulos cambia su altura
  const KIND_Y = { lista: 0.4, conexion: 0.3, numero: 0.42, barras: 0.36, escena: 0.5, frase: 0.5, sticker: 0.3 };
  function arrastrables() {
    const P = getPlan(); if (!P || !P.style) return [];
    const t = vs.currentTime || 0, out = [];
    (P.events || []).filter((e) => e.start - 0.02 <= t && t < e.end && e.kind !== 'punto').forEach((e) => {
      const base = e.kind ? (KIND_Y[e.kind] ?? 0.4) : (POS_Y[e.pos] ?? 0.3);
      if (e.kind === 'sticker') out.push({ y: e.y ?? base, x: e.x ?? 0.5, min: 0.04, max: 0.95, set: (v) => { e.y = v; }, setX: (v) => { e.x = v; } });
      else out.push({ y: e.y ?? ajustes.get(e) ?? base, min: 0.08, max: 0.85, set: (v) => { e.y = v; } });
    });
    const s = P.style.subs;
    if (s && s.on) out.push({ y: s.y, min: 0.5, max: 0.8, set: (v) => { s.y = v; }, subs: true });
    return out;
  }
  let arr = null;
  const yDe = (e) => { const r = canvas.getBoundingClientRect(), sc = Math.min(r.width / W, r.height / H), dh = H * sc, off = (r.height - dh) / 2; return (e.clientY - r.top - off) / dh; };
  const xDe = (e) => { const r = canvas.getBoundingClientRect(), sc = Math.min(r.width / W, r.height / H), dw = W * sc, off = (r.width - dw) / 2; return (e.clientX - r.left - off) / dw; };
  canvas.addEventListener('pointerdown', (e) => {
    if (estatico) return;
    const y = yDe(e), xx = xDe(e), c = arrastrables().filter((o) => o.x == null || Math.abs(o.x - xx) < 0.25).map((o) => ({ o, d: Math.abs(o.y - y) })).filter((x) => x.d < 0.1).sort((a, b) => a.d - b.d)[0];
    arr = { o: c ? c.o : null, x: e.clientX, y: e.clientY, mov: false, dy: c ? c.o.y - y : 0, dx: c && c.o.x != null ? c.o.x - xx : 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!arr || !arr.o) return;
    if (!arr.mov && Math.hypot(e.clientX - arr.x, e.clientY - arr.y) < 5) return;
    arr.mov = true; canvas.style.cursor = 'grabbing';
    arr.o.set(Math.round(clamp(yDe(e) + arr.dy, arr.o.min, arr.o.max) * 100) / 100);
    if (arr.o.setX) arr.o.setX(Math.round(clamp(xDe(e) + arr.dx, 0.03, 0.97) * 100) / 100);
    if (onEdit) onEdit(); else dibujar();
  });
  canvas.addEventListener('pointerup', () => { if (estatico) return; const mov = arr && arr.mov; arr = null; canvas.style.cursor = ''; if (!mov) alternar(); });
  vs.addEventListener('seeked', () => { if (vs.paused) { va.currentTime = vs.currentTime; setTimeout(dibujar, 60); } });
  va.addEventListener('seeked', () => { if (vs.paused) dibujar(); });
  vs.addEventListener('loadeddata', () => dibujar());
  const el = h('div', { class: 'live' + (estatico ? ' estatico' : '') }, canvas, vs, va, estatico ? null : h('div', { class: 'live-ctl' }, bPlay, barra, tiempo));
  if (document.fonts) document.fonts.ready.then(() => dibujar());
  raf = requestAnimationFrame(bucle);

  return {
    medidor: () => (master && ac ? { ac, master } : null),
    el, video: vs,
    redraw: () => { sucio = true; },
    antes: (v) => { antes = !!v; sucio = true; if (!v) tAud = -1; },
    ir: (t) => { vs.currentTime = t; va.currentTime = t; sucio = true; matteT = -1; },
    alternar,
    destroy: () => { vivo = false; if (musEl) { musEl.pause(); musEl = null; } if (ac) { ac.close().catch(() => {}); ac = null; master = null; voz = null; } cancelAnimationFrame(raf); vs.pause(); va.pause(); vs.removeAttribute('src'); va.removeAttribute('src'); vs.load(); va.load(); },
  };
}
