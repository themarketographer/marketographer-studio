// Editor de Talking Head: sube un video, el motor propone títulos, subtítulos, zooms y sonidos, y tú ajustas con controles simples.
import { hojaExportar } from './exportar-ui.js';
import { crearMedidor } from './meter.js';
import { crearTimeline } from './timeline.js';
import { cuerpoPropiedades } from './inspector.js';
const POS = [['detras', 'Detrás de ti'], ['arriba', 'Arriba'], ['centro', 'Centro'], ['abajo', 'Abajo']];
const TAM = [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']];
const ANIM = [['pop', 'Rebote corto'], ['elastico', 'Elástico'], ['ruleta', 'Ruleta'], ['deslizar', 'Sube'], ['escribir', 'Se escribe'], ['fade', 'Aparece'], ['bajar', 'Baja'], ['crecer', 'Crece'], ['rebote', 'Rebote largo'], ['tiembla', 'Tiembla']];
const SFX = [['click', 'Click'], ['whoosh', 'Whoosh'], ['pop', 'Pop'], ['tick', 'Tick'], ['ding', 'Ding'], ['none', 'Ninguno']];
let SFXU = [];
const SFX_BASE = '/m/talking-head/assets/sfx';
const SFX_GAIN = { click: 0.5, pop: 0.45, whoosh: 0.4, tick: 0.5, ding: 0.4 };
const SFX_AUTO = { pop: 'click', deslizar: 'whoosh', escribir: 'none', fade: 'none', bajar: 'whoosh', crecer: 'pop', rebote: 'click', tiembla: 'click', elastico: 'pop', ruleta: 'tick' };
const ETAPAS = { transcribir: 'Transcribiendo lo que dices', recortar: 'Separándote del fondo', plan: 'Proponiendo títulos y zooms', render: 'Montando el video', formato: 'Preparando el formato', listo: 'Listo', analizado: 'Listo', error: 'Error' };
const ACENTOS = ['#fddc5b', '#FFFFFF', '#FF5C5C', '#3CD7FF', '#7CFF6B', '#FF4FA3'];
const TEXTOS = ['#FFFFFF', '#FDDC5B', '#181818'];

const DEF = {
  font: 'Anton-Regular.ttf', emphFont: '', accent: '#fddc5b', text: '#FFFFFF', tracking: 0, glow: 0.7, contorno: 0,
  desenfoque: 0.8, zooms: true, sonidos: true, titulos: true, densidad: 2,
  posiciones: ['detras', 'arriba', 'centro', 'abajo'], animaciones: ['pop', 'deslizar', 'escribir'], sonidoTitulos: 'auto', sfxVol: 1, sfxCierre: 'ding', sfxPorAnim: {}, sfxTipos: {}, sfxGanancia: {},
  zoomIntensidad: 1, zoomFrecuencia: 'normal', zoomEstilo: 'normal', zoomDeriva: false, sfxZoom: 'none', zoomBN: false, motionBlur: 0, motionBlurSobre: 'fondo', motionBlurModo: 'zoom', fondoModo: 'titulos', titulosCaso: 'mayus',
  pelicula: { on: false, bloom: 0.6, umbral: 0.72, tamano: 0.5, halacion: 0.5, grano: 0.35, desvanecido: 0.25, calidez: 0.4, sobreMi: true },
  imagen: { contraste: 1, saturacion: 1, brillo: 0, vineta: 0, bloom: 0, degradado: 0 },
  subs: { on: true, font: 'Poppins-ExtraBold.ttf', emphFont: '', size: 'L', y: 0.74, maxPal: 3, mayus: true, caso: '', conGrande: 'completo', pulso: true, resalte: 'palabra', claves: true, caja: false, tracking: 0, glow: 0, contorno: 0.8 },
};
const fusionar = (base, extra) => {
  const o = structuredClone(base);
  for (const [k, v] of Object.entries(extra || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? fusionar(o[k], v) : v;
  return o;
};

// Looks listos: cada uno cambia varias cosas a la vez. Después se afina con los controles.
const LOOKS = [
  { id: 'mk', nombre: 'Marketographer', nota: 'Limpio, con tipografía de marca en la palabra clave',
    f: 'Poppins-ExtraBold.ttf', patch: { font: 'Poppins-ExtraBold.ttf', emphFont: 'Working-Regular.otf', accent: '#fddc5b', text: '#FFFFFF', tracking: -0.02, glow: 0.25, contorno: 0, desenfoque: 0.8, zoomEstilo: 'suave', subs: { font: 'Poppins-ExtraBold.ttf', emphFont: 'Working-Regular.otf', contorno: 0.8, caja: false } } },
  { id: 'impacto', nombre: 'Impacto', nota: 'Letras altas, brillo fuerte y zooms con golpe',
    f: 'Anton-Regular.ttf', patch: { font: 'Anton-Regular.ttf', emphFont: 'ArchivoBlack-Regular.ttf', accent: '#fddc5b', tracking: 0.02, glow: 0.7, contorno: 0, desenfoque: 0.85, zoomEstilo: 'punch', zoomIntensidad: 1.3, subs: { font: 'Poppins-ExtraBold.ttf', emphFont: 'Anton-Regular.ttf', contorno: 0.9, caja: false } } },
  { id: 'elegante', nombre: 'Elegante', nota: 'Serif itálica, brillo suave y zooms lentos',
    f: 'DMSerifDisplay-Italic.ttf', patch: { font: 'DMSerifDisplay-Italic.ttf', emphFont: 'Poppins-ExtraBold.ttf', accent: '#fddc5b', tracking: 0, glow: 0.15, contorno: 0, desenfoque: 0.6, zoomEstilo: 'suave', zoomIntensidad: 0.8, subs: { font: 'Poppins-Bold.ttf', emphFont: 'DMSerifDisplay-Italic.ttf', contorno: 0.7, caja: false } } },
  { id: 'neon', nombre: 'Neón', nota: 'Brillo máximo y color frío',
    f: 'Righteous-Regular.ttf', patch: { font: 'Righteous-Regular.ttf', emphFont: 'Bangers-Regular.ttf', accent: '#3CD7FF', tracking: 0.03, glow: 1, contorno: 0, desenfoque: 0.8, zoomEstilo: 'normal', subs: { font: 'Righteous-Regular.ttf', emphFont: 'Righteous-Regular.ttf', contorno: 0.6, caja: false } } },
  { id: 'limpio', nombre: 'Limpio', nota: 'Sin brillo, subtítulos sobre caja',
    f: 'BebasNeue-Regular.ttf', patch: { font: 'BebasNeue-Regular.ttf', emphFont: '', tracking: 0.04, glow: 0, contorno: 0, desenfoque: 0.5, zoomEstilo: 'suave', zoomIntensidad: 0.7, subs: { font: 'Poppins-Bold.ttf', emphFont: '', contorno: 0, caja: true, claves: false } } },
];

// Lee un guion de Guiones: devuelve las palabras limpias y las marcas con su posición (índice de palabra).
function leerGuion(texto) {
  const palabras = [], enfasis = [], zooms = [], sfx = [], cortes = [];
  const re = /\*([^*]+)\*|\[(ZOOM|CORTE|SFX:\s*[^\]]+)\]|([^\s*\[]+)/gi;
  let m;
  while ((m = re.exec(texto))) {
    if (m[1]) { const ws = m[1].trim().split(/\s+/); enfasis.push({ i: palabras.length, n: ws.length, texto: ws.join(' ') }); palabras.push(...ws); }
    else if (m[2]) {
      const k = m[2].toUpperCase();
      const pos = Math.max(palabras.length - 1, 0);
      if (k === 'ZOOM') zooms.push(pos); else if (k === 'CORTE') cortes.push(pos); else sfx.push({ i: pos, nombre: m[2].split(':')[1].trim().toLowerCase() });
    } else if (/^[\p{P}]+$/u.test(m[3])) { if (!/^["“¿¡(«]+$/.test(m[3]) && palabras.length) palabras[palabras.length - 1] += m[3]; }
    else palabras.push(m[3]);
  }
  return { palabras, enfasis, zooms, sfx, cortes };
}

const CIERRE_DEF = { on: false, texto: 'Sígueme para más', sub: '', dur: 3, barra: true, fondo: 'ultimo' };
// Puntaje de "esta palabra merece ir en grande". Misma idea que el motor: longitud, palabras de tu mundo, y se castigan verbos y adverbios.
const STOP_T = new Set('a al algo algun alguna algunas alguno algunos ante antes asi aun aunque bien cada casi como con contra cual cuando cuanto de del desde donde dos el ella ellas ellos en entre era eres es esa ese eso esos esta estas este esto estos fue ha han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otro para pero poco por porque que quien se ser si sin sobre su sus tambien te tengo tiene todo todos tu tus un una uno unos y ya yo'.split(' '));
const CLAVES_T = new Set('marketing ventas vender venderse negocio negocios cliente clientes dinero ingresos curso cursos fotografia fotografo fotografos informacion resultados marca contenido redes precio cobrar comunidad estrategia audiencia seguidores talento pasion'.split(' '));
const VERBAL_T = ['aba', 'aron', 'ieron', 'ando', 'iendo', 'ara', 'ase', 'emos', 'amos', 'ian', 'ia', 'an', 'en', 'ar', 'er', 'ir'];
const DENS_MIN = { 1: 8, 2: 5, 3: 4 };
const PARASITAS = new Set('para como pero esto esta este estos estas todo todos toda todas porque cuando donde sobre entre desde hasta tambien tiene tienen tengo hacer hace haces hacen puede puedes pueden quiero quieres quien cual cuales algo mucho mucha muchos muchas cada otro otra otros otras solo ahora aqui asi bien entonces mismo misma muy tus sus nuestro vuestro siempre nunca ellos ellas nosotros usted ustedes vamos eres somos estoy estas estan fue ser ver dijiste digo dice dicen hola chicos hoy'.split(' '));
const AUDIO_DEF = { mejorar: false, graves: true, ruido: 0.5, compresion: true, volumen: true, musica: { archivo: '', vol: -18, duck: 10, inicio: 0, fundido: 1.5 } };
const CORTES_DEF = { on: false, modo: '', umbral: -38, minFrames: 10, pre: 3, post: 3, aireAntes: 0.06, aireDespues: 0.08, aireFin: 0.08, minCorte: 0.12, fundido: 12, zoomAlterna: false, ignorar: [], manual: [], rangos: [], borradas: [], sugIgnoradas: [] };
const PRESETS_PAUSA = [
  ['natural', 'Natural', 'Deja respirar entre ideas', { aireAntes: 0.10, aireDespues: 0.16, aireFin: 0.12, minCorte: 0.15 }],
  ['agil', 'Ágil', 'Ritmo de reel', { aireAntes: 0.06, aireDespues: 0.08, aireFin: 0.08, minCorte: 0.12 }],
  ['seco', 'Seco', 'Cada palabra pegada a la siguiente', { aireAntes: 0.03, aireDespues: 0.04, aireFin: 0.05, minCorte: 0.08 }],
];
// Misma lógica que engine/cuts.py por_palabras: se queda lo que está dentro de una palabra con un poco de aire; el resto se quita.
// Los bordes de cada palabra se ajustan con la energía del audio medida contra tu propio piso y nivel de voz, no contra un volumen fijo.
function porPalabras(words, db, dur, p, hop = 0.01) {
  const n = db.length;
  if (!words.length || !n) return [];
  const srt = [...db].sort((a, b) => a - b);
  let piso = srt[Math.floor(n * 0.10)];
  const nivel = srt[Math.floor(n * 0.90)];
  if (nivel - piso < 12) piso = nivel - 12;
  const umbral = piso + 0.35 * (nivel - piso);
  const en = (t) => db[Math.min(n - 1, Math.max(0, Math.floor(t / hop)))];
  const antes = p.aireAntes ?? 0.06, despues = p.aireDespues ?? 0.10, fin = p.aireFin ?? 0.10, minimo = p.minCorte ?? 0.12;
  const keeps = words.map((w, i) => {
    const a = +w.start, b = +w.end, ant = i ? +words[i - 1].end : 0, sig = i + 1 < words.length ? +words[i + 1].start : dur;
    let x = a; const l1 = Math.max(ant, a - 0.15);
    while (x - hop >= l1 && en(x - hop) >= umbral) x -= hop;
    const a2 = x; x = b; const l2 = Math.min(sig, b + 0.20);
    while (x + hop <= l2 && en(x) >= umbral) x += hop;
    const extra = /[.?!…]$/.test(String(w.w).trim()) ? fin : 0;
    return [Math.max(0, a2 - antes), Math.min(dur, x + despues + extra)];
  }).sort((x, y) => x[0] - y[0]);
  const unidos = [keeps[0].slice()];
  for (const [s_, e_] of keeps.slice(1)) { const u = unidos[unidos.length - 1]; if (s_ - u[1] < minimo) u[1] = Math.max(u[1], e_); else unidos.push([s_, e_]); }
  const out = []; let cur = 0;
  for (const [s_, e_] of unidos) { if (s_ - cur >= minimo) out.push([+cur.toFixed(3), +s_.toFixed(3)]); cur = e_; }
  if (dur - cur >= minimo) out.push([+cur.toFixed(3), +dur.toFixed(3)]);
  return out;
}
// Misma lógica que engine/cuts.py: tramos de silencio con margen antes y después, en segundos.
function detectarSilencios(db, hop, fps, dur, c) {
  const runs = [];
  for (let i = 0; i < db.length;) {
    if (db[i] < c.umbral) { let j = i; while (j < db.length && db[j] < c.umbral) j++; runs.push([i * hop, j * hop]); i = j; } else i++;
  }
  const out = [];
  for (const [s, e] of runs) {
    if (e - s < c.minFrames / fps) continue;
    const s2 = s > hop ? s + c.post / fps : s, e2 = e < dur - 2 * hop ? e - c.pre / fps : e;
    if (e2 - s2 > 0.04) out.push([+s2.toFixed(3), +e2.toFixed(3)]);
  }
  return out;
}
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const nz = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const nombreFuente = (f) => f.replace(/\.(ttf|otf)$/i, '').replace(/-(Regular|Italic)$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ');

// Alinea el guion corregido con las palabras originales para conservar los tiempos de lo que no cambió.
function alinear(viejas, texto) {
  const nw = texto.split(/\s+/).filter(Boolean);
  const A = viejas.map((w) => nz(w.w)), B = nw.map(nz);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [], cambios = new Map(), pares = [];
  let i = 0, j = 0, ultimoFin = 0, cambiadas = 0, go = [], gn = [];
  const volcar = (siguiente) => {
    if (!gn.length) { cambiadas += go.length; go = []; return; }
    cambiadas += Math.max(go.length, gn.length);
    const ini = go.length ? go[0].start : ultimoFin;
    let fin = go.length ? go[go.length - 1].end : (siguiente ?? ini + 0.3 * gn.length);
    if (fin - ini < 0.08 * gn.length) fin = ini + 0.12 * gn.length;
    const pesos = gn.map((x) => Math.max(x.length, 1)), total = pesos.reduce((a, b) => a + b, 0);
    let t = ini;
    gn.forEach((x, k) => { const d = (fin - ini) * pesos[k] / total; out.push({ w: x, start: +t.toFixed(2), end: +(t + d).toFixed(2) }); t += d; });
    if (go.length === 1 && gn.length === 1) { cambios.set(nz(go[0].w), gn[0]); pares.push([go[0].w.replace(/^[¿¡(«"']+|[.,;:!?)»"'…]+$/g, ''), gn[0].replace(/^[¿¡(«"']+|[.,;:!?)»"'…]+$/g, '')]); }
    ultimoFin = fin; go = []; gn = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      volcar(viejas[i].start);
      out.push({ w: nw[j], start: viejas[i].start, end: viejas[i].end });
      ultimoFin = viejas[i].end; i++; j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) { go.push(viejas[i]); i++; }
    else { gn.push(nw[j]); j++; }
  }
  volcar(null);
  return { palabras: out, cambios, cambiadas, pares };
}


// ---------- íconos y ajustes guardados en el navegador ----------
const ICN = {
  doc: 'M6 4h9l3 3v13H6zM9 11h6M9 15h6', cortes: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM8.1 7.9L20 20M8.1 16.1L20 4',
  audio: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2', letras: 'M5 19L12 5l7 14M8 14h8', titulos: 'M4 6h16M12 6v13M8 19h8', subs: 'M4 7h16v10H4zM7 12h4M13 12h4',
  camara: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', formato: 'M3 6h18v12H3zM8 10h8v4H8z', look: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18', elementos: 'M12 5v14M5 12h14', capas: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5', cierre: 'M4 6h16v12H4zM9 10l6 2-6 2z',
  publicar: 'M12 16V4M7 9l5-5 5 5M5 20h14', fondo: 'M4 5h16v14H4zM8 9.5a1.5 1.5 0 100 .01M4 17l5-5 4 4 3-3 4 4', pelicula: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  sol: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5', tamano: 'M5 19l14-14M5 19h6M5 19v-6M19 5h-6M19 5v6',
  vertical: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4', paleta: 'M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2s0-2 1.5-2H18a3 3 0 003-3c0-6-4-11-9-11zM7.5 11h.01M10 7h.01M15 7h.01',
  zoom: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5M11 8v6M8 11h6', lento: 'M12 4a9 9 0 019 9M12 4a9 9 0 00-9 9h18M12 13l4-4', musica: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3', sonidos: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2', reset: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.7L3 8M3 3v5h5', volumen: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6', tracking: 'M4 18h16M7 14l5-9 5 9M9 11h6',
  caso: 'M3 18l4-10 4 10M4.5 14h5M14 18v-6a3 3 0 016 0v6M14 15h6', contorno: 'M5 5h14v14H5z', vineta: 'M4 6h16v12H4zM8 9h8v6H8z',
  grano: 'M5 5h.01M10 4h.01M15 6h.01M19 5h.01M7 9h.01M13 10h.01M18 11h.01M4 13h.01M9 14h.01M15 15h.01M20 16h.01M6 18h.01M12 19h.01M17 19h.01',
  llama: 'M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z', gota: 'M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z', calor: 'M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z',
  onda: 'M3 17c3-8 6-8 9 0s6 8 9 0', ojo: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z', copiar: 'M9 9h10v10H9zM5 15V5h10',
  deshacer: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3', rehacer: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3', ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  reloj: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4l3 2', imagen: 'M4 5h16v14H4zM8 9.5h.01M4 17l5-5 4 4 3-3 4 4', hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16', teclado: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  anim: 'M5 12h14M13 6l6 6-6 6', estrella: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.200 9.500l6.100-.9z', guardar: 'M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  mover: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3', izq: 'M15 5l-7 7 7 7', der: 'M9 5l7 7-7 7', check: 'M5 12l5 5 9-10', frases: 'M4 7h9M4 12h16M4 17h11M17 5l3 2-3 2', descargar: 'M12 4v12M7 11l5 5 5-5M5 20h14', mas: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', play: 'M8 5v14l11-7z', lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
};
const ic = (n, sz = 18) => (ICN[n] ? `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICN[n]}"/></svg>` : '');
// Cada etiqueta recibe el ícono que mejor dice qué está modificando.
const ICONO_DE = [
  [/silenc|umbral|margen|corte|recort/, 'cortes'], [/tipograf|fuente|letra/, 'letras'], [/mayuscul|minuscul/, 'caso'], [/interletr/, 'tracking'], [/contorno/, 'contorno'],
  [/brillo|glow|luces|luz/, 'sol'], [/tamano|size|escala/, 'tamano'], [/altura|posicion|desde arriba/, 'vertical'], [/color|acento|colores/, 'paleta'], [/zoom|intensidad|frecuencia|estilo del mov/, 'zoom'],
  [/lent|velocidad/, 'lento'], [/musica/, 'musica'], [/voz|microfono|ruido|graves/, 'mic'], [/volumen|sonido|efecto|sfx/, 'volumen'], [/desenfoque|difumin|blur/, 'gota'], [/grano/, 'grano'],
  [/bloom|halo|halacion/, 'llama'], [/calidez|temperatura/, 'calor'], [/negros|desvanec/, 'onda'], [/vineta|degradado/, 'vineta'], [/contraste|saturacion|imagen$|^imagen/, 'look'],
  [/subtit/, 'subs'], [/palabras grandes|palabra|titulo/, 'titulos'], [/portada/, 'imagen'], [/caption|hashtag/, 'hash'], [/guion|texto/, 'doc'], [/pelicula|film/, 'pelicula'],
  [/tarjeta final|cierre/, 'cierre'], [/animacion|movimiento/, 'anim'], [/fondo/, 'fondo'], [/vocabulario|reemplazo/, 'letras'], [/atajo|teclado/, 'teclado'], [/estilo|look/, 'estrella'],
  [/duracion|tiempo/, 'reloj'], [/camara|encuadre/, 'camara'], [/elemento|lista|barras/, 'elementos'],
];
const plano = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const iconoPara = (txt) => { const t = plano(txt || ''); const m = ICONO_DE.find(([re]) => re.test(t)); return m ? m[1] : null; };

const LS_AJ = 'estudio.ajustes.v1';
const AJ_DEF = { calidad: 'borrador', notificar: true, atajos: true, vocab: null, estilos: [], estiloDefecto: null, plantillasPortada: [] };
function leerAjustes() { try { return { ...AJ_DEF, ...JSON.parse(localStorage.getItem(LS_AJ) || '{}') }; } catch { return { ...AJ_DEF }; } }
function guardarAjustes(a) { try { localStorage.setItem(LS_AJ, JSON.stringify(a)); } catch { /* sin almacenamiento: se usa solo en esta sesión */ } }
const PELIS = [
  ['off', 'Apagada', 'Sin efecto', { on: false }],
  ['35', 'Cine 35 mm', 'Brillo suave y halo cálido', { on: true, bloom: 0.55, umbral: 0.72, tamano: 0.5, halacion: 0.45, grano: 0.3, desvanecido: 0.22, calidez: 0.35, sobreMi: true }],
  ['s8', 'Super 8 antiguo', 'Grano, negros lavados y halo naranja', { on: true, bloom: 0.8, umbral: 0.62, tamano: 0.7, halacion: 0.8, grano: 0.7, desvanecido: 0.45, calidez: 0.65, sobreMi: true }],
  ['luces', 'Luces de noche', 'Las luces del fondo explotan, tú sales limpio', { on: true, bloom: 1, umbral: 0.6, tamano: 0.8, halacion: 0.35, grano: 0.2, desvanecido: 0.1, calidez: 0.1, sobreMi: false }],
  ['solo', 'Solo brillo en luces', 'Sin grano ni color, nada más', { on: true, bloom: 0.6, umbral: 0.75, tamano: 0.5, halacion: 0, grano: 0, desvanecido: 0, calidez: 0, sobreMi: false }],
];

import { crearLive } from './live.js';

// ---------- formatos de salida: el video se edita en 9:16, 16:9, 1:1 o 4:5 ----------
const FORMATOS_UI = [['9x16', '9:16 Vertical'], ['16x9', '16:9 Horizontal'], ['1x1', '1:1 Cuadrado'], ['4x5', '4:5 Feed']];
const FMT_NOM = { '9x16': [1080, 1920], '16x9': [1920, 1080], '1x1': [1080, 1080], '4x5': [1080, 1350] };
const FMT_ASP = { '9x16': '9 / 16', '16x9': '16 / 9', '1x1': '1 / 1', '4x5': '4 / 5' };
const FMT_USO = { '9x16': 'Reels, TikTok y Shorts.', '16x9': 'YouTube y web.', '1x1': 'LinkedIn y X.', '4x5': 'Instagram feed y Facebook.' };
const formatoAuto = (w, h) => (w / h > 1.2 ? '16x9' : w / h > 0.9 ? '1x1' : '9x16');
const etqSalida = (plan) => FMT_NOM[(plan && plan.formato) || '9x16'].join('x');
const dimsVideo = (url) => new Promise((ok) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => ok({ w: v.videoWidth, h: v.videoHeight }); v.onerror = () => ok(null); v.src = url; });

export async function mount(root, { api: api0, toast, h, icon }) {
  // Barra de trabajo: cualquier cambio que se mande al motor y tarde más de un instante muestra una barra arriba con lo que está pasando.
  const ETIQ = [[/vocabulario/, 'Corrigiendo palabras con tu vocabulario'], [/replanear/, 'Recalculando con tus ajustes'], [/candidatos|portada/, 'Buscando los mejores momentos'], [/duplicar/, 'Duplicando el proyecto'], [/miniatura/, 'Preparando la miniatura'], [/renderizar|vista/, 'Preparando el video'], [/sfx|musica/, 'Guardando el audio']];
  let enVuelo = 0, barraT = 0, barraEl = null;
  const mostrarBarra = (txt) => {
    if (!barraEl) { barraEl = h('div', { class: 'barra-trabajo', role: 'status', 'aria-live': 'polite' }, h('i'), h('span', {})); document.body.append(barraEl); }
    barraEl.lastChild.textContent = txt + '...'; barraEl.classList.add('on');
  };
  const api = async (ruta, opts = {}) => {
    const m = (opts.method || 'GET').toUpperCase();
    const lenta = m !== 'GET' && !(m === 'PUT' && /\/plan$/.test(ruta)) && !/\/estado$/.test(ruta);
    let t = 0;
    if (lenta) { const et = (ETIQ.find(([re]) => re.test(ruta)) || [, 'Aplicando el cambio'])[1]; t = setTimeout(() => { enVuelo++; mostrarBarra(et); t = -1; }, 350); }
    try { return await api0(ruta, opts); }
    finally {
      if (lenta) {
        if (t === -1) { enVuelo--; if (!enVuelo && barraEl) barraEl.classList.remove('on'); } else clearTimeout(t);
      }
    }
  };
  const A = '/talking-head';
  const S = { fuentes: [], motorListo: true, proyectos: [], p: null, tab: 'source', panel: null, poll: null, guardar: null, bust: Date.now(),
    dirty: false, sel: new Set(), abiertos: new Set(), zona: 'none', guion: null };
  let video = null, panelEl = null, live = null, medidor = null, timeline = null, inlineEl = null, lineaEl = null, histTimer = null, tlTimer = null;
  S.aj = leerAjustes(); S.paso = 'recorte'; S.inline = null;
  try { S.vista = localStorage.getItem('estudio.vista') || 'normal'; } catch { S.vista = 'normal'; }
  const Hist = { pila: [], i: -1, ultimo: '' };

  async function cargarFuentes() {
    const r = await api(A + '/fuentes');
    S.fuentes = r.fuentes; S.motorListo = r.motorListo;
    document.getElementById('th-fonts')?.remove();
    document.head.append(h('style', { id: 'th-fonts' }, r.fuentes.map((f, i) => `@font-face{font-family:"thf${i}";src:url("/api/talking-head/fuentes/${encodeURIComponent(f)}")}`).join('\n')));
  }
  const fam = (f) => `thf${S.fuentes.indexOf(f)}`;

  // ---------- controles reutilizables ----------
  const cambio = () => { S.dirty = true; guardarPlan(); if (live) live.redraw(); pintarTiles(); pintarLinea(); instantanea(); };

  // ---------- ícono automático en cada título y etiqueta ----------
  function decorar(el) {
    if (!el) return;
    el.querySelectorAll('.card > h2, .lbl, .sw-row > span:last-child, .hoja-head h2, .paso-head h2').forEach((n) => {
      if (n.dataset.ic) return;
      n.dataset.ic = '1';
      const txt = (n.firstChild && n.firstChild.nodeType === 3 ? n.firstChild.textContent : n.textContent) || '';
      const nombre = iconoPara(txt);
      if (nombre) n.insertAdjacentHTML('afterbegin', `<span class="ic">${ic(nombre, n.tagName === 'H2' ? 20 : 16)}</span>`);
    });
  }

  // ---------- deshacer y rehacer ----------
  function instantanea(ya) {
    clearTimeout(histTimer);
    const f = () => {
      if (!S.p || !S.p.plan) return;
      const j = JSON.stringify(S.p.plan);
      if (j === Hist.ultimo) return;
      Hist.pila = Hist.pila.slice(0, Hist.i + 1); Hist.pila.push(j);
      if (Hist.pila.length > 80) Hist.pila.shift();
      Hist.i = Hist.pila.length - 1; Hist.ultimo = j; pintarHist();
    };
    if (ya) f(); else histTimer = setTimeout(f, 400);
  }
  function reiniciarHist() { Hist.pila = [JSON.stringify(S.p.plan)]; Hist.i = 0; Hist.ultimo = Hist.pila[0]; }
  function viajar(d) {
    instantanea(true);
    const k = Hist.i + d;
    if (k < 0 || k >= Hist.pila.length) return toast(d < 0 ? 'No hay nada más que deshacer.' : 'No hay nada que rehacer.');
    Hist.i = k; const j = Hist.pila[k]; Hist.ultimo = j;
    S.p.plan = JSON.parse(j); prepararPlan(S.p); guardarPlan(); S.dirty = true;
    if (live) live.redraw();
    pintarTiles(); pintarLinea(); pintarPanel(); pintarHist();
    toast(d < 0 ? 'Deshice el último cambio.' : 'Rehice el cambio.');
  }
  function pintarHist() { const u = document.getElementById('th-undo'), r = document.getElementById('th-redo'); if (u) u.disabled = Hist.i <= 0; if (r) r.disabled = Hist.i >= Hist.pila.length - 1; }

  // ---------- atajos de teclado ----------
  if (window.__thKeys) document.removeEventListener('keydown', window.__thKeys);
  window.__thKeys = (e) => {
    if (!root.isConnected || !S.p || !S.p.plan || !S.aj.atajos) return;
    const t = e.target, escribe = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    const cmd = e.metaKey || e.ctrlKey, k = (e.key || '').toLowerCase();
    if (cmd && k === 'z' && !escribe) { e.preventDefault(); viajar(e.shiftKey ? 1 : -1); return; }
    if (cmd && k === 'y' && !escribe) { e.preventDefault(); viajar(1); return; }
    if (escribe || cmd || e.altKey) return;
    if (e.key === ' ' && live && t.tagName !== 'BUTTON') { e.preventDefault(); live.alternar(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && video && t.tagName !== 'INPUT') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / (plan().fps || 30))); }
  };
  document.addEventListener('keydown', window.__thKeys);

  // ---------- vocabulario: se guarda en este navegador y se copia al motor ----------
  async function sincronizarVocab() {
    const sv = await api(A + '/vocabulario').catch(() => null);
    if (S.aj.vocab) { await api(A + '/vocabulario', { method: 'PUT', body: S.aj.vocab }).catch(() => {}); }
    else if (sv) { S.aj.vocab = { terminos: sv.terminos || [], reemplazos: sv.reemplazos || [] }; guardarAjustes(S.aj); }
  }
  async function guardarVocab(v) { S.aj.vocab = v; guardarAjustes(S.aj); await api(A + '/vocabulario', { method: 'PUT', body: v }); }
  const avisar = (txt) => {
    toast(txt);
    try { if (S.aj.notificar && 'Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Estudio Marketographer', { body: txt }); } catch { /* sin permiso */ }
  };
  const seg = (label, opts, val, on) => h('div', { class: 'ctl' }, label ? h('span', { class: 'lbl' }, label) : null,
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || 'Opciones' }, opts.map(([v, l]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === val), class: 'seg-b' + (v === val ? ' on' : ''), onclick: () => { on(v); } }, l))));
  const chips = (label, opts, vals, on, nota) => h('div', { class: 'ctl' }, label ? h('span', { class: 'lbl' }, label) : null,
    h('div', { class: 'chips' }, opts.map(([v, l]) => {
      const act = vals.includes(v);
      return h('button', { type: 'button', 'aria-pressed': String(act), class: 'chip' + (act ? ' on' : ''), onclick: () => on(act ? vals.filter((x) => x !== v) : [...vals, v]) }, l);
    })), nota ? h('small', { class: 'hint' }, nota) : null);
  // Slider con restablecer: doble clic sobre la barra o el botón de la flecha vuelven al valor de fábrica.
  const slider = (label, min, max, step, val, show, on, def) => {
    const out = h('output', {}), inp = h('input', { type: 'range', min, max, step, value: val, 'aria-label': label });
    const sin = def == null || Number.isNaN(Number(def));
    const lejos = (v) => !sin && Math.abs(Number(v) - Number(def)) > step / 2;
    const rs = sin ? null : h('button', { type: 'button', class: 'sl-reset', title: `Volver a ${show(def)} (o doble clic en la barra)`, 'aria-label': `Restablecer ${label}`, html: ic('reset', 13) });
    const pinta = (v) => { out.textContent = show(v); if (rs) rs.classList.toggle('on', lejos(v)); };
    const poner = (v) => { inp.value = v; pinta(v); on(v); };
    inp.addEventListener('input', (e) => { const v = Number(e.target.value); pinta(v); on(v); });
    if (!sin) { inp.addEventListener('dblclick', () => poner(Number(def))); rs.addEventListener('click', () => { poner(Number(def)); inp.focus(); }); }
    pinta(val);
    return h('label', { class: 'ctl' }, h('span', { class: 'lbl row' }, label, h('span', { class: 'lbl-r' }, rs, out)), inp);
  };
  const toggle = (label, val, on, nota) => h('div', { class: 'ctl' }, h('button', { type: 'button', role: 'switch', 'aria-checked': String(!!val), class: 'sw-row', onclick: () => on(!val) },
    h('span', { class: 'sw' + (val ? ' on' : ''), 'aria-hidden': 'true' }, h('i')), h('span', {}, label)), nota ? h('small', { class: 'hint' }, nota) : null);
  const fontPicker = (label, cur, on, permitirIgual) => h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, label),
    h('div', { class: 'fonts', role: 'radiogroup', 'aria-label': label }, [
      permitirIgual ? h('button', { type: 'button', role: 'radio', 'aria-checked': String(!cur), class: 'font' + (!cur ? ' on' : ''), onclick: () => on('') }, h('span', { class: 'aa small' }, 'Igual'), h('small', {}, 'sin cambio')) : null,
      ...S.fuentes.map((f) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(cur === f), class: 'font' + (cur === f ? ' on' : ''), style: `font-family:${fam(f)}`, onclick: () => on(f) },
        h('span', { class: 'aa' }, 'Aa'), h('small', {}, nombreFuente(f))))]));
  const colorRow = (label, val, presets, on) => {
    const inp = h('input', { type: 'color', value: val, 'aria-label': label, oninput: (e) => { on(e.target.value, false); } });
    return h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, label), h('div', { class: 'swatches' }, presets.map((c) =>
      h('button', { type: 'button', class: 'dot-c' + (c.toLowerCase() === val.toLowerCase() ? ' on' : ''), style: `background:${c}`, 'aria-label': label + ' ' + c, onclick: () => { inp.value = c; on(c, true); } })), inp));
  };

  // ---------- inicio ----------
  async function inicio() {
    stopPoll(); S.p = null;
    if (live) { live.destroy(); live = null; } clearInterval(tlTimer);
    if (S.pl) { S.pl.live.destroy(); S.pl = null; }
    S.proyectos = await api(A + '/proyectos');
    const input = h('input', { type: 'file', accept: 'video/*', multiple: true, hidden: true, onchange: (e) => elegidos(e.target.files) });
    const zona = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Elegir un video',
      onclick: () => input.click(), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && input.click(),
      ondragover: (e) => { e.preventDefault(); zona.classList.add('over'); }, ondragleave: () => zona.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); zona.classList.remove('over'); elegidos(e.dataTransfer.files); } },
      h('div', { class: 'drop-ico', html: icon('video', 30) }),
      h('strong', {}, 'Arrastra aquí tu video o varios a la vez'), h('span', {}, 'O haz clic para elegirlos. Con varios, se procesan uno tras otro con los ajustes que elijas. Funciona mejor vertical y grabado siempre en el mismo lugar.'), input);
    queueMicrotask(() => window.estudioEntrada && window.estudioEntrada(root));
    root.replaceChildren(
      h('div', { class: 'page-head row-between' }, h('div', {}, h('h1', {}, 'Talking Head'), h('p', {}, 'Tú hablas a cámara. El editor transcribe, te separa del fondo y propone títulos, subtítulos, zooms y sonidos. Tú ajustas lo que quieras.')),
        h('button', { class: 'btn ghost', onclick: () => abrirHoja('ajustes'), html: ic('ajustes', 16) + ' Ajustes' })),
      ...[!S.motorListo ? h('div', { class: 'callout warn' }, h('strong', {}, 'Falta instalar el motor. '), 'Haz doble clic en Instalar.command, que está en la carpeta del Estudio, y vuelve a abrir esta pantalla.') : null].filter(Boolean),
      zona,
      h('div', { class: 'voz-cta' }, h('span', {}, 'No sales en cámara?'), h('button', { type: 'button', class: 'btn ghost', onclick: pantallaVoz, html: ic('mic', 16) + ' Crear un video con solo tu voz' })),
      S.proyectos.length ? h('div', {}, h('h2', { class: 'sec' }, 'Tus proyectos'),
        h('ul', { class: 'plist grid' }, S.proyectos.slice().sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || ''))).map((p) => h('li', { class: 'pcard' },
          h('button', { class: 'pitem', onclick: () => abrir(p.id) },
            h('span', { class: 'pthumb' }, h('img', { src: `/api${A}/proyectos/${p.id}/miniatura`, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }), h('i', { html: ic('video', 22) })),
            h('span', { class: 'ptx' }, h('strong', {}, p.nombre), h('small', {}, `${p.tieneFinal ? 'Con video final' : p.analizado ? 'Analizado' : p.corriendo ? 'Procesando' : 'Sin analizar'}${p.creado ? ' · ' + new Date(p.creado).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : ''}`))),
          h('button', { class: 'ib pdup', title: 'Duplicar para probar otra versión', 'aria-label': `Duplicar ${p.nombre}`, onclick: async (e) => { e.stopPropagation(); await api(`${A}/proyectos/${p.id}/duplicar`, { method: 'POST' }); toast('Copia creada.'); inicio(); }, html: ic('copiar', 16) }))))) : ''); 
  }

  // ---------- voz en off: grabas o subes un audio y se convierte en video con fondo ----------
  async function pantallaVoz() {
    ESCIMG = await api(A + '/escenas').catch(() => []);
    let PLANT = await api(A + '/plantillas-voz').catch(() => []);
    const V = { plantilla: '', blob: null, nombre: '', fondo: 'cuadricula', c1: '#2b1b4d', c2: '#0b0b12', imagen: '', grabando: false, seg: 0 };
    let rec = null, chunks = [], timer = 0, stream = null, urlAudio = null;
    const parar = () => { clearInterval(timer); try { rec && rec.state !== 'inactive' && rec.stop(); } catch { /* ya parado */ } stream && stream.getTracks().forEach((t) => t.stop()); };
    const salir = () => { parar(); if (urlAudio) URL.revokeObjectURL(urlAudio); inicio(); };
    const REJ = (c, l) => `linear-gradient(${c} 1px, transparent 1px) 0 0/${l}px ${l}px, linear-gradient(90deg, ${c} 1px, transparent 1px) 0 0/${l}px ${l}px`;
    const fondoCss = () => V.fondo === 'blanco' ? '#fafaf8' : V.fondo === 'negro' ? '#0e0e0e' : V.fondo === 'cuadricula' ? `${REJ('#d8d8d3', 14)}, #fafaf8` : V.fondo === 'cuadnegra' ? `${REJ('#2e2e2e', 14)}, #0e0e0e` : V.fondo === 'color' ? V.c1 : V.fondo === 'imagen' && V.imagen ? `center/cover url(${escenaUrl(V.imagen)})` : `linear-gradient(170deg, ${V.c1}, ${V.c2})`;
    const caja = h('div', { class: 'card voz' });
    const poner = (blob, nombre) => { V.blob = blob; V.nombre = nombre; if (urlAudio) URL.revokeObjectURL(urlAudio); urlAudio = URL.createObjectURL(blob); pintarV(); };
    async function grabar() {
      if (V.grabando) { parar(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch { return toast('No pude usar el micrófono. Permite el acceso cuando el navegador lo pida, o sube un audio.'); }
      chunks = []; rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => { V.grabando = false; clearInterval(timer); const tipo = rec.mimeType || 'audio/webm'; poner(new Blob(chunks, { type: tipo }), 'grabacion.' + (/mp4/.test(tipo) ? 'm4a' : 'webm')); };
      V.grabando = true; V.seg = 0; rec.start(); timer = setInterval(() => { V.seg++; const t = caja.querySelector('.rec-t'); if (t) t.textContent = fmt(V.seg); }, 1000); pintarV();
    }
    const input = h('input', { type: 'file', accept: '.mp3,.wav,.m4a,.aac,.flac,.ogg,.webm,audio/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) poner(f, f.name); } });
    const inImg = h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp,image/*', hidden: true, onchange: (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (!/\.(png|jpe?g|webp)$/i.test(f.name)) return toast('Sirven imágenes png, jpg y webp.');
      const xhr = new XMLHttpRequest(); xhr.open('POST', `/api${A}/escenas/subir?nombre=${encodeURIComponent(f.name)}`); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.onload = async () => { let r = {}; try { r = JSON.parse(xhr.responseText); } catch {} if (r.nombre) { V.imagen = r.nombre; V.fondo = 'imagen'; ESCIMG = await api(A + '/escenas').catch(() => ESCIMG); pintarV(); } else toast(r.error || 'No pude subir la imagen.'); };
      xhr.send(f); } });
    function crear() {
      if (!V.blob) return toast('Graba tu voz o sube un audio primero.');
      const barra = h('div', { class: 'bar' }, h('i', { style: 'width:0%' }));
      root.replaceChildren(h('div', { class: 'card center' }, h('h2', {}, 'Subiendo tu voz'), barra, h('p', { class: 'sub' }, 'Después se arma el video y se transcribe tu voz. Pasa solo en tu computador.')));
      const q = new URLSearchParams({ nombre: V.nombre, titulo: V.nombre.startsWith('grabacion') ? 'Voz en off ' + new Date().toLocaleDateString('es') : V.nombre, fondo: V.fondo, c1: V.c1, c2: V.c2, imagen: V.imagen, plantilla: V.plantilla });
      const xhr = new XMLHttpRequest(); xhr.open('POST', `/api${A}/voz?${q}`); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => e.lengthComputable && (barra.firstChild.style.width = (100 * e.loaded / e.total) + '%');
      xhr.onload = () => { try { const r = JSON.parse(xhr.responseText); if (!r.id) throw new Error(r.error); abrir(r.id); } catch (e) { toast(e.message || 'No pude crear el video.'); inicio(); } };
      xhr.onerror = () => { toast('No pude subir el audio.'); inicio(); };
      xhr.send(V.blob);
    }
    function pintarV() {
      vista.style.background = fondoCss(); vista.style.color = claro() ? '#111' : '#fff'; vista.style.textShadow = claro() ? 'none' : '0 1px 8px rgba(0,0,0,.6)';
      caja.replaceChildren(
        h('div', { class: 'row-between' }, h('h2', {}, 'Video con solo tu voz'), h('button', { type: 'button', class: 'btn ghost sm', onclick: salir }, 'Volver')),
        h('p', { class: 'sub' }, 'Grabas o subes tu voz y el Estudio la convierte en un video vertical con el fondo que elijas. Después tienes todo: subtítulos, palabras grandes, escenas, música y sonidos.'),
        h('div', { class: 'voz-grid' },
          h('div', {},
            h('h3', {}, '1. Tu voz'),
            h('div', { class: 'row-gap' },
              h('button', { type: 'button', class: 'btn ' + (V.grabando ? 'danger' : 'gold'), onclick: grabar, html: ic('mic', 16) + (V.grabando ? ' Detener' : V.blob ? ' Grabar de nuevo' : ' Grabar con el micrófono') }),
              h('button', { type: 'button', class: 'btn ghost', onclick: () => { if (!V.grabando) input.click(); }, html: ic('publicar', 16) + ' Subir un audio' }), input),
            V.grabando ? h('p', { class: 'rec' }, h('i', { class: 'rec-dot' }), h('span', { class: 'rec-t' }, fmt(V.seg)), ' Grabando. Habla cerca del micrófono y pulsa Detener al terminar.') : null,
            V.blob && !V.grabando ? h('div', { class: 'voz-audio' }, h('small', {}, V.nombre), h('audio', { controls: true, src: urlAudio })) : null,
            PLANT.length ? h('div', { class: 'plantillas' },
              h('h3', { class: 'sep' }, 'Tus plantillas'),
              h('div', { class: 'chips' }, PLANT.map((t) => h('span', { class: 'chip-x' },
                h('button', { type: 'button', class: 'chip' + (V.plantilla === t.id ? ' on' : ''), 'aria-pressed': String(V.plantilla === t.id), title: 'Fondo, animaciones, estilo y música de esta plantilla',
                  onclick: () => { if (V.plantilla === t.id) { V.plantilla = ''; } else { V.plantilla = t.id; V.fondo = t.fondo; V.c1 = t.c1; V.c2 = t.c2; V.imagen = t.imagen || ''; } pintarV(); } }, t.nombre),
                h('button', { type: 'button', class: 'chip-del', 'aria-label': `Borrar la plantilla ${t.nombre}`, title: 'Borrar plantilla', onclick: async () => { if (!confirm(`Borrar la plantilla "${t.nombre}"?`)) return; await api(`${A}/plantillas-voz/${t.id}`, { method: 'DELETE' }); PLANT = PLANT.filter((x) => x.id !== t.id); if (V.plantilla === t.id) V.plantilla = ''; pintarV(); } }, '×')))),
              V.plantilla ? h('small', { class: 'hint' }, 'Al crear el video se aplican el fondo, las animaciones, el estilo del texto y la música de esta plantilla.') : null) : null,
            h('h3', { class: 'sep' }, '2. Fondo'),
            seg('', [['cuadricula', 'Cuadrícula'], ['blanco', 'Blanco'], ['negro', 'Negro'], ['cuadnegra', 'Cuadrícula negra'], ['degradado', 'Degradado'], ['color', 'Color'], ['imagen', 'Imagen']], V.fondo, (v) => { V.fondo = v; if (v === 'imagen' && !V.imagen) V.imagen = ESCIMG[0]?.nombre || ''; pintarV(); }),
            ['degradado', 'color'].includes(V.fondo) ? colorRow(V.fondo === 'color' ? 'Color' : 'Color de arriba', V.c1, PALETAS, (c) => { V.c1 = c; vista.style.background = fondoCss(); }) : null,
            V.fondo === 'degradado' ? colorRow('Color de abajo', V.c2, ['#0b0b12', '#000000', '#1a1a1a', '#4a1a1a', '#0f2a43'], (c) => { V.c2 = c; vista.style.background = fondoCss(); }) : null,
            V.fondo === 'imagen' ? h('div', { class: 'chips' }, ESCIMG.map((f) => h('button', { type: 'button', class: 'chip' + (V.imagen === f.nombre ? ' on' : ''), 'aria-pressed': String(V.imagen === f.nombre), onclick: () => { V.imagen = f.nombre; pintarV(); } }, f.nombre)),
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => inImg.click(), html: icon('plus') + ' Subir imagen' }), inImg) : null,
            h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn gold', disabled: !V.blob || V.grabando, onclick: crear, html: icon('check') + ' Crear el video' }))),
          vista));
    }
    const vista = h('div', { class: 'voz-vista', 'aria-label': 'Así se verá el fondo' }, h('span', {}, 'Tu voz'));
    const claro = () => ['blanco', 'cuadricula'].includes(V.fondo);
    vista.style.background = fondoCss();
    root.replaceChildren(caja); pintarV(); window.estudioEntrada && window.estudioEntrada(root);
  }

  // ---------- varios videos a la vez ----------
  const elegidos = (lista) => {
    const v = [...lista].filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v)$/i.test(f.name));
    if (v.length === 1) subir(v[0]); else if (v.length > 1) subirLote(v); else toast('Elige archivos de video.');
  };
  const subirUno = (file, onProg) => new Promise((ok, no) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${A}/subir?nombre=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProg(e.loaded / e.total);
    xhr.onload = () => { try { ok(JSON.parse(xhr.responseText).id); } catch { no(new Error('No pude subir ' + file.name)); } };
    xhr.onerror = () => no(new Error('No pude subir ' + file.name));
    xhr.send(file);
  });
  async function subirLote(files) {
    const barra = h('div', { class: 'bar' }, h('i', { style: 'width:0%' }));
    const txt = h('h2', {}, '');
    root.replaceChildren(h('div', { class: 'card center' }, txt, barra, h('p', { class: 'sub' }, 'Se copian a tu carpeta del Estudio. Los videos no salen de tu computador.')));
    const ids = [];
    try {
      for (let i = 0; i < files.length; i++) {
        txt.textContent = `Subiendo ${i + 1} de ${files.length}: ${files[i].name}`;
        ids.push(await subirUno(files[i], (f) => { barra.firstChild.style.width = (100 * f) + '%'; }));
      }
    } catch (e) { toast(e.message); }
    if (ids.length) pantallaLote(ids); else inicio();
  }
  async function pantallaLote(ids) {
    const propios = await api(A + '/looks').catch(() => []);
    const musica = await api(A + '/musica').catch(() => []);
    const o = { look: '', cortes: true, mejorar: true, musica: '', cierre: true, texto: 'Sígueme para más', sub: '' };
    const caja = h('div', { class: 'card' });
    const pintarOpc = () => caja.replaceChildren(
      h('h2', {}, `Ajustes para tus ${ids.length} videos`),
      h('p', { class: 'sub' }, 'Cada video se analiza, se edita con estos ajustes y se exporta en calidad final. Uno a la vez, sin que tengas que estar mirando.'),
      h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Look'), h('select', { onchange: (e) => { o.look = e.target.value; } },
        h('option', { value: '' }, 'Estilo por defecto'),
        ...LOOKS.map((l) => h('option', { value: 'b:' + l.id }, l.nombre)),
        ...propios.map((l) => h('option', { value: 'p:' + l.id }, 'Mío: ' + l.nombre)))),
      toggle('Quitar los silencios (ajuste normal)', o.cortes, (v) => { o.cortes = v; pintarOpc(); }),
      toggle('Mejorar mi voz', o.mejorar, (v) => { o.mejorar = v; pintarOpc(); }),
      h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Música de fondo'), h('select', { onchange: (e) => { o.musica = e.target.value; } },
        h('option', { value: '' }, 'Sin música'), ...musica.map((t) => h('option', { value: t.nombre }, t.nombre)))),
      toggle('Tarjeta de cierre', o.cierre, (v) => { o.cierre = v; pintarOpc(); }),
      ...(o.cierre ? [
        h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Texto del cierre'), h('input', { value: o.texto, oninput: (e) => { o.texto = e.target.value; } })),
        h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Línea de apoyo (por ejemplo tu usuario)'), h('input', { value: o.sub, oninput: (e) => { o.sub = e.target.value; } }))] : []),
      h('div', { class: 'row-gap' },
        h('button', { class: 'btn gold', onclick: iniciar }, `Procesar ${ids.length} videos`),
        h('button', { class: 'btn ghost', onclick: inicio }, 'Cancelar')));
    const iniciar = async () => {
      let style = {};
      if (o.look.startsWith('b:')) { const l = LOOKS.find((x) => 'b:' + x.id === o.look); style = structuredClone(l.patch); }
      if (o.look.startsWith('p:')) style = structuredClone(propios.find((x) => 'p:' + x.id === o.look).style);
      const ajustes = { style, cortes: o.cortes ? { on: true, modo: 'palabras', ...PRESETS_PAUSA[1][3], fundido: 12, ignorar: [], manual: [], rangos: [], auto: true } : { on: false }, audio: { mejorar: o.mejorar, musica: { archivo: o.musica } },
        cierre: { on: o.cierre, texto: o.texto, sub: o.sub } };
      try { await api(A + '/cola', { method: 'POST', body: { ids, ajustes } }); } catch (e) { return toast(e.message); }
      seguirCola(ids);
    };
    root.replaceChildren(h('div', { class: 'page-head' }, h('h1', {}, 'Varios videos'), h('p', {}, 'Elige cómo quedan todos y sigue con otra cosa mientras se procesan.')), caja);
    pintarOpc();
  }
  async function seguirCola(ids) {
    stopPoll();
    const lista = h('ul', { class: 'plist' });
    const pintar = async () => {
      const c = (await api(A + '/cola').catch(() => [])).filter((x) => ids.includes(x.id));
      const ET = { espera: 'En espera', analizando: 'Analizando', exportando: 'Exportando video final', listo: 'Listo', error: 'Error, revisa motor.log del proyecto' };
      lista.replaceChildren(...c.map((x) => h('li', {}, h('button', { class: 'pitem', onclick: () => { stopPoll(); abrir(x.id); } }, h('strong', {}, x.nombre), h('small', {}, ET[x.estado] || x.estado)))));
      if (c.length && c.every((x) => ['listo', 'error'].includes(x.estado))) { stopPoll(); toast('Terminé con todos los videos.'); }
    };
    root.replaceChildren(h('div', { class: 'page-head' }, h('h1', {}, 'Procesando'), h('p', {}, 'Puedes dejar esta pantalla abierta o volver más tarde. Abre cada video cuando esté listo para ver el final y generar su caption.')), lista,
      h('div', {}, h('button', { class: 'btn ghost', onclick: () => { stopPoll(); inicio(); } }, 'Volver a mis proyectos')));
    await pintar();
    S.poll = setInterval(pintar, 3000);
  }

  function subir(file) {
    const barra = h('div', { class: 'bar' }, h('i', { style: 'width:0%' }));
    root.replaceChildren(h('div', { class: 'card center' }, h('h2', {}, 'Subiendo ' + file.name), barra, h('p', { class: 'sub' }, 'Se copia a tu carpeta del Estudio. El video no sale de tu computador.')));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${A}/subir?nombre=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && (barra.firstChild.style.width = (100 * e.loaded / e.total) + '%');
    xhr.onload = () => { try { abrir(JSON.parse(xhr.responseText).id); } catch { toast('No pude subir el video.'); inicio(); } };
    xhr.onerror = () => { toast('No pude subir el video.'); inicio(); };
    xhr.send(file);
  }

  // ---------- proyecto ----------
  async function abrir(id) {
    S.p = await api(`${A}/proyectos/${id}`);
    ESCIMG = await api(A + '/escenas').catch(() => []);
    COMBOS = await api(A + '/combos').catch(() => COMBOS);
    SFXU = await api(A + '/sfx').catch(() => []);
    prepararPlan(S.p);
    S.dim = await dimsVideo(`/api${A}/proyectos/${id}/video/source`);
    if (S.p.plan && !S.p.plan.formato) S.p.plan.formato = S.dim ? formatoAuto(S.dim.w, S.dim.h) : '9x16';  // un original horizontal se edita horizontal
    if (S.p.plan && !S.p.plan.encuadre) S.p.plan.encuadre = { x: 0.5, y: 0.4 };
    S.env = null; S.panel = null; S.inline = null;
    S.tab = S.p.plan && S.p.tieneAlpha ? 'live' : 'source';
    S.bust = Date.now(); S.dirty = false; S.sel = new Set(); S.abiertos = new Set(); S.guion = null; S.aprender = null;
    if (S.pl) { S.pl.live.destroy(); S.pl = null; }
    try { S.paso = localStorage.getItem('estudio.paso.' + id) || 'recorte'; } catch { S.paso = 'recorte'; }
    if (!PASOS.some((x) => x.id === S.paso)) S.paso = 'recorte';
    if (S.p.plan) reiniciarHist();
    if (S.p.corriendo) iniciarPoll();
    pintar();
  }
  function prepararPlan(p) {
    if (!p.plan) return;
    p.plan.style = fusionar(DEF, p.plan.style);
    p.plan.cortes = fusionar(CORTES_DEF, p.plan.cortes);
    p.plan.audio = fusionar(AUDIO_DEF, p.plan.audio);
    p.plan.cierre = fusionar(CIERRE_DEF, p.plan.cierre);
    const st = p.plan.style;
    if (st.mismaEsp === undefined) st.mismaEsp = !st.emphFont && !st.subs.emphFont;
    if (st.imagen.bloom > 0.02 && !st.pelicula.on) { st.pelicula = { ...st.pelicula, on: true, bloom: st.imagen.bloom, halacion: 0, grano: 0, desvanecido: 0, calidez: 0 }; }
    st.imagen.bloom = 0;
    // el estilo guardado como punto de partida se aplica una sola vez, al abrir por primera vez un video analizado
    if (!p.plan.estiloAplicado) {
      p.plan.estiloAplicado = true;
      const base = (S.aj.estilos || []).find((x) => x.id === S.aj.estiloDefecto);
      if (base) { const fuentesOk = (f) => !f || !S.fuentes.length || S.fuentes.includes(f); const e = structuredClone(base.style); if (!fuentesOk(e.font)) delete e.font; p.plan.style = fusionar(st, e); }
    }
  }
  // Tiempo del video original convertido al tiempo del video con cortes (para saltar en la vista previa o el final).
  const tVideo = (t) => {
    const rs = quitadosTodos();
    if (S.tab === 'source' || S.tab === 'live' || !rs.length) return t;
    let quitado = 0;
    for (const [s, e] of rs) { if (t >= e) quitado += e - s; else if (t > s) quitado += t - s; }
    return Math.max(0, t - quitado);
  };
  const vurl = (cual) => `/api${A}/proyectos/${S.p.id}/video/${cual}?v=${S.bust}`;
  const plan = () => S.p.plan;
  // Guarda el texto corregido. En voz en off el servidor rehace las frases animadas con el texto nuevo y devuelve el plan.
  async function guardarPalabras(words) {
    const r = await api(`${A}/proyectos/${S.p.id}/palabras`, { method: 'PUT', body: esVoz() ? { words, plan: S.p.plan } : { words } });
    if (r && r.plan) S.p.plan = r.plan;
    return r;
  }
  const estilo = () => S.p.plan.style;
  function guardarPlan() {
    clearTimeout(S.guardar);
    marcarCambios();
    S.guardar = setTimeout(() => api(`${A}/proyectos/${S.p.id}/plan`, { method: 'PUT', body: plan() }).catch(() => toast('No pude guardar los cambios.')), 400);
  }
  function marcarCambios() { const el = document.getElementById('th-dirty'); if (el) el.hidden = !S.dirty || S.tab === 'live'; }
  const ordenar = () => plan().events.sort((a, b) => a.start - b.start).filter((e) => !e.kind);

  function stopPoll() { clearInterval(S.poll); S.poll = null; }
  function iniciarPoll() {
    stopPoll();
    S.poll = setInterval(async () => {
      const r = await api(`${A}/proyectos/${S.p.id}/estado`).catch(() => null);
      if (!r) return;
      S.p.status = r.status; S.p.corriendo = r.corriendo;
      if (!r.corriendo) {
        stopPoll();
        const eraRender = r.status?.etapa === 'listo' && !/^(subtitulos\.srt|final_|export\/)/.test(r.status?.msg || '');
        const d = await api(`${A}/proyectos/${S.p.id}`);
        prepararPlan(d);
        S.p = d; S.bust = Date.now();
        if (eraRender) { S.tab = d.plan && d.tieneAlpha ? 'live' : 'source'; S.verResultado = d.tieneFinal ? 'final' : 'preview'; S.dirty = false; avisar(S.pidioFinal ? 'Tu video final está listo.' : 'Tu vista previa está lista.'); }
        S.pidioFinal = false; S.sel = new Set(); pintar(); if (!eraRender && r.status?.etapa === 'listo') toast('Listo. Ya puedes descargarlo.');
        if (S.verResultado) { const q = S.verResultado; S.verResultado = null; verResultado(q); }
        if (r.status?.error) toast(r.status.error);
      } else actualizarProgreso();
    }, 1200);
  }
  function actualizarProgreso() {
    const el = document.getElementById('th-prog'); if (!el) return;
    const st = S.p.status || {};
    el.querySelector('strong').textContent = ETAPAS[st.etapa] || 'Trabajando';
    el.querySelector('small').textContent = st.msg || '';
    el.querySelector('.bar i').style.width = (st.pct || 0) + '%';
  }
  const progreso = () => h('div', { class: 'card center', id: 'th-prog', role: 'status' }, h('strong', {}, 'Trabajando'), h('div', { class: 'bar' }, h('i', { style: 'width:0%' })), h('small', {}, ''));

  async function lanzar(ruta, body, pidioFinal) {
    try {
      if (ruta === 'renderizar' && S.aj.notificar && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      await guardarYa();
      await api(`${A}/proyectos/${S.p.id}/${ruta}`, { method: 'POST', body });
      S.p.corriendo = true; S.pidioFinal = !!pidioFinal; pintar(); iniciarPoll();
    } catch (e) { toast(e.message); }
  }
  async function guardarYa() { clearTimeout(S.guardar); await api(`${A}/proyectos/${S.p.id}/plan`, { method: 'PUT', body: plan() }); }

  function pintar() {
    const p = S.p;
    const cab = h('div', { class: 'row-between' },
      h('button', { class: 'btn ghost sm', onclick: inicio, html: ic('izq', 16) + ' Proyectos' }),
      h('div', { class: 'row-gap' },
        h('button', { class: 'btn ghost sm', onclick: () => abrirHoja('ajustes'), html: ic('ajustes', 16) + ' Ajustes' }),
        h('button', { class: 'btn ghost sm', title: 'Hacer una copia para probar otra versión', onclick: async () => { const r = await api(`${A}/proyectos/${p.id}/duplicar`, { method: 'POST' }); toast('Copia creada.'); abrir(r.id); }, html: ic('copiar', 16) + ' Duplicar' }),
        h('button', { class: 'btn danger sm', onclick: async () => { if (confirm('¿Borrar este proyecto y sus videos?')) { await api(`${A}/proyectos/${p.id}`, { method: 'DELETE' }); inicio(); } }, html: icon('trash') + ' Borrar' })));
    const titulo = h('div', { class: 'page-head' }, h('h1', {}, p.nombre));
    if (p.corriendo) return root.replaceChildren(cab, titulo, progreso()), actualizarProgreso();
    if (!p.analizado) {
      return root.replaceChildren(cab, titulo, h('div', { class: 'card center' },
        h('h2', {}, 'Primer paso: analizar el video'),
        p.status?.error ? h('div', { class: 'callout warn' }, p.status.error) : null,
        h('p', { class: 'sub' }, 'El editor transcribe cada palabra, te separa del fondo y propone títulos, subtítulos, zooms y sonidos. La primera vez descarga el modelo de voz. Puedes dejarlo trabajando.'),
        h('button', { class: 'btn gold', onclick: () => lanzar('analizar', {}), html: icon('play') + ' Analizar video' })));
    }
    root.style.setProperty('--asp', FMT_ASP[(S.p.plan && S.p.plan.formato) || '9x16']);
    root.replaceChildren(cab, titulo, h('div', { class: 'ed ' + (S.vista || 'normal') + (S.p.plan && S.p.plan.formato === '16x9' && S.tab !== 'source' ? ' ancho' : '') }, columnaVideo(), colSet(), timeline ? timeline.el : null));
    decorar(root);
    if (S.panel) montarHoja();
  }

  // ---------- video + zona segura ----------
  function zonaSegura(kind) {
    if (kind === 'none') return null;
    const W = 1080, H = 1920, tk = kind === 'tiktok';
    // Márgenes seguros: arriba, abajo y la columna de botones de la derecha
    const T = tk ? { top: 150, bot: 470, right: 140, ry: 960 } : { top: 220, bot: 420, right: 130, ry: 1000 };
    const P = {
      heart: 'M12 21s-7-4.4-9.300-9C1.200 8.800 3.300 5 7 5c2 0 3.400 1 5 3 1.600-2 3-3 5-3 3.700 0 5.800 3.800 4.300 7C19 16.600 12 21 12 21z',
      chat: 'M4 5h16v11H9l-5 4z', mark: 'M6 3h12v18l-6-4-6 4z', share: 'M13 4l8 7-8 7v-4c-6 0-9 2-11 5 1-6 4-10 11-11z',
      plane: 'M3 11l18-8-6 18-4-7zM11 14l10-11', dots: 'M5 12h.01M12 12h.01M19 12h.01', cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.500 3.500 0 100-7 3.500 3.500 0 000 7z',
      search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5', home: 'M4 11l8-7 8 7v9H4z', plus: 'M12 5v14M5 12h14', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-5 4-7 8-7s7 2 8 7',
      people: 'M9 11a3.500 3.500 0 100-7 3.500 3.500 0 000 7zM2 20c1-4 3-6 7-6s6 2 7 6M17 5a3 3 0 010 6M19 14c2 1 3 3 3 6', inbox: 'M4 5h16v11H8l-4 4z', reel: 'M4 4h16v16H4zM4 9h16M9 4l3 5M15 4l3 5M10 12l5 3-5 3z',
    };
    const ico = (n, cx, cy, size, fill) => `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})" fill="${fill ? '#fff' : 'none'}" stroke="#fff" stroke-width="${fill ? 0 : 1.8}" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n]}"/></g>`;
    const tx = (x, y, t, size, w = 500, anchor = 'start', op = 1) => `<text x="${x}" y="${y}" fill="#fff" font-size="${size}" font-family="Poppins, sans-serif" font-weight="${w}" text-anchor="${anchor}" opacity="${op}">${t}</text>`;
    const rx = W - T.right / 2 - 6;
    let ui = '';
    if (tk) {
      ui += tx(W / 2 - 150, 128, 'Siguiendo', 44, 500, 'middle', 0.65) + tx(W / 2 + 120, 128, 'Para ti', 44, 700, 'middle') + `<rect x="${W / 2 + 80}" y="146" width="80" height="6" rx="3" fill="#fff"/>` + ico('search', W - 80, 112, 56);
      const ys = [1010, 1190, 1350, 1500, 1650];
      ui += `<circle cx="${rx}" cy="${ys[0]}" r="52" fill="#7a7a7a" stroke="#fff" stroke-width="5"/><circle cx="${rx}" cy="${ys[0] + 52}" r="20" fill="#fe2c55"/>${ico('plus', rx, ys[0] + 52, 22)}`;
      ui += ico('heart', rx, ys[1], 78, true) + tx(rx, ys[1] + 78, '12,4 mil', 28, 600, 'middle');
      ui += ico('chat', rx, ys[2], 78, true) + tx(rx, ys[2] + 78, '318', 28, 600, 'middle');
      ui += ico('mark', rx, ys[3], 70, true) + tx(rx, ys[3] + 74, '2,1 mil', 28, 600, 'middle');
      ui += ico('share', rx, ys[4], 74, true) + tx(rx, ys[4] + 76, '540', 28, 600, 'middle');
      const by = H - 300;
      ui += tx(48, by - 70, '@tuusuario', 40, 700) + tx(48, by - 14, 'Aquí va la descripción del video con', 34, 400, 'start', 0.95) + tx(48, by + 34, 'sus hashtags #marketing #fotografia', 34, 400, 'start', 0.95);
      ui += ico('plus', 66, by + 100, 34) + tx(100, by + 112, 'Sonido original · tuusuario', 32, 500, 'start', 0.9);
      const nav = [['home', 'Inicio'], ['people', 'Amigos'], ['plus', ''], ['inbox', 'Bandeja'], ['user', 'Perfil']];
      ui += `<rect x="0" y="${H - 150}" width="${W}" height="150" fill="#000" opacity=".82"/>`;
      nav.forEach(([n, l], i) => { const cx = 108 + i * 216; if (n === 'plus') ui += `<rect x="${cx - 62}" y="${H - 118}" width="124" height="80" rx="22" fill="#fff"/><g transform="translate(${cx - 18} ${H - 98}) scale(1.5)" stroke="#000" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="${P.plus}"/></g>`; else ui += ico(n, cx, H - 98, 52) + tx(cx, H - 36, l, 26, 500, 'middle', i === 0 ? 1 : 0.7); });
    } else {
      ui += tx(54, 150, 'Reels', 52, 700) + ico('cam', W - 80, 134, 60);
      const ys = [1120, 1290, 1450, 1590];
      ui += ico('heart', rx, ys[0], 74) + tx(rx, ys[0] + 74, '12,4 mil', 28, 600, 'middle');
      ui += ico('chat', rx, ys[1], 70) + tx(rx, ys[1] + 74, '318', 28, 600, 'middle');
      ui += ico('plane', rx, ys[2], 70) + tx(rx, ys[2] + 74, '540', 28, 600, 'middle');
      ui += ico('dots', rx, ys[3], 70);
      ui += `<rect x="${rx - 34}" y="${H - 330}" width="68" height="68" rx="14" fill="#7a7a7a" stroke="#fff" stroke-width="5"/>`;
      const by = H - 300;
      ui += `<circle cx="84" cy="${by - 56}" r="38" fill="#7a7a7a" stroke="#fff" stroke-width="4"/>` + tx(142, by - 44, 'tuusuario', 38, 700) + `<rect x="430" y="${by - 88}" width="150" height="56" rx="14" fill="none" stroke="#fff" stroke-width="3"/>` + tx(505, by - 48, 'Seguir', 30, 600, 'middle');
      ui += tx(48, by + 20, 'Aquí va la descripción del video con...', 34, 400, 'start', 0.95) + tx(48, by + 84, '♪ Audio original · tuusuario', 32, 500, 'start', 0.9);
      const nav = ['home', 'reel', 'plane', 'search', 'user'];
      ui += `<rect x="0" y="${H - 130}" width="${W}" height="130" fill="#000" opacity=".82"/>`;
      nav.forEach((n, i) => { ui += ico(n, 108 + i * 216, H - 62, 54); });
    }
    const svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs><linearGradient id="zg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
      <rect x="0" y="${H - 760}" width="${W}" height="760" fill="url(#zg)"/>
      <g fill="#ff3b3b" opacity=".11"><rect x="0" y="0" width="${W}" height="${T.top}"/><rect x="0" y="${H - T.bot}" width="${W}" height="${T.bot}"/><rect x="${W - T.right}" y="${T.ry}" width="${T.right}" height="${H - T.bot - T.ry}"/></g>
      <g stroke="#fff" stroke-width="4" stroke-dasharray="18 14" opacity=".7" fill="none"><line x1="0" y1="${T.top}" x2="${W}" y2="${T.top}"/><line x1="0" y1="${H - T.bot}" x2="${W}" y2="${H - T.bot}"/><line x1="${W - T.right}" y1="${T.ry}" x2="${W - T.right}" y2="${H - T.bot}"/></g>
      ${ui}
      ${tx(W / 2, H - T.bot - 24, 'Lo que está arriba de esta línea se lee seguro', 32, 500, 'middle', 0.95)}</svg>`;
    return h('div', { class: 'zona', html: svg });
  }

  // Mantén pulsado para ver el video sin efectos (o la tecla B).
  function botonAntes() {
    const b = h('button', { type: 'button', class: 'btn ghost sm btn-antes', title: 'Mantén pulsado para ver cómo se grabó, sin ningún efecto. También sirve la tecla B.', 'aria-label': 'Mantén pulsado para ver el antes', html: ic('ojo', 15) + '<span>Mantén para ver el antes</span>' });
    const on = (v) => { if (live) live.antes(v); b.classList.toggle('activo', v); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch { /* sin puntero activo */ } on(true); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => on(false));
    b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); on(true); } });
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') on(false); });
    if (antesTecla) { document.removeEventListener('keydown', antesTecla.d); document.removeEventListener('keyup', antesTecla.u); }
    const tipeando = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    antesTecla = { d: (e) => { if ((e.key === 'b' || e.key === 'B') && !e.metaKey && !e.ctrlKey && !e.repeat && !tipeando(e)) on(true); }, u: (e) => { if (e.key === 'b' || e.key === 'B') on(false); } };
    document.addEventListener('keydown', antesTecla.d); document.addEventListener('keyup', antesTecla.u);
    return b;
  }
  let antesTecla = null;
  function verResultado(tipo) {
    document.querySelectorAll('.resultado-fondo').forEach((x) => x.remove());
    const cerrar = () => { fondo.classList.add('sale'); document.removeEventListener('keydown', esc); setTimeout(() => fondo.remove(), 170); };
    const esc = (e) => e.key === 'Escape' && cerrar();
    const v = h('video', { controls: true, autoplay: true, playsinline: true, src: vurl(tipo), class: 'resultado-video' });
    const fondo = h('div', { class: 'resultado-fondo', onclick: (e) => e.target === fondo && cerrar() },
      h('div', { class: 'resultado', role: 'dialog', 'aria-modal': 'true', 'aria-label': tipo === 'final' ? 'Video final' : 'Vista previa' },
        h('div', { class: 'row-between' }, h('h2', {}, tipo === 'final' ? 'Tu video final' : 'Tu vista previa'), h('button', { type: 'button', class: 'ib', 'aria-label': 'Cerrar', onclick: cerrar, html: ic('x', 16) || icon('x') })),
        v,
        h('div', { class: 'row-gap' }, tipo === 'final' ? h('a', { class: 'btn gold', href: vurl('final'), download: `${S.p.nombre}-editado.mp4`, html: ic('descargar', 16) + ' Descargar video final' }) : h('button', { type: 'button', class: 'btn gold', onclick: () => { cerrar(); lanzar('renderizar', { calidad: 'final' }, true); }, html: icon('check') + ` Exportar final ${etqSalida(S.p.plan)}` }),
          h('button', { type: 'button', class: 'btn ghost', onclick: cerrar }, 'Seguir editando'))));
    document.body.append(fondo); document.addEventListener('keydown', esc); v.focus?.();
  }
  function columnaVideo() {
    const p = S.p;
    if (S.tab === 'live' && !(p.plan && p.tieneAlpha)) S.tab = 'source';
    if (live) { live.destroy(); live = null; }
    if (medidor) { medidor.destroy(); medidor = null; }
    if (timeline) { timeline.destroy(); timeline = null; }
    let pantalla;
    if (S.tab === 'live') {
      live = crearLive({ onEdit: () => cambio(), h, srcUrl: vurl('source'), alphaUrl: vurl('alpha'), getPlan: plan, getWords: () => S.p.palabras || [], fam, sfxBase: '/m/talking-head/assets/sfx', escenaUrl, sfxUserUrl: (n) => `/api${A}/sfx/${encodeURIComponent(n)}`, musicUrl: (n) => `/api${A}/musica/${encodeURIComponent(n)}` });
      video = live.video; pantalla = live.el;
    } else {
      video = h('video', { controls: true, playsinline: true, src: vurl(S.tab), class: 'player', onloadedmetadata: (e) => { const vw = e.target.videoWidth, vh = e.target.videoHeight; if (vw) { const ph = e.target.closest('.phone'); ph.style.aspectRatio = `${vw} / ${vh}`; ph.classList.toggle('ancho', vw / vh > 1.2); e.target.closest('.ed')?.classList.toggle('ancho', vw / vh > 1.2); } } }); pantalla = video;
    }
    const fmP = S.tab !== 'source' && S.p.plan ? (S.p.plan.formato || '9x16') : null;
    const phone = h('div', { class: 'phone' + (fmP === '16x9' ? ' ancho' : ''), style: fmP ? `aspect-ratio: ${FMT_ASP[fmP]}` : '' }, pantalla, zonaSegura(fmP && fmP !== '9x16' ? 'none' : S.zona));
    let medidorOn = true; try { medidorOn = localStorage.getItem('estudio.medidor') !== '0'; } catch { /* sin memoria */ }
    if (S.tab === 'live' && medidorOn) medidor = crearMedidor({ h, fuente: () => live && live.medidor && live.medidor() });
    if (S.tab === 'live') {
      timeline = crearTimeline({ h, getPlan: plan, getWords: () => S.p.palabras || [], getEnv: () => S.env, getVideo: () => video, kinds: KINDS, unirR, irPaso, onCambio: () => cambio(), onIr: (t) => live && live.ir(t), onSeleccion: (sel) => { S.selTL = sel; if (sel) abrirHoja('propiedades'); else if (S.panel === 'propiedades') pintarPanel(); } });
      if (!S.env) api(`${A}/proyectos/${S.p.id}/envolvente`).then((e) => { S.env = e; if (timeline) timeline.pintar(); }).catch(() => {});
    }
    const pantallaYMedidor = medidor ? h('div', { class: 'pantalla-y-medidor' }, phone, medidor.el) : phone;
    lineaEl = S.tab === 'live' ? h('div', { class: 'ltime', role: 'slider', 'aria-label': 'Línea de tiempo del video', tabindex: '0',
      onpointerdown: (e) => { const mover = (ev) => { const r = lineaEl.getBoundingClientRect(); const t = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * plan().duration; if (live) live.ir(t); pintarCabeza(); }; mover(e); lineaEl.setPointerCapture(e.pointerId); lineaEl.onpointermove = mover; lineaEl.onpointerup = () => { lineaEl.onpointermove = null; }; } }) : null;
    clearInterval(tlTimer);
    if (lineaEl) tlTimer = setInterval(() => { if (!lineaEl || !lineaEl.isConnected) return clearInterval(tlTimer); pintarCabeza(); }, 80);
    setTimeout(pintarLinea, 0);
    return h('div', { class: 'col-video' },
      h('div', { class: 'vbar' },
        S.tab === 'live' ? botonAntes() : h('span', {}),
        h('div', { class: 'vtools' },
          h('button', { type: 'button', class: 'ib' + (S.vista === 'grande' ? ' on' : ''), title: 'Video más grande', 'aria-label': 'Video más grande', 'aria-pressed': String(S.vista === 'grande'), onclick: () => cambiarVista(S.vista === 'grande' ? 'normal' : 'grande'), html: ic('zoom', 16) }),
          S.tab === 'live' ? h('button', { type: 'button', class: 'ib med-btn' + (medidor ? ' on' : ''), title: 'Medidor de sonido', 'aria-label': 'Medidor de sonido', 'aria-pressed': String(!!medidor), onclick: () => { try { localStorage.setItem('estudio.medidor', medidorOn ? '0' : '1'); } catch { /* sin memoria */ } pintar(); }, html: ic('onda', 16) }) : null,
          h('button', { type: 'button', class: 'ib' + (S.vista === 'solo' ? ' on' : ''), title: 'Ocultar los ajustes y ver solo el video', 'aria-label': 'Ocultar los ajustes', 'aria-pressed': String(S.vista === 'solo'), onclick: () => cambiarVista(S.vista === 'solo' ? 'normal' : 'solo'), html: ic('ojo', 16) }),
          h('button', { type: 'button', id: 'th-undo', class: 'ib', title: 'Deshacer (Cmd+Z)', 'aria-label': 'Deshacer', disabled: Hist.i <= 0, onclick: () => viajar(-1), html: ic('deshacer', 16) }),
          h('button', { type: 'button', id: 'th-redo', class: 'ib', title: 'Rehacer (Cmd+Shift+Z)', 'aria-label': 'Rehacer', disabled: Hist.i >= Hist.pila.length - 1, onclick: () => viajar(1), html: ic('rehacer', 16) }))),
      pantallaYMedidor,
      lineaEl,
      S.tab === 'live' ? h('p', { class: 'hint center-t' }, 'Arrastra un texto del video para moverlo. Espacio reproduce, las flechas avanzan.') : null,
      fmP && fmP !== '9x16' ? null : seg('Zona segura', [['none', 'Ninguna'], ['tiktok', 'TikTok'], ['reels', 'Reels']], S.zona, (v) => { S.zona = v; const z = zonaSegura(v); phone.querySelector('.zona')?.remove(); if (z) phone.append(z); document.querySelectorAll('.col-video .seg-b').forEach((b) => { b.classList.toggle('on', b.textContent === ({ none: 'Ninguna', tiktok: 'TikTok', reels: 'Reels' }[v])); b.setAttribute('aria-checked', String(b.classList.contains('on'))); }); }),
      h('p', { id: 'th-dirty', class: 'dirty', hidden: true }, ''),
      h('div', { class: 'actions col sticky-ex' },
        h('button', { class: 'btn gold', onclick: () => lanzar('renderizar', { calidad: 'final' }, true), html: icon('check') + ` Exportar video ${etqSalida(S.p.plan)}` }),
        p.tieneFinal ? h('button', { class: 'btn ghost', onclick: () => verResultado('final'), html: ic('pelicula', 16) + ' Ver el último video exportado' }) : null,
        h('button', { class: 'btn ghost', onclick: () => abrirHoja('exportar'), html: ic('descargar', 16) + ' Más formatos' }),
        h('p', { class: 'sub ex-nota' }, 'Lo que ves arriba es el video tal como saldrá, con tus ajustes, sonidos y música, y se actualiza al instante.')));
  }
  // ---------- línea de tiempo: títulos, zooms, cámara lenta y cortes de un vistazo ----------
  function pintarLinea() {
    if (timeline) timeline.pintar();
    if (!lineaEl || !lineaEl.isConnected || !S.p || !S.p.plan) return;
    const P = plan(), d = P.duration || 1, pc = (t) => `${(Math.max(0, Math.min(d, t)) / d) * 100}%`;
    const marca = (cls, a, b, tt) => h('i', { class: cls, title: tt, style: `left:${pc(a)};width:${b == null ? '2px' : `calc(${pc(b)} - ${pc(a)})`}` });
    const els = [];
    if (P.cortes && P.cortes.on) (P.cortes.rangos || []).forEach(([a, b]) => els.push(marca('m-corte', a, b, 'Silencio que se corta')));
    ((P.cortes && P.cortes.borradas) || []).forEach(([a, b]) => els.push(marca('m-borrada', a, b, 'Quitado con el texto')));
    (P.lentos || []).forEach((l) => els.push(marca('m-lento', l.start, l.end, 'Cámara lenta')));
    P.events.forEach((e) => els.push(marca(e.kind ? 'm-esp' : 'm-tit', e.start, e.end, e.kind ? 'Elemento' : e.text.replace(/\*/g, ''))));
    (P.zooms || []).forEach((z) => els.push(marca('m-zoom', z.t, null, 'Zoom')));
    lineaEl.replaceChildren(...els, h('b', { class: 'cabeza' }));
    pintarCabeza();
  }
  function pintarCabeza() {
    const c = lineaEl && lineaEl.querySelector('.cabeza');
    if (c && video && S.p && S.p.plan) c.style.left = `${Math.min(100, ((video.currentTime || 0) / (plan().duration || 1)) * 100)}%`;
  }
  const tiempoActual = () => (video && S.tab !== 'final' ? video.currentTime : 0);

  // ---------- pasos, tarjetas y hojas ----------
  const ALTURA_POS = { detras: 0.19, arriba: 0.17, centro: 0.53, abajo: 0.62 };
  const FONDO_TXT = { titulos: 'Solo con palabras detrás de ti', siempre: 'Todo el video', bordes: 'Solo los bordes', off: 'Sin desenfoque' };
  let tilesEl = null;
  function datosTarjetas() {
    const P = plan(), st = estilo(), sb = st.subs, a = P.audio, pe = st.pelicula;
    const nFra = P.events.filter((e) => e.kind === 'frase').length, nEsp = P.events.filter((e) => e.kind && e.kind !== 'frase').length, nTit = P.events.filter((e) => !e.kind).length;
    const lentos = (P.lentos || []).length;
    return [
      { id: 'capas', n: 'Todas mis capas', r: P.events.length ? `${P.events.length} elementos, todos editables` : 'Lo que agregues aparece aquí' },
      { id: 'frases', n: 'Frases animadas', r: nFra ? `${nFra} frases · ${(P.voz && P.voz.secuencia === 'unico') ? 'misma animación' : 'una distinta en cada frase'}` : 'Texto que se arma con tu voz' },
      { id: 'titulos', n: 'Palabras grandes', sw: [st.titulos, (v) => { st.titulos = v; }], r: st.titulos ? `${nTit} palabras enormes · ${nombreFuente(st.font)}` : 'Apagadas' },
      { id: 'subs', n: 'Subtítulos', sw: [sb.on, (v) => { sb.on = v; }], r: sb.on ? `Texto de abajo · ${nombreFuente(sb.font)} · ${sb.maxPal} por bloque` : 'Apagados' },
      { id: 'elementos', n: 'Elementos', r: nEsp ? `${nEsp} en tu video` : 'Listas, números, barras y más' },
      { id: 'formato', n: 'Formato del video', r: `${(FORMATOS_UI.find((f) => f[0] === (P.formato || '9x16')) || FORMATOS_UI[0])[1]} · ${etqSalida(P)}` },
      { id: 'camara', n: 'Zoom y cámara lenta', sw: [st.zooms, (v) => { st.zooms = v; }], r: (st.zooms ? `Zoom ${st.zoomEstilo}` : 'Sin zoom') + (lentos ? ` · ${lentos} en cámara lenta` : '') },
      { id: 'fondo', n: 'Fondo desenfocado', r: FONDO_TXT[st.fondoModo] + (st.motionBlur > 0.03 ? ' · con estela' : '') },
      { id: 'look', n: 'Color y contraste', r: 'Looks guardados, contraste y viñeta' },
      { id: 'pelicula', n: 'Look de película', sw: [pe.on, (v) => { pe.on = v; }], r: pe.on ? `Brillo en luces ${Math.round(pe.bloom * 100)}% · grano ${Math.round(pe.grano * 100)}%` : 'Apagado' },
      { id: 'audio', n: 'Voz y música', sw: [a.mejorar, (v) => { a.mejorar = v; }], r: (a.mejorar ? 'Voz mejorada' : 'Voz original') + (a.musica && a.musica.archivo ? ' y música' : '') },
      { id: 'sonidos', n: 'Efectos de sonido', sw: [st.sonidos, (v) => { st.sonidos = v; }], r: st.sonidos ? `Títulos: ${nombreSfx(st.sonidoTitulos)} · zoom: ${nombreSfx(st.sfxZoom)}` : 'Apagados' },
      { id: 'cierre', n: 'Tarjeta final', sw: [P.cierre.on, (v) => { P.cierre.on = v; }], r: P.cierre.on ? 'Con llamado a la acción' : 'Sin tarjeta final' },
      { id: 'publicar', n: 'Portada y caption', r: 'Elige el mejor momento y escribe el texto' },
    ];
  }
  const esVoz = () => !!(S.p && S.p.tipo === 'voz');
  const tarjetasVisibles = () => datosTarjetas().filter((t) => (esVoz() ? !['titulos', 'camara', 'fondo', 'formato'].includes(t.id) : t.id !== 'frases'));
  const PASOS = [
    { id: 'recorte', n: 'Recortar', r: 'Qué se queda', ic: 'cortes', inline: 'recorte', nota: 'Borra frases y palabras con el texto. Después se cortan solas las pausas, respiraciones y ruidos, y afinas lo que quieras.' },
    { id: 'guion', n: 'Corregir', r: 'Lo que queda', ic: 'doc', inline: 'guion', nota: 'Arregla nombres y palabras mal escritas, solo de lo que quedó en el video. Este paso cambia el texto de todo lo demás.' },
    { id: 'pantalla', n: 'Texto en pantalla', r: 'Grandes y subtítulos', ic: 'subs', tiles: ['capas', 'titulos', 'subs', 'elementos'], nota: 'Todo lo que se escribe sobre el video. Cada tarjeta trae su propia tipografía y color.' },
    { id: 'imagen', n: 'Imagen y cámara', r: 'Formato, zoom y color', ic: 'camara', tiles: ['formato', 'camara', 'fondo', 'look', 'pelicula'], nota: 'En qué formato se edita el video, cómo se mueve la cámara y cómo se ve la imagen.' },
    { id: 'sonido', n: 'Sonido', r: 'Voz y música', ic: 'audio', tiles: ['audio', 'sonidos'], nota: 'Tu voz, la música de fondo y los efectos de sonido.' },
    { id: 'publicar', n: 'Publicar', r: 'Final y portada', ic: 'publicar', tiles: ['cierre', 'publicar'], nota: 'El cierre del video, la portada y el caption. Exporta desde el botón dorado.' },
  ];
  function tileEl(t) {
    const act = S.panel === t.id;
    const off = t.sw && !t.sw[0];
    return h('div', { class: 'tile-w' },
      h('button', { type: 'button', class: 'tile' + (act ? ' on' : '') + (off ? ' off' : ''), 'data-t': t.id, 'aria-label': `Abrir ajustes de ${t.n}`, onclick: () => abrirHoja(t.id) },
        h('span', { class: 'tile-ico', html: ic(t.id, 24) }), h('span', { class: 'tile-tx' }, h('strong', {}, t.n), h('small', {}, t.r))),
      t.sw ? h('button', { type: 'button', role: 'switch', 'aria-checked': String(!!t.sw[0]), 'aria-label': `Activar o apagar ${t.n}`, class: 'tile-sw', 'data-sw': t.id,
        onclick: () => { t.sw[1](!t.sw[0]); cambio(); pintarTiles(); if (S.panel === t.id) pintarPanel(); tilesEl?.querySelector(`[data-sw="${t.id}"]`)?.focus(); } },
        h('span', { class: 'sw' + (t.sw[0] ? ' on' : ''), 'aria-hidden': 'true' }, h('i'))) : null);
  }
  function pintarTiles() {
    if (!tilesEl || !tilesEl.isConnected || !S.p || !S.p.plan) return;
    const P = PASOS.find((x) => x.id === S.paso);
    const voz = esVoz(), lista = voz ? (P.id === 'pantalla' ? ['capas', 'frases', 'subs', 'elementos'] : P.id === 'imagen' ? ['look', 'pelicula'] : P.tiles) : P.tiles;
    tilesEl.replaceChildren(...datosTarjetas().filter((t) => (lista || []).includes(t.id)).map(tileEl));
  }
  function colSet() {
    const i = PASOS.findIndex((x) => x.id === S.paso), P = PASOS[i];
    tilesEl = null; inlineEl = null; S.inline = P.inline || null;
    if (P.inline) inlineEl = h('div', { class: 'panel inline' }); else tilesEl = h('div', { class: 'tiles' });
    const ant = PASOS[i - 1], sig = PASOS[i + 1];
    const nav = h('nav', { class: 'pasos', 'aria-label': 'Pasos para editar tu video', style: `--i:${i};--n:${PASOS.length}` },
      PASOS.map((p, k) => h('button', { type: 'button', class: 'paso-b' + (k === i ? ' on' : '') + (k < i ? ' hecho' : ''), 'aria-current': k === i ? 'step' : 'false', onclick: () => irPaso(p.id) },
        h('span', { class: 'paso-n', html: k < i ? ic('check', 14) : ic(p.ic, 16) }), h('span', { class: 'paso-t' }, h('strong', {}, `${k + 1}. ${p.n}`), h('small', {}, p.r)))),
      h('i', { class: 'paso-barra', 'aria-hidden': 'true' }));
    const col = h('div', { class: 'col-set' }, nav,
      h('div', { class: 'paso', key: P.id },
        h('div', { class: 'paso-head' }, h('h2', {}, P.n), h('p', { class: 'sub' }, P.nota)),
        P.inline ? inlineEl : tilesEl),
      h('div', { class: 'paso-pie' },
        ant ? h('button', { type: 'button', class: 'btn ghost', onclick: () => irPaso(ant.id), html: ic('izq', 16) + ` ${ant.n}` }) : h('span'),
        sig ? h('button', { type: 'button', class: 'btn gold', onclick: () => irPaso(sig.id), html: `${sig.n} ` + ic('der', 16) }) : h('span')));
    setTimeout(() => { if (P.inline) pintarPanel(); else pintarTiles(); decorar(col); }, 0);
    return col;
  }
  function irPaso(id) {
    if (S.panel) cerrarHoja();
    S.paso = id;
    try { localStorage.setItem('estudio.paso.' + S.p.id, id); } catch { /* sin almacenamiento */ }
    if (S.tab !== 'live' && S.p.tieneAlpha) { S.tab = 'live'; return pintar(); }
    document.querySelector('.col-set')?.replaceWith(colSet());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cambiarVista(v) {
    S.vista = v;
    try { localStorage.setItem('estudio.vista', v); } catch { /* sin almacenamiento */ }
    const ed = document.querySelector('.ed');
    if (ed) ed.className = 'ed ' + v;
    document.querySelectorAll('.vtools .ib').forEach((b) => { const g = b.title === 'Video más grande' ? 'grande' : b.title.startsWith('Ocultar') ? 'solo' : ''; if (g) { b.classList.toggle('on', v === g); b.setAttribute('aria-pressed', String(v === g)); } });
    if (live && live.redraw) live.redraw();
    toast(v === 'solo' ? 'Solo el video. Vuelve a pulsar el ojo para ver los ajustes.' : v === 'grande' ? 'Video más grande.' : 'Vista normal.');
  }
  const HOJAS = {
    recorte: ['Recortar', 'Borra con el texto y corta pausas y ruidos.', () => panelRecorte()],
    cortes: ['Pausas y ruidos', 'Se queda solo lo que dices.', () => panelRecorte()],
    guion: ['Corregir', 'Corrige lo que quedó en el video.', () => panelGuion()],
    titulos: ['Palabras grandes', 'Qué palabras salen enormes, dónde, con qué animación y con qué letra.', () => panelTitulos()],
    subs: ['Subtítulos', 'El texto pequeño de abajo: cómo se parte, qué tan grande es y con qué letra.', () => panelSubs()],
    frases: ['Frases animadas', 'El texto se arma frase por frase al ritmo de tu voz. Elige las animaciones y se conectan solas.', () => panelFrases()],
    capas: ['Todas mis capas', 'Todo lo que agregaste, en orden. Toca uno para verlo en el video y editarlo en vivo.', () => panelCapas()],
    elementos: ['Elementos', 'Listas, conexiones, números, barras, stickers, logo y cambios de escena.', () => panelElementos()],
    formato: ['Formato del video', 'Vertical, horizontal, cuadrado o feed. Todo el editor, la portada y la exportación siguen ese formato.', () => panelFormato()],
    camara: ['Zoom y cámara lenta', 'Zooms que acompañan lo que dices y tramos en cámara lenta.', () => panelCamara()],
    fondo: ['Fondo desenfocado', 'Desenfoca lo que hay detrás de ti, siempre o solo cuando hay una palabra grande.', () => panelFondo()],
    look: ['Color y contraste', 'Un clic cambia todo el estilo. Después afinas color y luz.', () => panelLook()],
    pelicula: ['Look de película', 'Brillo y halo en las luces del fondo, grano y color de película hecha en rollo.', () => panelPelicula()],
    audio: ['Voz y música', 'Mejora tu voz y elige la música de fondo.', () => panelAudio()],
    sonidos: ['Efectos de sonido', 'Qué suena en cada título, zoom y cierre, y tus propios sonidos.', () => panelSonidos()],
    cierre: ['Tarjeta final', 'El cierre con tu llamado a la acción.', () => panelCierre()],
    publicar: ['Portada y caption', 'Todo lo que necesitas para publicar.', () => panelPublicar()],
    propiedades: ['Propiedades', 'Los ajustes de lo que elegiste en la línea de tiempo.', () => cuerpoPropiedades(S.selTL, { h, seg, slider, toggle, plan, cambio, refrescar, irPaso, filaTitulo, cuerpoFrase, cuerpoSticker, cuerpoEscena, cuerpoEspecial, abrirTitulo: (id) => S.abiertos.add(id) })],
    exportar: ['Exportar', 'Elige para dónde es el video. Se arma una vez y sale en todos los formatos que quieras.', () => hojaExportar({ h, api, A, S, toast, seg, guardarAjustes, repintar: pintarPanel, exportarFinal: () => { cerrarHoja(); lanzar('renderizar', { calidad: 'final' }, true); } })],
    ajustes: ['Ajustes', 'Se guardan en este navegador y valen para todos tus videos.', () => panelAjustes()],
  };
  function abrirHoja(id) {
    const prev = S.panel; S.panel = id; pintarTiles();
    const viva = document.querySelector('.hoja:not(.sale)');
    // Con la tarjeta ya abierta solo cambia el contenido: la barra de pestañas conserva su desplazamiento.
    if (viva && prev && prev !== 'ajustes' && id !== 'ajustes' && viva.querySelector('.hoja-nav')) {
      const [titulo, nota] = HOJAS[id];
      viva.setAttribute('aria-label', titulo); viva.querySelector('.hoja-head h2').textContent = titulo; viva.querySelector('.hoja-head .sub').textContent = nota;
      viva.querySelectorAll('.hoja-nav .chip').forEach((c, i) => { const on = tarjetasVisibles()[i]?.id === id; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); if (on) c.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); });
      const cuerpo = viva.querySelector('.panel'); if (cuerpo) cuerpo.scrollTop = 0; viva.scrollTop = 0;
      pintarPanel(); return;
    }
    montarHoja();
  }
  function cerrarHoja() {
    pararPista(); S.panel = null;
    const hoja = document.querySelector('.hoja'), fondo = document.querySelector('.hoja-fondo');
    document.querySelector('.ed')?.classList.remove('con-hoja');
    document.removeEventListener('keydown', escCierra);
    if (hoja) { hoja.classList.add('sale'); fondo?.classList.add('sale'); setTimeout(() => { hoja.remove(); fondo?.remove(); }, 170); }
    pintarTiles();
  }
  const escCierra = (e) => { if (e.key === 'Escape' && S.panel) cerrarHoja(); };
  function montarHoja() {
    document.querySelectorAll('.hoja, .hoja-fondo').forEach((x) => x.remove());
    document.removeEventListener('keydown', escCierra); document.addEventListener('keydown', escCierra);
    const [titulo, nota] = HOJAS[S.panel];
    panelEl = h('div', { class: 'panel' });
    const cerrar = h('button', { type: 'button', class: 'btn ghost hoja-x', 'aria-label': 'Cerrar', onclick: cerrarHoja, html: icon('x') });
    const fondo = h('div', { class: 'hoja-fondo', 'aria-hidden': 'true', onclick: cerrarHoja });
    const nav = S.p && S.p.plan && S.panel !== 'ajustes' ? h('nav', { class: 'hoja-nav', 'aria-label': 'Ir a otra tarjeta' }, tarjetasVisibles().map((t) => h('button', { type: 'button', class: 'chip' + (t.id === S.panel ? ' on' : ''), 'aria-pressed': String(t.id === S.panel), onclick: () => abrirHoja(t.id), html: `${ic(t.id, 14)}<span>${t.n}</span>` }))) : null;
    const hoja = h('aside', { class: 'hoja', role: 'dialog', 'aria-label': titulo, onkeydown: (e) => { if (e.key === 'Escape') cerrarHoja(); } },
      h('div', { class: 'hoja-head' }, h('div', {}, h('h2', {}, titulo), h('p', { class: 'sub' }, nota)), cerrar),
      nav, panelEl, h('p', { class: 'hint hoja-foot' }, S.panel === 'ajustes' ? 'Se guarda solo, en este navegador.' : 'Se guarda solo. Los cambios ya se ven en el video.'));
    root.append(fondo, hoja);
    document.querySelector('.ed')?.classList.add('con-hoja');
    if (S.panel !== 'propiedades') cerrar.focus();
    pintarPanel();
  }
  function pintarPanel() {
    const id = S.panel || S.inline, tgt = S.panel ? panelEl : inlineEl;
    if (!id || !tgt) return;
    const pintarEn = (x) => {
      if ((S.panel || S.inline) !== id) return;
      const pie = RESETS[id] ? h('div', { class: 'reset-pie' }, h('button', { type: 'button', class: 'btn ghost sm', title: 'Vuelve esta tarjeta a como venía de fábrica. Cmd+Z lo deshace.',
        onclick: () => { RESETS[id](); refrescar(); toast('Tarjeta restablecida. Cmd+Z lo deshace.'); }, html: ic('reset', 15) + ' Restablecer esta tarjeta' })) : null;
      const nuevo = tgt.dataset.panel !== id; tgt.dataset.panel = id; tgt.classList.toggle('primera', nuevo);
      tgt.replaceChildren(...x.flat().filter(Boolean), ...(pie ? [pie] : [])); decorar(tgt); plegables(tgt, id);
    };
    const r = HOJAS[id][2]();
    if (r && typeof r.then === 'function') r.then(pintarEn); else pintarEn(r);
  }
  // Tarjetas largas: la primera abierta y el resto plegadas. Se recuerda lo que abres aunque el panel se repinte.
  function plegables(tgt, id) {
    tgt.classList.remove('con-acc');
    if (!S.panel) return;
    const cards = [...tgt.children].filter((c) => c.matches('section.card') && c.querySelector(':scope > h2'));
    if (cards.length < 3) return;
    tgt.classList.add('con-acc'); S.acc = S.acc || {};
    cards.forEach((c, i) => {
      const t = c.querySelector(':scope > h2'), clave = `${id}:${t.textContent.trim()}`;
      const abierta = clave in S.acc ? S.acc[clave] : i === 0;
      const cuerpo = h('div', { class: 'acc-in' }); [...c.childNodes].forEach((n) => { if (n !== t) cuerpo.append(n); });
      const cuerpoW = h('div', { class: 'acc-body' }, cuerpo);
      const btn = h('button', { type: 'button', class: 'acc-h', 'aria-expanded': String(abierta) }, ...[...t.childNodes], h('span', { class: 'acc-chev', 'aria-hidden': 'true' }));
      t.replaceChildren(btn);
      c.classList.add('plegable'); c.classList.toggle('abierta', abierta); if (!abierta) cuerpoW.setAttribute('inert', '');
      btn.addEventListener('click', () => {
        const ab = !c.classList.contains('abierta'); S.acc[clave] = ab; c.classList.toggle('abierta', ab); btn.setAttribute('aria-expanded', String(ab));
        if (ab) cuerpoW.removeAttribute('inert'); else cuerpoW.setAttribute('inert', '');
      });
      c.append(cuerpoW);
    });
  }
  const refrescar = () => { cambio(); pintarPanel(); };
  const copiaDe = (dst, src, claves) => claves.forEach((k) => { dst[k] = structuredClone(src[k]); });
  const RESETS = {
    titulos: () => { copiaDe(estilo(), DEF, ['font', 'emphFont', 'accent', 'text', 'tracking', 'glow', 'contorno', 'densidad', 'posiciones', 'animaciones', 'titulosCaso']); },
    subs: () => { const st = estilo(); st.subs = { ...structuredClone(DEF.subs), on: st.subs.on }; },
    camara: () => copiaDe(estilo(), DEF, ['zoomIntensidad', 'zoomFrecuencia', 'zoomEstilo', 'zoomDeriva', 'zoomBN']),
    fondo: () => copiaDe(estilo(), DEF, ['desenfoque', 'motionBlur', 'motionBlurSobre', 'motionBlurModo', 'fondoModo']),
    look: () => { estilo().imagen = structuredClone(DEF.imagen); },
    pelicula: () => { const st = estilo(); st.pelicula = { ...structuredClone(DEF.pelicula), on: st.pelicula.on }; },
    audio: () => { const a = plan().audio; copiaDe(a, AUDIO_DEF, ['graves', 'ruido', 'compresion', 'volumen']); Object.assign(a.musica, { vol: AUDIO_DEF.musica.vol, duck: AUDIO_DEF.musica.duck, inicio: AUDIO_DEF.musica.inicio, fundido: AUDIO_DEF.musica.fundido }); },
    sonidos: () => { const st = estilo(); st.sfxVol = 1; st.sfxZoom = 'none'; st.sfxCierre = 'ding'; ponerSfxTitulos('auto'); },
  };

  // ----- Letra: tipografía, mayúsculas, interletrado, color y brillo, dentro de la tarjeta que corresponde -----
  function seccionLetra(L) {
    const st = estilo(), sb = st.subs, ambos = !!st.mismoEstilo;
    const lee = L === 'sub' ? sb : st;
    const escribe = (fn) => { if (ambos || L === 'tit') fn(st); if (ambos || L === 'sub') fn(sb); };
    const casoSub = sb.caso || (sb.mayus ? 'mayus' : 'tal');
    const casoAct = L === 'sub' ? casoSub : st.titulosCaso;
    const fontSet = (k) => (v) => { escribe((o) => { o[k] = v; }); refrescar(); };
    const otro = L === 'sub' ? 'las palabras grandes' : 'los subtítulos';
    return h('section', { class: 'card' }, h('h2', {}, L === 'sub' ? 'Letra de los subtítulos' : 'Letra de las palabras grandes'),
      toggle(`Usar el mismo estilo en ${otro}`, st.mismoEstilo, (v) => {
        st.mismoEstilo = v;
        if (v) { const o = L === 'sub' ? st : sb; o.font = lee.font; o.emphFont = lee.emphFont; o.tracking = lee.tracking; o.glow = lee.glow; o.contorno = lee.contorno; if (L === 'sub') st.titulosCaso = casoSub; else { sb.caso = st.titulosCaso; sb.mayus = st.titulosCaso === 'mayus'; } }
        refrescar();
      }, `Todo lo que cambies aquí también cambia en ${otro}.`),
      fontPicker('Tipografía', lee.font, fontSet('font')),
      L === 'sub' && !sb.claves
        ? h('p', { class: 'hint' }, 'Para darle otra tipografía a las palabras clave, activa "Resaltar palabras clave" más arriba.')
        : toggle('Las palabras especiales usan la misma tipografía', st.mismaEsp, (v) => { st.mismaEsp = v; if (v) { st.emphFont = ''; sb.emphFont = ''; } refrescar(); }, 'Se ven con la tipografía de arriba. Apágalo para elegir otra solo para ellas.'),
      !st.mismaEsp && !(L === 'sub' && !sb.claves) ? h('div', { class: 'reveal' }, fontPicker('Tipografía de las palabras especiales', lee.emphFont, fontSet('emphFont'), true)) : null,
      seg('Mayúsculas', [['mayus', 'MAYÚSCULAS'], ['minus', 'minúsculas'], ['tal', L === 'sub' ? 'Como se dijo' : 'Primera en mayúscula']], casoAct, (v) => { if (ambos || L === 'tit') st.titulosCaso = v; if (ambos || L === 'sub') { sb.caso = v; sb.mayus = v === 'mayus'; } refrescar(); }),
      slider('Espacio entre letras (interletrado)', -0.05, 0.2, 0.01, lee.tracking, (v) => `${Math.round(v * 100)}%`, (v) => { escribe((o) => { o.tracking = v; }); cambio(); }, 0),
      slider('Brillo alrededor de la letra (glow)', 0, 1, 0.05, lee.glow, (v) => (v < 0.03 ? 'Apagado' : `${Math.round(v * 100)}%`), (v) => { escribe((o) => { o.glow = v; }); cambio(); }, L === 'sub' ? DEF.subs.glow : DEF.glow),
      slider('Contorno oscuro', 0, 1, 0.05, lee.contorno, (v) => (v < 0.03 ? 'Sin contorno' : `${Math.round(v * 100)}%`), (v) => { escribe((o) => { o.contorno = v; }); cambio(); }, L === 'sub' ? DEF.subs.contorno : DEF.contorno));
  }
  function seccionColores() {
    const st = estilo();
    return h('section', { class: 'card' }, h('h2', {}, 'Colores del texto'),
      h('p', { class: 'sub' }, 'Los colores valen para las palabras grandes y para los subtítulos.'),
      colorRow('Color de acento (la palabra importante)', st.accent, ACENTOS, (c, redraw) => { st.accent = c; redraw ? refrescar() : cambio(); }),
      colorRow('Color del texto normal', st.text, TEXTOS, (c, redraw) => { st.text = c; redraw ? refrescar() : cambio(); }));
  }

  // ----- Fondo desenfocado -----
  function panelFondo() {
    const st = estilo();
    const nota = { titulos: 'El fondo se desenfoca solo mientras hay una palabra grande detrás de ti.', siempre: 'El fondo queda desenfocado todo el video. Tú sales nítido y el fondo se ve como con un lente abierto.', bordes: 'Los bordes se desenfocan y el centro queda nítido, como una viñeta de enfoque.', off: 'Sin desenfoque.' }[st.fondoModo];
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Desenfoque del fondo'),
        h('p', { class: 'sub' }, 'El programa te separa del fondo y desenfoca solo lo que hay detrás de ti. Tú sales siempre nítido.'),
        seg('Cuándo se desenfoca', [['titulos', 'Solo con palabras detrás'], ['siempre', 'Todo el video'], ['bordes', 'Solo los bordes'], ['off', 'Nunca']], st.fondoModo, (v) => { st.fondoModo = v; refrescar(); }),
        h('small', { class: 'hint' }, nota),
        st.fondoModo !== 'off' ? h('div', { class: 'reveal' }, slider('Cantidad de desenfoque', 0, 1, 0.05, st.desenfoque, (v) => (v < 0.03 ? 'Apagado' : `${Math.round(v * 100)}%`), (v) => { st.desenfoque = v; cambio(); }, DEF.desenfoque)) : null),
      h('section', { class: 'card' }, h('h2', {}, 'Estela de movimiento en los bordes'),
        h('p', { class: 'sub' }, 'Cuando hay un zoom, los bordes se estiran en horizontal, como cuando una cámara real se mueve rápido.'),
        slider('Intensidad de la estela', 0, 1, 0.05, st.motionBlur, (v) => (v < 0.03 ? 'Apagada' : `${Math.round(v * 100)}%`), (v) => { st.motionBlur = v; cambio(); }, DEF.motionBlur),
        st.motionBlur > 0.03 ? h('div', { class: 'reveal' }, seg('Cuándo se nota', [['zoom', 'Solo al hacer zoom'], ['siempre', 'Siempre, con vaivén suave']], st.motionBlurModo, (v) => { st.motionBlurModo = v; refrescar(); }), seg('Dónde se aplica', [['fondo', 'Solo en el fondo'], ['todo', 'En todo el cuadro']], st.motionBlurSobre, (v) => { st.motionBlurSobre = v; refrescar(); }), st.motionBlurSobre === 'todo' ? h('small', { class: 'hint' }, 'La vista previa solo muestra la estela en el fondo. El video exportado sí la aplica en todo el cuadro.') : null) : null),
    ];
  }

  // ----- Look de película: el brillo vive en las luces del fondo, nunca en tu cara -----
  function panelPelicula() {
    const pe = estilo().pelicula;
    const pct = (v) => (v < 0.03 ? 'Apagado' : `${Math.round(v * 100)}%`);
    const sl = (label, k, mn = 0, mx = 1, show = pct) => slider(label, mn, mx, 0.05, pe[k], show, (v) => { pe[k] = v; cambio(); }, DEF.pelicula[k]);
    const actual = PELIS.find(([, , , p]) => p.on && ['bloom', 'grano', 'halacion'].every((k) => Math.abs(p[k] - pe[k]) < 0.01))?.[0] || (pe.on ? 'mio' : 'off');
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Look de película'),
        h('p', { class: 'sub' }, 'Las luces del fondo brillan con un halo naranja, como en una cinta grabada en rollo. El efecto sale de las luces que hay detrás de ti y tu cara no lo recibe.'),
        h('div', { class: 'looks peli' }, PELIS.map(([id, n, nota, patch]) => h('button', { type: 'button', class: 'look' + (actual === id ? ' on' : ''), 'aria-pressed': String(actual === id), onclick: () => { if (id === 'off') pe.on = false; else Object.assign(pe, patch); refrescar(); } },
          h('span', { class: 'look-aa peli-' + id, html: ic(id === 'off' ? 'x' : 'pelicula', 22) }), h('strong', {}, n), h('small', {}, nota))))),
      pe.on ? h('div', { class: 'reveal' },
        h('section', { class: 'card' }, h('h2', {}, 'Luces del fondo'),
          sl('Brillo que sale de las luces', 'bloom'),
          sl('Qué tan fuerte debe ser una luz para brillar', 'umbral', 0.3, 0.95, (v) => `${Math.round(v * 100)}% de luz`),
          sl('Tamaño del halo', 'tamano', 0, 1, (v) => (v < 0.2 ? 'Pequeño' : v < 0.65 ? 'Medio' : 'Grande')),
          sl('Halo naranja de película (halación)', 'halacion')),
        h('section', { class: 'card' }, h('h2', {}, 'Cinta antigua'),
          sl('Grano de película', 'grano'),
          sl('Negros lavados (desvanecido)', 'desvanecido'),
          sl('Calidez del color', 'calidez'),
          toggle('Aplicar grano y color también sobre mí', pe.sobreMi, (v) => { pe.sobreMi = v; refrescar(); }, 'Apagado, tu imagen queda limpia y la película solo afecta al fondo.'))) : null,
    ];
  }

  // ----- Ajustes: se guardan en este navegador -----
  function panelAjustes() {
    const aj = S.aj, guardar = () => guardarAjustes(aj);
    const voc = aj.vocab || { terminos: [], reemplazos: [] };
    const tTerm = h('textarea', { rows: 6, 'aria-label': 'Palabras que el reconocimiento de voz debe respetar' }); tTerm.value = voc.terminos.join('\n');
    const tReemp = h('textarea', { rows: 5, 'aria-label': 'Reemplazos fijos', placeholder: 'marketógrafos = marketographers' }); tReemp.value = voc.reemplazos.map((r) => `${r.de} = ${r.a}`).join('\n');
    const leerVoc = () => ({ terminos: tTerm.value.split('\n'), reemplazos: tReemp.value.split('\n').map((l) => { const [de, ...a] = l.split('='); return { de: (de || '').trim(), a: a.join('=').trim() }; }) });
    const nombreEst = h('input', { placeholder: 'Nombre del estilo, por ejemplo Reel rápido', 'aria-label': 'Nombre del estilo' });
    const lista = () => aj.estilos.length ? h('ul', { class: 'evs' }, aj.estilos.map((e) => h('li', { class: 'ev' },
      h('div', { class: 'ev-top' }, h('span', { class: 'look-aa', style: `font-family:${fam(e.style.font)};color:${e.style.accent}` }, 'Aa'), h('strong', { class: 'grow' }, e.nombre + (aj.estiloDefecto === e.id ? '  (se usa en videos nuevos)' : '')),
        S.p && S.p.plan ? h('button', { type: 'button', class: 'btn gold sm', onclick: () => { S.p.plan.style = fusionar(estilo(), structuredClone(e.style)); refrescar(); toast(`Estilo ${e.nombre} aplicado.`); } }, 'Usar aquí') : null,
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { aj.estiloDefecto = aj.estiloDefecto === e.id ? null : e.id; guardar(); pintarPanel(); } }, aj.estiloDefecto === e.id ? 'Ya no usar en nuevos' : 'Usar en videos nuevos'),
        h('button', { type: 'button', class: 'btn danger sm', onclick: () => { aj.estilos = aj.estilos.filter((x) => x.id !== e.id); if (aj.estiloDefecto === e.id) aj.estiloDefecto = null; guardar(); pintarPanel(); } }, 'Quitar'))))) : h('p', { class: 'hint' }, 'Aún no guardaste ningún estilo.');
    const importar = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); S.aj = { ...AJ_DEF, ...d }; guardarAjustes(S.aj); if (S.aj.vocab) await guardarVocab(S.aj.vocab); toast('Ajustes importados.'); pintarPanel(); } catch { toast('Ese archivo no es una copia de ajustes.'); } } });
    const cajaTrans = h('section', { class: 'card' }, h('h2', {}, 'Velocidad de la transcripción'), h('p', { class: 'sub' }, 'Cargando…'));
    api(A + '/transcripcion').then((r) => {
      const poner = (m) => api(A + '/transcripcion', { method: 'PUT', body: { modo: m } }).then(() => pintarTrans(m));
      const pintarTrans = (m) => cajaTrans.replaceChildren(h('h2', {}, 'Velocidad de la transcripción'),
        h('p', { class: 'sub' }, 'La rápida tarda más o menos la mitad en un equipo normal y suele dejar el texto casi igual. La precisa revisa más opciones por palabra y se nota en voces con ruido o nombres raros. Vale para los videos que transcribas desde ahora.'),
        seg('Modo', [['rapida', 'Rápida'], ['precisa', 'Precisa']], m, poner));
      pintarTrans(r.modo || 'rapida');
    }).catch(() => cajaTrans.replaceChildren(h('h2', {}, 'Velocidad de la transcripción'), h('p', { class: 'sub' }, 'No pude leer este ajuste.')));
    return [
      cajaTrans,
      h('section', { class: 'card' }, h('h2', {}, 'Vocabulario propio'),
        h('p', { class: 'sub' }, 'Palabras que el reconocimiento de voz suele escribir mal. Los términos se le piden a Whisper antes de transcribir y se corrigen las variantes parecidas, como "membrecías" o "marketógrafos". Los reemplazos fijos cambian una palabra por otra siempre.'),
        h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Palabras que debe respetar (una por línea)'), tTerm),
        h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Reemplazos fijos (mal escrito = bien escrito)'), tReemp),
        h('div', { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn gold', onclick: async () => { try { await guardarVocab(leerVoc()); toast('Vocabulario guardado. Se usa en videos nuevos.'); } catch (e) { toast(e.message); } } }, 'Guardar vocabulario'),
          S.p && S.p.plan ? h('button', { type: 'button', class: 'btn ghost', onclick: async () => { await guardarVocab(leerVoc()); await aplicarVocabulario(); } }, 'Guardar y corregir el video abierto') : null)),
      h('section', { class: 'card' }, h('h2', {}, 'Preferencias'),
        toggle('Avisarme cuando termine un video', aj.notificar, (v) => { aj.notificar = v; guardar(); if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); pintarPanel(); }),
        toggle('Atajos de teclado (espacio, flechas, Cmd+Z)', aj.atajos, (v) => { aj.atajos = v; guardar(); pintarPanel(); })),
      h('section', { class: 'card' }, h('h2', {}, 'Estilos guardados'),
        h('p', { class: 'sub' }, 'Guarda tipografías, colores, película, fondo y zooms para usarlos en cualquier video. Uno puede ser el punto de partida de todos los videos nuevos.'),
        lista(),
        S.p && S.p.plan ? h('div', { class: 'row-gap' }, nombreEst, h('button', { type: 'button', class: 'btn gold', onclick: () => { const n = nombreEst.value.trim(); if (!n) return toast('Ponle un nombre al estilo.'); aj.estilos.push({ id: 's' + Date.now().toString(36), nombre: n, style: structuredClone(estilo()) }); guardar(); toast(`Estilo ${n} guardado.`); pintarPanel(); } }, 'Guardar el estilo de este video')) : h('p', { class: 'hint' }, 'Abre un video para guardar su estilo.')),
      h('section', { class: 'card' }, h('h2', {}, 'Atajos de teclado'),
        h('ul', { class: 'atajos' }, [['Espacio', 'Reproducir o pausar'], ['Flecha izquierda o derecha', 'Un fotograma atrás o adelante'], ['Mayús y flecha', 'Un segundo atrás o adelante'], ['Cmd+Z', 'Deshacer'], ['Cmd+Mayús+Z', 'Rehacer'], ['Escape', 'Cerrar la tarjeta abierta']].map(([k, d]) => h('li', {}, h('kbd', {}, k), h('span', {}, d))))),
      h('section', { class: 'card' }, h('h2', {}, 'Copia de seguridad'),
        h('p', { class: 'sub' }, 'Tus ajustes viven en este navegador. Descarga una copia para pasarlos a otro navegador o para no perderlos si borras los datos del sitio.'),
        h('div', { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(aj, null, 2)], { type: 'application/json' })); a.download = 'estudio-ajustes.json'; a.click(); } }, 'Descargar copia'),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => importar.click() }, 'Importar copia'), importar,
          h('button', { type: 'button', class: 'btn danger', onclick: () => { if (confirm('Esto borra tu vocabulario, estilos y preferencias guardados en este navegador. ¿Seguro?')) { S.aj = { ...AJ_DEF }; guardarAjustes(S.aj); pintarPanel(); } } }, 'Restablecer'))),
    ];
  }

  // ----- Audio y música -----
  let pista = null;
  const pararPista = () => { if (pista) { pista.pause(); pista = null; } };
  async function seccionesAudio() {
    const a = plan().audio, m = a.musica;
    const lista = await api(A + '/musica').catch(() => []);
    const subirMusica = (file) => {
      if (!/\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(file.name)) return toast(`"${file.name}" no es un audio que pueda usar. Sirven mp3, wav, m4a, aac, flac y ogg.`);
      toast(`Subiendo ${file.name}...`);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${A}/musica/subir?nombre=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.onload = () => {
        let r = {}; try { r = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 200 && r.nombre) { m.archivo = r.nombre; refrescar(); toast('Música subida y elegida.'); } else toast(r.error || `No pude subir el audio (error ${xhr.status}).`);
      };
      xhr.onerror = () => toast('No pude subir el audio. Revisa que el Estudio siga abierto.');
      xhr.send(file);
    };
    const input = h('input', { type: 'file', accept: '.mp3,.wav,.m4a,.aac,.flac,.ogg,audio/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) subirMusica(f); } });
    const escuchar = (t, btn) => {
      if (pista && pista.dataset.n === t.nombre) { pararPista(); btn.textContent = 'Escuchar'; return; }
      pararPista(); document.querySelectorAll('.pista-play').forEach((b) => { b.textContent = 'Escuchar'; });
      pista = new Audio(`/api${A}/musica/${encodeURIComponent(t.nombre)}`); pista.dataset.n = t.nombre; pista.play().catch(() => {}); btn.textContent = 'Parar';
    };
    const borrar = async (t) => {
      if (!confirm('¿Borrar esta pista de tu biblioteca?')) return;
      pararPista();
      await api(`${A}/musica/${encodeURIComponent(t.nombre)}`, { method: 'DELETE' });
      if (m.archivo === t.nombre) m.archivo = '';
      refrescar();
    };
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Mejorar mi voz'),
        toggle('Mejorar el audio al generar el video', a.mejorar, (v) => { a.mejorar = v; refrescar(); }, 'Limpia tu voz y deja el volumen parejo. Se oye al instante en la vista En vivo (aproximado); la mezcla exacta sale en el video generado.'),
        ...(a.mejorar ? [
          toggle('Quitar graves molestos (golpes y ruido de mesa)', a.graves, (v) => { a.graves = v; refrescar(); }),
          slider('Reducción de ruido de fondo', 0, 1, 0.05, a.ruido, (v) => (v < 0.03 ? 'Apagada' : `${Math.round(v * 100)}%`), (v) => { a.ruido = v; cambio(); }, AUDIO_DEF.ruido),
          toggle('Compresión suave (voz más pareja)', a.compresion, (v) => { a.compresion = v; refrescar(); }),
          toggle('Volumen parejo en todo el video', a.volumen, (v) => { a.volumen = v; refrescar(); }),
        ] : [])),
      h('section', { class: 'card' }, h('h2', {}, 'Música de fondo'),
        h('p', { class: 'sub' }, 'Sube pistas con licencia para redes. La música baja sola cuando hablas y sube en las pausas.'),
        h('div', { class: 'musica' },
          h('button', { type: 'button', class: 'pista pista-n' + (!m.archivo ? ' on' : ''), onclick: () => { pararPista(); m.archivo = ''; refrescar(); } }, h('strong', {}, 'Sin música')),
          ...lista.map((t) => {
            const play = h('button', { type: 'button', class: 'btn ghost sm pista-play' }, 'Escuchar');
            play.onclick = () => escuchar(t, play);
            return h('div', { class: 'pista' + (m.archivo === t.nombre ? ' on' : '') },
              h('button', { type: 'button', class: 'pista-n', onclick: () => { m.archivo = t.nombre; refrescar(); } }, h('strong', {}, t.nombre), h('small', {}, `${t.mb} MB`)),
              play,
              h('button', { type: 'button', class: 'btn danger sm', 'aria-label': 'Borrar ' + t.nombre, onclick: () => borrar(t) }, 'Borrar'));
          })),
        h('div', { class: 'musica-drop', ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: (e) => e.currentTarget.classList.remove('over'),
          ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const f = [...e.dataTransfer.files][0]; if (f) subirMusica(f); } },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => input.click(), html: icon('plus') + ' Subir música (MP3, WAV, M4A)' }), h('small', {}, 'O arrastra el archivo hasta aquí.'), input),
        ...(m.archivo ? [
          slider('Volumen respecto a tu voz', -30, 0, 1, m.vol, (v) => `${v} dB`, (v) => { m.vol = v; cambio(); }, AUDIO_DEF.musica.vol),
          slider('Cuánto baja cuando hablas', 0, 24, 1, m.duck, (v) => `${v} dB`, (v) => { m.duck = v; cambio(); }, AUDIO_DEF.musica.duck),
          slider('Empezar la pista en el segundo', 0, 120, 1, m.inicio, (v) => `${v} s`, (v) => { m.inicio = v; cambio(); }, AUDIO_DEF.musica.inicio),
          slider('Fundido al empezar y al terminar', 0, 5, 0.5, m.fundido, (v) => `${v} s`, (v) => { m.fundido = v; cambio(); }, AUDIO_DEF.musica.fundido),
        ] : [])),
    ];
  }


  // ---------- efectos de sonido: qué suena, cuándo y con qué volumen ----------
  const sfxOpts = (conAuto) => [...(conAuto ? [['auto', 'Automático']] : []), ...SFX.filter((x) => x[0] !== 'none'),
    ...SFXU.map((f) => ['u:' + f.nombre, f.nombre.replace(/\.\w+$/, '')]), ['none', 'Ninguno']];
  const sfxAuto = (anim) => (estilo().sfxPorAnim || {})[anim] ?? SFX_AUTO[anim] ?? 'none';
  const sfxTipo = (tipo, def) => (estilo().sfxTipos || {})[tipo] ?? def;
  const sfxGan = (n) => Number((estilo().sfxGanancia || {})[n] ?? 1);
  const nombreSfx = (v) => (v === 'auto' ? 'Automático' : (sfxOpts().find((x) => x[0] === v) || [, 'Ninguno'])[1]);
  const sfxUrl = (n) => (n.startsWith('u:') ? `/api${A}/sfx/${encodeURIComponent(n.slice(2))}` : `${SFX_BASE}/${n}.wav`);
  let sfxOyendo = null;
  function oirSfx(n) {
    if (!n || n === 'none' || n === 'auto') return;
    try {
      if (sfxOyendo) sfxOyendo.pause();
      const a = new Audio(sfxUrl(n)); a.volume = Math.min(1, (n.startsWith('u:') ? 0.5 : SFX_GAIN[n] || 0.5) * 1.5 * Number(estilo().sfxVol ?? 1) * sfxGan(n));
      sfxOyendo = a; a.play().catch(() => {});
    } catch { /* sin audio */ }
  }
  function ponerSfxTitulos(v) {
    const st = estilo(); st.sonidoTitulos = v;
    (plan().events || []).filter((e) => !e.kind).forEach((e) => { e.sfx = v === 'auto' ? sfxAuto(e.anim) : v; });
  }

  // Un sonido distinto para cada animación de título y para cada tipo de elemento, y el volumen de cada sonido.
  const TIPOS_SFX = [['escena', 'Escenas'], ['lista', 'Listas'], ['conexion', 'Conexiones'], ['numero', 'Números'], ['barras', 'Barras'], ['punto', 'Puntos'], ['sticker', 'Stickers']];
  const SFX_TIPO_DEF = { escena: 'whoosh', punto: 'whoosh' };
  function selSfx(valor, conAuto, onchange, etiqueta) {
    return h('div', { class: 'sfx-sel' },
      h('select', { 'aria-label': etiqueta, onchange: (e) => { onchange(e.target.value); oirSfx(e.target.value); refrescar(); } },
        sfxOpts(conAuto).map(([v, l]) => h('option', { value: v, ...(v === valor ? { selected: true } : {}) }, l))),
      h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `Escuchar ${etiqueta}`, onclick: () => oirSfx(valor === 'auto' ? '' : valor) }, 'Escuchar'));
  }
  function cardSfxPorTipo(st) {
    st.sfxPorAnim = st.sfxPorAnim || {}; st.sfxTipos = st.sfxTipos || {};
    const auto = st.sonidoTitulos === 'auto';
    const filaA = (id, nombre) => h('div', { class: 'ctl sfx-fila' }, h('span', { class: 'lbl' }, nombre),
      selSfx(sfxAuto(id), false, (v) => { st.sfxPorAnim[id] = v; (plan().events || []).filter((e) => !e.kind && e.anim === id).forEach((e) => { e.sfx = v; }); }, `sonido de ${nombre}`));
    const filaT = ([id, nombre]) => {
      const def = SFX_TIPO_DEF[id] ?? 'none', val = st.sfxTipos[id] ?? 'auto';
      return h('div', { class: 'ctl sfx-fila' }, h('span', { class: 'lbl' }, nombre),
        selSfx(val, true, (v) => { if (v === 'auto') delete st.sfxTipos[id]; else st.sfxTipos[id] = v; const nuevo = v === 'auto' ? def : v; (plan().events || []).filter((e) => e.kind === id).forEach((e) => { e.sfx = nuevo; }); }, `sonido de ${nombre}`));
    };
    const anims = ANIM.filter(([id]) => (st.animaciones || []).includes(id));
    return h('section', { class: 'card' }, h('h2', {}, 'Un sonido por tipo'),
      h('p', { class: 'sub' }, 'Cada animación de las palabras grandes y cada tipo de elemento puede tener su propio sonido. Al cambiarlo se actualizan los que ya están en el video.'),
      auto ? h('div', { class: 'reveal' }, h('strong', { class: 'lbl' }, 'Palabras grandes, según su animación'), ...anims.map(([id, nombre]) => filaA(id, nombre)))
        : h('div', { class: 'aviso' }, h('span', {}, 'Las palabras grandes usan el mismo sonido para todas. Para elegir uno por animación, ponlo en Automático.'), h('button', { type: 'button', class: 'btn gold sm', onclick: () => { ponerSfxTitulos('auto'); refrescar(); } }, 'Poner Automático')),
      h('strong', { class: 'lbl' }, 'Elementos'), ...TIPOS_SFX.map(filaT));
  }
  function cardSfxVolumenes(st) {
    st.sfxGanancia = st.sfxGanancia || {};
    const todos = [...SFX.filter((x) => x[0] !== 'none'), ...SFXU.map((f) => ['u:' + f.nombre, f.nombre.replace(/\.\w+$/, '')])];
    return h('section', { class: 'card' }, h('h2', {}, 'Volumen de cada sonido'),
      h('p', { class: 'sub' }, 'Si un sonido pega más fuerte que otro, bájale solo a ese. Se suma al volumen general de arriba.'),
      ...todos.map(([id, nombre]) => h('div', { class: 'sfx-vol' },
        slider(nombre, 0, 2, 0.05, sfxGan(id), (v) => (v < 0.03 ? 'Silencio' : `${Math.round(v * 100)}%`), (v) => { st.sfxGanancia[id] = v; cambio(); }, 1),
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `Escuchar ${nombre}`, onclick: () => oirSfx(id) }, 'Escuchar'))));
  }
  async function panelSonidos() {
    const st = estilo();
    SFXU = await api(A + '/sfx').catch(() => SFXU);
    const fila = (titulo, nota, valor, on, conAuto) => h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, titulo),
      h('div', { class: 'chips' }, sfxOpts(conAuto).map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === valor), class: 'chip' + (v === valor ? ' on' : ''),
        onclick: () => { on(v); oirSfx(v); refrescar(); } }, l))), nota ? h('small', { class: 'hint' }, nota) : null);
    const subir = (file) => {
      if (!/\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(file.name)) return toast(`"${file.name}" no es un audio que pueda usar. Sirven mp3, wav, m4a, aac, flac y ogg.`);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${A}/sfx/subir?nombre=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.onload = async () => {
        let r = {}; try { r = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 200 && r.nombre) { SFXU = await api(A + '/sfx').catch(() => SFXU); toast('Efecto guardado. Elígelo arriba para usarlo.'); pintarPanel(); } else toast(r.error || `No pude subir el audio (error ${xhr.status}).`);
      };
      xhr.onerror = () => toast('No pude subir el audio. Revisa que el Estudio siga abierto.');
      xhr.send(file);
    };
    const input = h('input', { type: 'file', accept: '.mp3,.wav,.m4a,.aac,.flac,.ogg,audio/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) subir(f); } });
    const borrar = async (f) => {
      if (!confirm(`¿Borrar "${f.nombre}" de tus efectos?`)) return;
      await api(`${A}/sfx/${encodeURIComponent(f.nombre)}`, { method: 'DELETE' });
      const id = 'u:' + f.nombre;
      if (st.sonidoTitulos === id) ponerSfxTitulos('auto');
      if (st.sfxZoom === id) st.sfxZoom = 'none';
      if (st.sfxCierre === id) st.sfxCierre = 'ding';
      (plan().events || []).forEach((e) => { if (e.sfx === id) e.sfx = 'none'; });
      SFXU = await api(A + '/sfx').catch(() => []); refrescar();
    };
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Efectos de sonido'),
        toggle('Usar efectos de sonido', st.sonidos, (v) => { st.sonidos = v; refrescar(); }, 'Apaga todos los efectos de títulos, zooms y cierre sin borrar tu configuración.'),
        ...(st.sonidos ? [slider('Volumen de los efectos', 0, 2, 0.05, Number(st.sfxVol ?? 1), (v) => (v < 0.03 ? 'Silencio' : `${Math.round(v * 100)}%`), (v) => { st.sfxVol = v; cambio(); }, 1)] : [])),
      ...(st.sonidos ? [h('section', { class: 'card' }, h('h2', {}, 'Qué suena en cada momento'),
        h('p', { class: 'sub' }, 'Toca un sonido para escucharlo y elegirlo. Los cambios se oyen enseguida en la vista En vivo.'),
        fila('Palabras grandes', 'Automático elige un sonido según la animación de cada título. Para un título puntual, ábrelo en Palabras grandes.', st.sonidoTitulos, (v) => ponerSfxTitulos(v), true),
        fila('Zoom', 'Suena cada vez que entra un zoom.', st.sfxZoom, (v) => { st.sfxZoom = v; }),
        fila('Tarjeta final', 'Suena cuando aparece el cierre del video.', st.sfxCierre || 'ding', (v) => { st.sfxCierre = v; })),
        cardSfxPorTipo(st), cardSfxVolumenes(st),
        h('section', { class: 'card' }, h('h2', {}, 'Mis efectos'),
          h('p', { class: 'sub' }, 'Sube tus propios sonidos cortos. Si duran más de 4 segundos se cortan, y todos se nivelan para que ninguno pegue más fuerte que otro.'),
          h('div', { class: 'musica-drop', ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: (e) => e.currentTarget.classList.remove('over'),
            ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); [...e.dataTransfer.files].forEach(subir); } },
            h('button', { type: 'button', class: 'btn ghost', onclick: () => input.click(), html: icon('plus') + ' Subir efecto (MP3, WAV, M4A)' }), h('small', {}, 'O arrastra los archivos hasta aquí.'), input),
          SFXU.length ? h('div', { class: 'musica' }, SFXU.map((f) => h('div', { class: 'pista' },
            h('span', { class: 'pista-n' }, h('strong', {}, f.nombre), h('small', {}, `${f.kb} KB`)),
            h('button', { type: 'button', class: 'btn ghost sm', onclick: () => oirSfx('u:' + f.nombre) }, 'Escuchar'),
            h('button', { type: 'button', class: 'btn danger sm', 'aria-label': 'Borrar ' + f.nombre, onclick: () => borrar(f) }, 'Borrar'))))
            : h('p', { class: 'hint' }, 'Todavía no subes ninguno. Un click, un whoosh o un "pop" corto funcionan mejor que sonidos largos.'))] : []),
    ];
  }
  async function panelAudio() { return await seccionesAudio(); }

  // ----- Publicar: cierre, caption y portada -----
  const copiar = async (txt, ok) => { try { await navigator.clipboard.writeText(txt); toast(ok); } catch { toast('No pude copiar. Selecciona el texto y cópialo a mano.'); } };
  function hashtagsDe(palabras) {
    const cuenta = new Map();
    for (const w of palabras) { const k = nz(w.w); if (k.length > 5 && !PARASITAS.has(k)) cuenta.set(k, (cuenta.get(k) || 0) + 1); }
    const temas = [...cuenta].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 6).map(([k]) => '#' + k);
    return [...new Set([...temas, '#fotografia', '#marketingparafotografos', '#fotografoprofesional', '#themarketographers', '#marketingdigital', '#reels'])];
  }
  function promptCaption(texto, tags) {
    return `Escribe el caption de Instagram para el reel cuyo guion aparece al final.

Voz: la de Pablo Villarroel, fotógrafo y profesor de marketing para fotógrafos. Cuenta una mini historia con storytelling, habla literal y claro, y mete humor negro, sarcasmo o juegos de palabras ingeniosos cuando encajen.

Reglas:
1. La primera línea es el gancho. Debe leerse completa antes del "más" y sin repetir lo que dice el video.
2. Máximo 5 líneas de cuerpo. Una idea por línea.
3. Cierra con una pregunta concreta que invite a comentar, o con una invitación a guardar o compartir.
4. Usa frases literales. Evita metáforas que haya que descifrar.
5. Nunca uses la construcción "No es X, es Y" ni ninguna variante que niegue algo para redefinirlo.
6. No uses guiones largos ni símbolos raros. Solo puntuación normal.
7. Entrega 3 opciones de distinto largo (corta, media, larga) y debajo de cada una elige entre 8 y 12 hashtags. Parte de esta lista y mejora lo que haga falta: ${tags.join(' ')}

Guion del reel:
${texto}`;
  }
  const promptCamara = (tema) => `Imagen vertical 4:5 para la portada de un reel de Instagram sobre: "${tema}".
Personaje: un hombre con una cámara fotográfica profesional en lugar de la cabeza, el lente es su rostro. Viste ropa oscura y sencilla.
Pose: mirando al frente, un gesto de la mano como si explicara algo. Plano medio, centrado, con aire arriba para poner un título grande.
Estilo: fotografía realista de estudio, luz de contorno cálida, fondo oscuro desenfocado con puntos de luz suaves.
Paleta: negro #181818, blanco y un solo acento amarillo #fddc5b.
No incluyas texto, logos ni marcas de agua. El título lo agrego yo después.`;
  // ----- Portada: elige el momento, escribe el título y míralo sobre el video antes de generarlo -----
  function planPortada(P) {
    const st = estilo();
    return { ...plan(), zooms: [], lentos: [], cortes: { on: false, rangos: [] },
      events: [{ id: 'portada', start: P.t - 5, end: P.t + 1000, text: P.texto || 'TU TÍTULO', size: P.size, color: P.color, anim: 'fade', pos: P.pos, y: P.y ?? undefined }],
      style: { ...st, zooms: false, titulos: true, motionBlur: 0, subs: { ...st.subs, on: false }, fondoModo: ['siempre', 'bordes'].includes(st.fondoModo) ? st.fondoModo : 'titulos' } };
  }
  function livePortada(P) {
    if (S.pl && S.pl.id === S.p.id) return S.pl.live;
    if (S.pl) S.pl.live.destroy();
    const l = crearLive({ h, srcUrl: vurl('source'), alphaUrl: vurl('alpha'), fam, estatico: true, getWords: () => [], getPlan: () => planPortada(P) });
    S.pl = { id: S.p.id, live: l };
    l.video.addEventListener('loadeddata', () => l.ir(P.t));
    return l;
  }
  function seccionPortada(P, tema, generar) {
    const vivo = livePortada(P);
    const pid = S.p.id, url = (n, v) => `/api${A}/proyectos/${pid}/portada/imagen?n=${n}&v=${v}`;
    const ver = () => vivo.redraw();
    const cargarCand = async (nuevo) => {
      try { P.cargandoC = true; if (nuevo) pintarPanel(); P.cand = await api(`${A}/proyectos/${pid}/portada/candidatos`, { method: nuevo ? 'POST' : 'GET' }); }
      catch (e) { toast(e.message); }
      P.cargandoC = false; P.candV = Date.now(); pintarPanel();
    };
    if (!P.candCargado) { P.candCargado = true; cargarCand(false); }
    const variantes = async () => {
      try {
        P.cargando = true; P.vars = false; pintarPanel(); await guardarYa();
        const juegos = [['portada_v1.png', 'detras'], ['portada_v2.png', 'arriba'], ['portada_v3.png', 'centro']];
        for (const [salida, pos] of juegos) await api(`${A}/proyectos/${pid}/portada`, { method: 'POST', body: { t: P.t, texto: P.texto, pos, size: P.size, color: P.color, y: null, salida } });
        P.vars = Date.now();
      } catch (e) { toast(e.message); }
      P.cargando = false; pintarPanel();
    };
    const irA = (t) => { P.t = +t.toFixed(2); vivo.ir(P.t); pintarPanel(); };
    const nombrePl = h('input', { placeholder: 'Nombre de la plantilla', 'aria-label': 'Nombre de la plantilla de portada' });
    const imgActual = P.ver ? url(P.verN || 'portada.png', P.ver) : null;
    return h('section', { class: 'card' }, h('h2', {}, 'Portada'),
      h('p', { class: 'sub' }, 'Elige el momento del video que mejor se ve y ponle el título, detrás de ti o delante. Lo que ves aquí es lo que sale. El gancho de la portada decide si alguien abre el reel.'),
      h('div', { class: 'cand-box' },
        h('div', { class: 'row-between' }, h('strong', {}, 'Mejores momentos'),
          h('button', { type: 'button', class: 'btn ghost sm', disabled: !!P.cargandoC, onclick: () => cargarCand(true), html: ic('estrella', 14) + (P.cand && P.cand.length ? ' Elegir de nuevo' : ' Elegir los mejores momentos') })),
        P.cand && P.cand.length ? h('div', { class: 'cand' }, P.cand.map((c) => h('button', { type: 'button', class: 'cand-b' + (Math.abs(c.t - P.t) < 0.05 ? ' on' : ''), title: `Usar el segundo ${c.t}`, onclick: () => irA(c.t) },
          h('img', { src: `/api${A}/proyectos/${pid}/candidato/${c.img}?v=${P.candV || 0}`, alt: `Fotograma en el segundo ${c.t}`, loading: 'lazy' }), h('small', {}, `${c.t.toFixed(1)} s`)))) : h('small', { class: 'hint' }, P.cargandoC ? 'Buscando fotogramas con buena cara, ojos abiertos y luz...' : 'El programa busca fotogramas con buena cara, ojos abiertos y luz, y te muestra los mejores.')),
      h('div', { class: 'portada' },
        h('div', { class: 'portada-img' }, h('div', { class: 'portada-prev' }, vivo.el), h('small', { class: 'hint' }, 'Vista en vivo')),
        h('div', { class: 'portada-ctl' },
          slider('Momento del video', 0, Math.floor(plan().duration * 10) / 10, 0.1, P.t, (v) => `${v.toFixed(1)} s`, (v) => { P.t = v; vivo.ir(v); }),
          h('div', {}, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => irA(video ? video.currentTime : 0), html: ic('reloj', 14) + ' Usar el momento que estoy viendo' })),
          h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Título de la portada'), h('input', { value: P.texto, maxlength: 40, placeholder: tema.slice(0, 30), oninput: (e) => { P.texto = e.target.value; ver(); } })),
          seg('Posición del título', [['detras', 'Detrás de ti'], ['arriba', 'Arriba'], ['centro', 'Centro'], ['abajo', 'Abajo']], P.pos, (v) => { P.pos = v; P.y = null; ver(); pintarPanel(); }),
          seg('Tamaño', [['M', 'M'], ['L', 'L'], ['XL', 'XL']], P.size, (v) => { P.size = v; ver(); pintarPanel(); }),
          seg('Color', [['accent', 'Acento'], ['text', 'Texto']], P.color, (v) => { P.color = v; ver(); pintarPanel(); }),
          slider('Altura del título', 0.08, 0.8, 0.01, P.y ?? ALTURA_POS[P.pos], (v) => `${Math.round(v * 100)}% desde arriba`, (v) => { P.y = v; ver(); }))),
      h('div', { class: 'plant' }, h('span', { class: 'lbl', html: ic('estrella', 14) + ' Plantillas de portada' }),
        h('div', { class: 'chips' }, (S.aj.plantillasPortada || []).map((pl) => h('span', { class: 'chip-x' },
          h('button', { type: 'button', class: 'chip', onclick: () => { Object.assign(P, { pos: pl.pos, size: pl.size, color: pl.color, y: pl.y }); ver(); pintarPanel(); } }, pl.nombre),
          h('button', { type: 'button', class: 'chip-q', 'aria-label': `Quitar la plantilla ${pl.nombre}`, onclick: () => { S.aj.plantillasPortada = S.aj.plantillasPortada.filter((x) => x.id !== pl.id); guardarAjustes(S.aj); pintarPanel(); } }, '×')))),
        h('div', { class: 'row-gap' }, nombrePl, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { const n = nombrePl.value.trim(); if (!n) return toast('Ponle un nombre a la plantilla.'); (S.aj.plantillasPortada = S.aj.plantillasPortada || []).push({ id: 'p' + Date.now().toString(36), nombre: n, pos: P.pos, size: P.size, color: P.color, y: P.y }); guardarAjustes(S.aj); toast('Plantilla guardada.'); pintarPanel(); } }, 'Guardar posición y estilo'))),
      h('div', { class: 'row-gap' },
        h('button', { type: 'button', class: 'btn gold', disabled: !!P.cargando, onclick: generar }, P.cargando ? 'Generando...' : P.ver ? 'Generar de nuevo' : `Generar portada en ${etqSalida(S.p.plan)}`),
        h('button', { type: 'button', class: 'btn ghost', disabled: !!P.cargando, onclick: variantes }, 'Probar 3 posiciones'),
        imgActual ? h('a', { class: 'btn ghost', href: imgActual, download: 'portada.png' }, 'Descargar PNG') : null),
      P.vars ? h('div', { class: 'vars' }, [['portada_v1.png', 'detras', 'Detrás de ti'], ['portada_v2.png', 'arriba', 'Arriba'], ['portada_v3.png', 'centro', 'Centro']].map(([n, pos, t]) =>
        h('div', { class: 'var' }, h('button', { type: 'button', class: 'var-b', title: `Usar ${t}`, onclick: () => { P.pos = pos; P.y = null; P.ver = P.vars; P.verN = n; ver(); pintarPanel(); } }, h('img', { src: url(n, P.vars), alt: `Portada con el título ${t.toLowerCase()}` })), h('small', {}, t), h('a', { class: 'btn ghost sm', href: url(n, P.vars), download: n }, 'Descargar')))) : null,
      h('div', { class: 'ig' }, h('span', { class: 'lbl', html: ic('imagen', 14) + ' Así se ve en tu perfil de Instagram' }),
        h('div', { class: 'ig-grid' }, Array.from({ length: 9 }, (_, k) => (k === 0
          ? h('div', { class: 'ig-c foto' }, imgActual ? h('img', { src: imgActual, alt: 'Tu portada recortada en 4:5' }) : h('small', {}, 'Genera la portada para verla aquí'))
          : h('div', { class: 'ig-c' })))),
        h('small', { class: 'hint' }, 'El perfil recorta la portada al centro en formato 4:5. Deja el título en la franja del medio.')),
      h('details', {}, h('summary', {}, 'Pedido para crear la portada con el hombre cabeza de cámara'), h('pre', { class: 'prompt' }, promptCamara(P.texto || tema)),
        h('div', {}, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => copiar(promptCamara(P.texto || tema), 'Pedido copiado.') }, 'Copiar pedido'))));
  }
  function seccionesPublicar() {
    const c = plan().cierre;
    const palabras = S.p.palabras || [];
    const texto = guionTexto().replace(/\n\n/g, '\n');
    const tags = hashtagsDe(palabras);
    const prompt = promptCaption(texto, tags);
    const tema = (palabras.slice(0, 12).map((w) => w.w).join(' ') || '').replace(/[?¿!¡.,]/g, '');
    const P = S.portada || (S.portada = { t: 0, texto: '', pos: 'detras', size: 'XL', color: 'accent', y: null, ver: 0, id: S.p.id });
    if (P.id !== S.p.id) Object.assign(P, { t: 0, texto: '', pos: 'detras', size: 'XL', color: 'accent', y: null, ver: 0, id: S.p.id, cand: null, candCargado: false, verN: '', vars: false });
    const generarPortada = async () => {
      try { P.cargando = true; pintarPanel(); await guardarYa(); await api(`${A}/proyectos/${S.p.id}/portada`, { method: 'POST', body: { t: P.t, texto: P.texto, pos: P.pos, size: P.size, color: P.color, y: P.y } }); P.ver = Date.now(); P.verN = 'portada.png'; }
      catch (e) { toast(e.message); }
      P.cargando = false; pintarPanel();
    };
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Tarjeta de cierre'),
        h('p', { class: 'sub' }, 'Al terminar tu video aparece una tarjeta con tu llamado a la acción y una barra que se llena. Se agrega sola al exportar.'),
        toggle('Agregar tarjeta de cierre', c.on, (v) => { c.on = v; refrescar(); }),
        ...(c.on ? [
          h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Texto principal (usa *asteriscos* para resaltar una palabra)'), h('input', { value: c.texto, oninput: (e) => { c.texto = e.target.value; cambio(); } })),
          h('label', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Línea de apoyo, por ejemplo tu usuario'), h('input', { value: c.sub, oninput: (e) => { c.sub = e.target.value; cambio(); } })),
          slider('Duración', 2, 6, 0.5, c.dur, (v) => `${v} s`, (v) => { c.dur = v; cambio(); }),
          seg('Fondo', [['ultimo', 'Último fotograma desenfocado'], ['marca', 'Negro de marca']], c.fondo, (v) => { c.fondo = v; refrescar(); }),
          toggle('Barra de progreso', c.barra, (v) => { c.barra = v; refrescar(); })] : [])),
      seccionPortada(P, tema, generarPortada),
      seccionFormatos(),
      h('section', { class: 'card' }, h('h2', {}, 'Caption'),
        h('p', { class: 'sub' }, 'Borrador inmediato con tus propias frases: el gancho es lo primero que dijiste, el cuerpo son las frases con más peso y el cierre es tu llamado a la acción. Edítalo aquí mismo.'),
        (() => {
          if (S.captionBorrador == null || S.captionId !== S.p.id) { S.captionBorrador = borradorCaption(palabras, c, tags); S.captionId = S.p.id; }
          const ta = h('textarea', { rows: 9, 'aria-label': 'Borrador del caption', oninput: (e) => { S.captionBorrador = e.target.value; } }, S.captionBorrador);
          return h('div', { class: 'ctl' }, ta, h('div', { class: 'row-gap' },
            h('button', { type: 'button', class: 'btn gold', onclick: () => copiar(S.captionBorrador, 'Caption copiado.') }, 'Copiar caption'),
            h('button', { type: 'button', class: 'btn ghost', onclick: () => { S.captionBorrador = borradorCaption(palabras, c, tags); pintarPanel(); } }, 'Rehacer el borrador')));
        })()),
      h('section', { class: 'card' }, h('h2', {}, 'Caption con tu estilo, con ayuda de Claude'),
        h('p', { class: 'sub' }, 'Aquí no hay conexión a una IA, así que armo el pedido completo con tu guion y tus reglas de voz. Cópialo y pégalo en Claude para recibir tres opciones. Debajo tienes hashtags sugeridos a partir de lo que dijiste.'),
        h('div', { class: 'row-gap' }, h('button', { class: 'btn gold', onclick: () => copiar(prompt, 'Pedido copiado. Pégalo en Claude.') }, 'Copiar pedido para Claude'),
          h('button', { class: 'btn ghost', onclick: () => copiar(tags.join(' '), 'Hashtags copiados.') }, 'Copiar hashtags')),
        h('div', { class: 'chips' }, tags.map((t) => h('span', { class: 'chip on' }, t))),
        h('details', {}, h('summary', {}, 'Ver el pedido completo'), h('pre', { class: 'prompt' }, prompt))),
    ];
  }

  // Borrador de caption armado con las frases del video, sin IA: gancho, tres ideas, llamado a la acción y hashtags.
  function borradorCaption(palabras, c, tags) {
    const frases = []; let cur = [];
    palabras.forEach((w) => { cur.push(w.w); if (/[.?!]$/.test(w.w)) { frases.push(cur.join(' ')); cur = []; } });
    if (cur.length) frases.push(cur.join(' '));
    const limpia = (x) => x.replace(/\*/g, '').trim();
    const gancho = limpia(frases[0] || palabras.slice(0, 14).map((w) => w.w).join(' ')).slice(0, 140);
    const claves = new Set(tags.slice(0, 6).map((t) => t.slice(1)));
    const puntaje = (f) => f.split(/\s+/).map(nz).filter((w) => claves.has(w)).length * 3 + Math.min(f.split(/\s+/).length, 18) / 6;
    const cuerpo = frases.slice(1).filter((f) => f.split(/\s+/).length >= 6).map((f) => ({ f: limpia(f), p: puntaje(f) })).sort((a, b) => b.p - a.p).slice(0, 3)
      .sort((a, b) => frases.findIndex((z) => limpia(z) === a.f) - frases.findIndex((z) => limpia(z) === b.f)).map((x) => x.f);
    const cta = [limpia(c?.texto || ''), limpia(c?.sub || '')].filter(Boolean).join(' ');
    return [gancho, '', ...cuerpo.map((x) => '• ' + x), '', cta, '', tags.slice(0, 10).join(' ')].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').trim();
  }
  // Otros formatos y subtítulos: 4:5 y 1:1 recortados del final, y el .srt con los cortes aplicados.
  function seccionFormatos() {
    const E = S.extras && S.extras.id === S.p.id ? S.extras : null;
    if (!S.p.corriendo) {
      api(`${A}/proyectos/${S.p.id}/extras`).then((r) => { const ya = S.extras && S.extras.id === S.p.id ? JSON.stringify(S.extras.v) : ''; S.extras = { id: S.p.id, v: r }; if (JSON.stringify(r) !== ya) pintarPanel(); }).catch(() => {});
    }
    const v = E ? E.v : {};
    const y = S.cropY ?? 0.45;
    const fila = (tipo, nombre, nota, necesitaFinal) => h('div', { class: 'ctl' },
      h('div', { class: 'row-between' }, h('div', {}, h('strong', {}, nombre), h('small', { class: 'hint' }, nota)),
        h('div', { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn ghost sm', disabled: (necesitaFinal && !S.p.tieneFinal) || S.p.corriendo, onclick: async () => { S.extrasHora = Date.now(); await lanzar('extra', { tipo, y, x: S.cropX ?? 0.5 }); } }, v[tipo] ? 'Volver a generar' : 'Generar'),
          v[tipo] ? h('a', { class: 'btn gold sm', href: `/api${A}/proyectos/${S.p.id}/extra/${tipo}?v=${S.extrasHora || 0}`, download: `${S.p.nombre}-${tipo === 'md' ? 'transcripcion' : tipo}.${tipo === 'srt' ? 'srt' : tipo === 'md' ? 'md' : 'mp4'}`, html: ic('descargar', 14) + ' Descargar' }) : null)));
    return h('section', { class: 'card' }, h('h2', {}, 'Otros formatos y subtítulos'),
      h('p', { class: 'sub' }, `El video final es ${(plan().formato || '9x16').replace('x', ':')}. Aquí sacas las otras proporciones y el archivo de subtítulos .srt, ya con tus cortes aplicados. Si cambia la proporción, se recorta.`),
      fila('srt', 'Subtítulos .srt', 'Texto normal, con los silencios cortados. Sirve para YouTube, LinkedIn o Facebook.', false),
      fila('md', 'Transcripción .md para Hyperframes', 'Frases y cada palabra con su segundo exacto en el video final, ya con los cortes. Sirve para animar al ritmo de la voz.', false),
      slider('Qué parte conservar: arriba o abajo', 0, 1, 0.01, y, (x) => (x < 0.3 ? 'Más de arriba' : x > 0.6 ? 'Más de abajo' : 'Centrado'), (x) => { S.cropY = x; }, 0.45),
      slider('Qué parte conservar: izquierda o derecha', 0, 1, 0.01, S.cropX ?? 0.5, (x) => (x < 0.35 ? 'Más de la izquierda' : x > 0.65 ? 'Más de la derecha' : 'Centrado'), (x) => { S.cropX = x; }, 0.5),
      ...FORMATOS_UI.filter(([k]) => k !== (plan().formato || '9x16')).map(([k, n]) => fila(k, `${n} (${FMT_NOM[k].join('x')})`, S.p.tieneFinal ? FMT_USO[k] : 'Primero exporta el video final.', true)));
  }

  const panelCierre = () => seccionesPublicar().slice(0, 1);
  const panelPublicar = () => seccionesPublicar().slice(1);

  // ----- Pausas, respiraciones y ruidos: el corte sigue a la transcripción -----
  async function panelPausas() {
    const c = plan().cortes, dur = plan().duration;
    c.manual = c.manual || []; c.ignorar = c.ignorar || [];
    const cont = h('div', { class: 'panel-in' });
    if (!S.env) {
      cont.append(h('section', { class: 'card' }, h('p', { class: 'sub' }, 'Leyendo el audio de tu video...')));
      api(`${A}/proyectos/${S.p.id}/envolvente`).then((e) => { S.env = e; if (enRecorte()) pintarPanel(); }).catch((e) => toast(e.message));
      return [cont];
    }
    const env = S.env, palabras = S.p.palabras || [], hop = env.hop || 0.01;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const mid = (r) => (r.o ? (r.o[0] + r.o[1]) / 2 : (r.s + r.e) / 2);
    const vivas = () => vivasUI();
    const durPreset = (p) => dur - porPalabras(vivas(), env.db, dur, p, hop).reduce((a, [x, y]) => a + (y - x), 0);
    const activo = () => (c.on && c.modo === 'palabras' ? (PRESETS_PAUSA.find(([, , , p]) => ['aireAntes', 'aireDespues', 'aireFin', 'minCorte'].every((k) => Math.abs((c[k] ?? -1) - p[k]) < 0.001)) || ['personal'])[0] : c.on ? 'volumen' : 'off');
    const aplicar = async (id) => {
      if (id === 'off') c.on = false;
      else { Object.assign(c, PRESETS_PAUSA.find((x) => x[0] === id)[3], { on: true, modo: 'palabras' }); delete c.auto; await recalcularCortes(); }
      cambio(); pintarPanel();
    };
    const miniatura = (id) => {
      const pat = { off: [8, 8, 8, 8, 8, 8, 8, 8], natural: [8, 8, 8, 0, 3, 8, 8, 8], agil: [8, 8, 8, 1, 8, 8, 8, 8], seco: [8, 8, 8, 8, 8, 8, 8, 8] }[id];
      return h('span', { class: 'pz-mini', 'aria-hidden': 'true' }, pat.map((v, i) => h('i', { style: `height:${v ? 6 + (i * 5 % 11) : 3}px;opacity:${v ? 1 : 0.35}` })));
    };
    const tarjeta = (id, nombre, nota, resultado) => h('button', { type: 'button', class: 'pz' + (activo() === id ? ' on' : ''), 'aria-pressed': String(activo() === id), onclick: () => aplicar(id) },
      miniatura(id), h('strong', {}, nombre), h('small', {}, nota), h('em', {}, resultado));
    let todos = [], sel = S.corteSel || null;
    const ignorado = (r) => r.tipo === 'auto' && c.ignorar.some(([a, b]) => mid(r) >= a && mid(r) <= b);
    const recalcular = () => {
      const auto = c.on && c.modo === 'palabras' ? porPalabras(vivas(), env.db, dur, c, hop).map((r) => ({ s: r[0], e: r[1], o: [r[0], r[1]], tipo: 'auto' })) : [];
      const man = c.manual.map((r, i) => ({ s: r[0], e: r[1], o: null, tipo: 'manual', i }));
      const txt = (c.borradas || []).map(([a, b]) => ({ s: a, e: b, o: null, tipo: 'texto' }));
      todos = [...auto, ...man, ...txt].sort((a, b) => a.s - b.s);
      if (c.on && c.modo === 'palabras') { c.rangos = unirR([...todos.filter((x) => x.tipo === 'auto' && !ignorado(x)).map((x) => [x.s, x.e]), ...c.manual]); delete c.auto; }
    };
    const idDe = (r) => (r.tipo === 'auto' ? `a${r.o[0]}` : r.tipo === 'manual' ? `m${r.i}` : `t${r.s}`);
    recalcular();
    const zoom0 = 1;
    let zoom = S.zoomCortes || zoom0;
    const resumen = h('div', { class: 'resumen-c' });
    const scroller = h('div', { class: 'tl-scroll', tabindex: '0', 'aria-label': 'Línea de tiempo del audio' });
    const tl = h('div', { class: 'tl' });
    const canvas = h('canvas', { class: 'tl-onda', role: 'img', 'aria-label': 'Onda de audio. Lo que se corta está en rojo y azul.' });
    const capaCortes = h('div', { class: 'tl-cortes' }), capaPal = h('div', { class: 'tl-pal' }), cabeza = h('b', { class: 'tl-cabeza' });
    tl.append(canvas, capaCortes, capaPal, cabeza); scroller.append(tl);
    const detalle = h('div', { class: 'tl-det' });
    const tx = (t) => (t / dur) * 100;
    const aT = (clientX) => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur)); };
    const dibujarOnda = () => {
      const ancho = Math.round((scroller.clientWidth || 640) * zoom), w = Math.min(ancho, 14000), hgt = 120, dpr = Math.min(window.devicePixelRatio || 1, 2);
      tl.style.width = `${ancho}px`;
      canvas.width = w * dpr; canvas.height = hgt * dpr; canvas.style.height = `${hgt}px`;
      const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, hgt);
      const yDb = (d) => hgt - ((Math.max(-60, Math.min(0, d)) + 60) / 60) * (hgt - 10) - 4;
      const n = env.db.length, per = n / w;
      g.fillStyle = css('--ink'); g.globalAlpha = 0.85;
      for (let x = 0; x < w; x += 2) {
        let m = -90; for (let i = Math.floor(x * per); i < Math.min(n, Math.floor((x + 2) * per)); i++) m = Math.max(m, env.db[i]);
        const y = yDb(m); g.fillRect(x, y, 1.4, hgt - y - 2);
      }
      g.globalAlpha = 1;
    };
    const enCorte = (t) => (c.on && (c.rangos || []).some(([a, b]) => t >= a && t <= b)) || (c.borradas || []).some(([a, b]) => t >= a && t <= b);
    const alternar = (r) => {
      if (r.tipo === 'texto') return toast('Esto se quitó con el texto. Devuélvelo desde la transcripción.');
      if (r.tipo === 'manual') { c.manual.splice(r.i, 1); sel = null; S.corteSel = null; }
      else if (ignorado(r)) c.ignorar = c.ignorar.filter(([a, b]) => !(mid(r) >= a && mid(r) <= b));
      else c.ignorar.push([r.o[0], r.o[1]]);
      recalcular(); cambio(); pintarTodo();
    };
    // Mover un borde de una pausa automática la convierte en un corte tuyo: la pausa original queda conservada.
    const aManual = (r) => {
      c.ignorar.push([r.o[0], r.o[1]]); c.manual.push([r.s, r.e]);
      recalcular(); const k = c.manual.length - 1; sel = `m${k}`; S.corteSel = sel; return todos.find((x) => idDe(x) === sel);
    };
    const mover = (r, lado, t) => {
      if (r.tipo === 'auto') r = aManual(r);
      const min = 0.05; t = +t.toFixed(3);
      const [a, b] = c.manual[r.i];
      c.manual[r.i] = lado === 'l' ? [Math.min(t, b - min), b] : [a, Math.max(t, a + min)];
      recalcular(); return todos.find((x) => idDe(x) === `m${r.i}`) || r;
    };
    const pintarCortes = () => {
      capaCortes.replaceChildren(...todos.map((r) => {
        const off = ignorado(r), id = idDe(r), editable = r.tipo !== 'texto';
        const el = h('div', { class: 'tl-corte' + (off ? ' off' : '') + (r.tipo === 'manual' ? ' manual' : '') + (r.tipo === 'texto' ? ' texto' : '') + (sel === id ? ' sel' : ''), style: `left:${tx(r.s)}%;width:${Math.max(tx(r.e - r.s), 0.15)}%`, title: r.tipo === 'texto' ? 'Quitado con el texto' : `${fmt(r.s)} a ${fmt(r.e)}` });
        if (editable && !off) ['l', 'r'].forEach((lado) => el.append(h('i', { class: `borde ${lado}`, 'aria-hidden': 'true' })));
        return el;
      }));
    };
    const pintarPalabras = () => {
      const px = tl.clientWidth / dur;
      const br = c.borradas || [];
      const cae = (w) => enCorte((w.start + w.end) / 2);
      if (px < 55) { capaPal.replaceChildren(...palabras.map((w) => h('i', { class: 'tick' + (cae(w) ? ' cortada' : ''), style: `left:${tx(w.start)}%` }))); capaPal.classList.add('lejos'); return; }
      capaPal.classList.remove('lejos');
      capaPal.replaceChildren(...palabras.map((w) => h('span', { class: 'pal' + (cae(w) ? ' cortada' : ''), style: `left:${tx(w.start)}%`, 'data-t': String(w.start), title: 'Clic para ir a esta palabra' }, w.w)));
    };
    const tapadas = () => vivas().filter((w) => c.manual.some(([a, b]) => (w.start + w.end) / 2 >= a && (w.start + w.end) / 2 <= b));
    const pintarResumen = () => {
      const q = unirR([...(c.on ? c.rangos || [] : []), ...(c.borradas || [])]).reduce((a, [x, y]) => a + Math.max(0, Math.min(y, dur) - Math.max(x, 0)), 0), tap = tapadas();
      const nb = h('div', {},
        h('div', { class: 'stat' }, h('b', {}, `${(dur - q).toFixed(1)} s`), h('small', {}, `dura el video (antes ${dur.toFixed(1)} s)`)),
        h('div', { class: 'stat' }, h('b', {}, `${q.toFixed(1)} s`), h('small', {}, 'se quitan')),
        h('div', { class: 'stat' }, h('b', {}, String(c.on ? (c.rangos || []).length : 0)), h('small', {}, 'cortes de pausa y ruido')),
        h('div', { class: 'stat' + (tap.length ? ' alerta' : '') }, h('b', {}, String(tap.length)), h('small', {}, tap.length ? `palabras tapadas por un corte tuyo: ${tap.slice(0, 3).map((w) => w.w).join(' ')}${tap.length > 3 ? '...' : ''}` : 'palabras tapadas por tus cortes')));
      resumen.replaceChildren(...nb.childNodes);
    };
    const pintarDetalle = () => {
      const r = todos.find((x) => idDe(x) === sel);
      if (!r) return detalle.replaceChildren(h('p', { class: 'tl-ayuda' }, h('b', {}, 'Cómo se usa: '), 'arrastra sobre un espacio vacío para cortar ahí, aunque sea en medio de una frase. Arrastra el borde de una zona roja para ajustarla, o por dentro para moverla entera. Doble clic la conserva o la quita. Con Cmd y la rueda haces zoom para cortes muy cortos.'));
      const off = ignorado(r), nudge = (lado, d) => { const t = (lado === 'l' ? r.s : r.e) + d; const nr = mover(r, lado, t); sel = idDe(nr); S.corteSel = sel; cambio(); pintarTodo(); };
      const btn = (txt, ico, fn, cls = 'ghost') => h('button', { type: 'button', class: `btn ${cls} sm`, onclick: fn, html: ic(ico, 14) + ` ${txt}` });
      const par = (txt, lado) => h('div', { class: 'ajuste-f' }, h('span', { class: 'lbl' }, txt), h('div', { class: 'row-gap' },
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `${txt}: 0,1 s antes`, onclick: () => nudge(lado, -0.1) }, '−0,1 s'),
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `${txt}: 0,1 s después`, onclick: () => nudge(lado, 0.1) }, '+0,1 s')));
      const titulo = r.tipo === 'manual' ? 'Corte tuyo' : r.tipo === 'texto' ? 'Quitado con el texto' : 'Pausa o ruido';
      detalle.replaceChildren(
        h('div', { class: 'tl-det-top' }, h('strong', {}, `${titulo} de ${fmt(r.s)} a ${fmt(r.e)}`), h('span', { class: 'tag' }, `${(r.e - r.s).toFixed(2)} s`), off ? h('span', { class: 'tag warn' }, 'Se conserva') : null),
        ...(r.tipo === 'texto' ? [h('p', { class: 'hint' }, 'Para devolverlo, selecciona esas palabras tachadas en la transcripción y pulsa Supr.')] : [
          h('div', { class: 'row-gap' },
            btn('Escuchar', 'play', () => { if (video) { video.currentTime = tVideo(Math.max(0, r.s - 1)); video.play().catch(() => {}); } }),
            r.tipo === 'auto' ? btn(off ? 'Volver a cortar' : 'Conservar', off ? 'cortes' : 'check', () => alternar(r), off ? 'ghost' : 'gold') : btn('Quitar este corte', 'x', () => alternar(r))),
          off ? null : h('div', { class: 'tl-ajustes' }, par('Inicio', 'l'), par('Final', 'r'))]));
      decorar(detalle);
    };
    // Un solo manejador para toda la línea. Según dónde pulses:
    //   cerca de un borde de corte  -> arrastras el borde
    //   dentro de un corte          -> clic lo selecciona, arrastrar lo mueve entero
    //   en cualquier otro punto     -> clic salta a ese momento, arrastrar marca un corte nuevo
    const ZONA = 10;
    const golpe = (clientX) => {
      const r = tl.getBoundingClientRect(), x = clientX - r.left, px = (t) => (t / dur) * r.width;
      let mejor = null;
      for (const cu of todos) {
        if (cu.tipo === 'texto' || ignorado(cu)) continue;
        const a = px(cu.s), b = px(cu.e), z = Math.min(ZONA, Math.max(3, (b - a) / 3)), bono = idDe(cu) === sel ? 2 : 0;
        const da = Math.abs(x - a) - bono, db = Math.abs(x - b) - bono;
        if (da <= z && (!mejor || da < mejor.d)) mejor = { tipo: 'borde', lado: 'l', cu, d: da };
        if (db <= z && (!mejor || db < mejor.d)) mejor = { tipo: 'borde', lado: 'r', cu, d: db };
      }
      if (mejor) return mejor;
      const dentro = todos.find((cu) => x >= px(cu.s) && x <= px(cu.e));
      return dentro ? { tipo: 'cuerpo', cu: dentro } : { tipo: 'vacio' };
    };
    const saltar = (t) => { if (video) video.currentTime = tVideo(t); };
    tl.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const g = golpe(e.clientX);
      tl.style.cursor = g.tipo === 'borde' ? 'ew-resize' : g.tipo === 'cuerpo' ? (g.cu.tipo === 'texto' ? 'pointer' : 'grab') : 'crosshair';
    });
    tl.addEventListener('dblclick', (e) => { const g = golpe(e.clientX); if (g.tipo !== 'vacio') alternar(g.cu); });
    tl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      const g = golpe(e.clientX), t0 = aT(e.clientX), x0 = e.clientX, pal = e.target.closest ? e.target.closest('.pal') : null;
      let t1 = t0, movido = false, idx = -1, base = null;
      const guia = g.tipo === 'vacio' ? h('div', { class: 'tl-corte nuevo', style: `left:${tx(t0)}%;width:0%` }) : null;
      if (guia) capaCortes.append(guia);
      if (g.tipo !== 'vacio') { sel = idDe(g.cu); S.corteSel = sel; pintarCortes(); pintarDetalle(); }
      tl.setPointerCapture(e.pointerId);
      const arrancaEdicion = () => { let cu = g.cu; if (cu.tipo === 'auto') cu = aManual(cu); idx = cu.i; base = [...c.manual[idx]]; };
      tl.onpointermove = (ev) => {
        if (!movido && Math.abs(ev.clientX - x0) < 4) return;
        const sc = scroller.getBoundingClientRect();
        if (ev.clientX > sc.right - 30) scroller.scrollLeft += 14; else if (ev.clientX < sc.left + 30) scroller.scrollLeft -= 14;
        const t = aT(ev.clientX);
        if (g.tipo === 'vacio') {
          movido = true; t1 = t; const a = Math.min(t0, t1), b = Math.max(t0, t1);
          guia.style.left = `${tx(a)}%`; guia.style.width = `${tx(b - a)}%`; return;
        }
        if (g.cu.tipo === 'texto') return;
        if (!movido) { movido = true; arrancaEdicion(); }
        const [a, b] = base;
        if (g.tipo === 'borde') c.manual[idx] = g.lado === 'l' ? [+Math.max(0, Math.min(t, b - 0.05)).toFixed(3), b] : [a, +Math.min(dur, Math.max(t, a + 0.05)).toFixed(3)];
        else { const len = b - a, ini = Math.max(0, Math.min(dur - len, a + (t - t0))); c.manual[idx] = [+ini.toFixed(3), +(ini + len).toFixed(3)]; }
        recalcular(); pintarCortes(); pintarPalabras(); pintarResumen(); pintarDetalle(); if (live) live.redraw();
      };
      const fin = (ev) => {
        tl.onpointermove = null; tl.onpointerup = null; tl.onpointercancel = null;
        try { tl.releasePointerCapture(e.pointerId); } catch (_) { /* ya liberado */ }
        if (guia) guia.remove();
        if (g.tipo === 'vacio') {
          if (movido && Math.abs(t1 - t0) >= 0.05) {
            c.manual.push([+Math.min(t0, t1).toFixed(3), +Math.max(t0, t1).toFixed(3)]);
            if (!c.on) { c.on = true; c.modo = 'palabras'; Object.assign(c, PRESETS_PAUSA[1][3]); }
            recalcular(); sel = `m${c.manual.length - 1}`; S.corteSel = sel; cambio(); pintarTodo();
          } else { sel = null; S.corteSel = null; saltar(pal ? Number(pal.dataset.t) : t0); pintarCortes(); pintarDetalle(); }
        } else if (movido) { cambio(); pintarTodo(); }
        else saltar(t0);
      };
      tl.onpointerup = fin; tl.onpointercancel = fin;
    });
    const pintarTodo = () => { dibujarOnda(); pintarCortes(); pintarPalabras(); pintarResumen(); pintarDetalle(); pintarTiles(); };
    S.pausasRepinta = () => { if (!cont.isConnected) return; recalcular(); pintarTodo(); };
    const poner = (z) => { zoom = Math.max(1, Math.min(40, z)); S.zoomCortes = zoom; const t = video ? video.currentTime : 0; pintarTodo(); scroller.scrollLeft = (t / dur) * tl.clientWidth - scroller.clientWidth / 2; };
    scroller.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); poner(zoom * (e.deltaY < 0 ? 1.25 : 0.8)); }, { passive: false });
    const paso = (label, key, step, min, max, nota) => h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, label),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `Menos ${label}`, onclick: async () => { c[key] = +Math.max(min, (c[key] ?? 0) - step).toFixed(3); await recalcularCortes(); cambio(); pintarPanel(); } }, '−'),
        h('output', {}, `${Math.round((c[key] ?? 0) * 1000)} ms`),
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `Más ${label}`, onclick: async () => { c[key] = +Math.min(max, (c[key] ?? 0) + step).toFixed(3); await recalcularCortes(); cambio(); pintarPanel(); } }, '+')),
      h('small', { class: 'hint' }, nota));
    const pr = Object.fromEntries(PRESETS_PAUSA.map(([id, , , p]) => [id, durPreset(p)]));
    const lineaTxt = (v) => `queda en ${v.toFixed(1)} s`;
    cont.append(
      h('section', { class: 'card' }, h('h2', {}, 'Pausas, respiraciones y ruidos'),
        h('p', { class: 'sub' }, 'Se queda solo lo que dices. Lo demás se corta: pausas largas, respiraciones, golpes y ruido de la calle, suenen fuerte o bajito. Las palabras que borraste arriba tampoco entran.'),
        h('div', { class: 'pzs' },
          tarjeta('off', 'Sin cortes', 'Todo el audio tal cual', lineaTxt(dur)),
          PRESETS_PAUSA.map(([id, n, nota]) => tarjeta(id, n, nota, lineaTxt(pr[id])))),
        c.on && c.modo !== 'palabras' ? h('div', { class: 'aviso' }, h('span', {}, 'Este video usaba el corte por volumen, que puede comerse palabras bajitas y dejar pasar ruidos fuertes.'), h('button', { type: 'button', class: 'btn gold sm', onclick: () => aplicar('agil') }, 'Pasar al corte por palabras')) : null,
        resumen),
      c.on ? h('section', { class: 'card' }, h('h2', {}, 'Afinar los cortes'),
        h('div', { class: 'tl-barra' },
          h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Alejar', onclick: () => poner(zoom * 0.7), html: ic('zoom', 14) + ' −' }),
          h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Acercar', onclick: () => poner(zoom * 1.4), html: ic('zoom', 14) + ' +' }),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => poner(1) }, 'Ver todo'),
          h('span', { class: 'hint' }, 'Ctrl o Cmd y la rueda también acercan')),
        scroller,
        h('div', { class: 'tl-leyenda' }, h('span', {}, h('i', { class: 'lg rojo' }), 'Se corta'), h('span', {}, h('i', { class: 'lg raya' }), 'Conservado por ti'), h('span', {}, h('i', { class: 'lg azul' }), 'Corte tuyo'), h('span', {}, h('i', { class: 'lg txt' }), 'Quitado con el texto')),
        detalle) : null,
      c.on ? h('details', { class: 'card' }, h('summary', {}, 'Cuánto aire dejar alrededor de las palabras'),
        paso('Aire antes de cada palabra', 'aireAntes', 0.02, 0, 0.4, 'Más aire evita que se coma el principio de una palabra.'),
        paso('Aire después de cada palabra', 'aireDespues', 0.02, 0, 0.5, 'Más aire deja respirar y evita cortar el final.'),
        paso('Aire extra al terminar una frase', 'aireFin', 0.02, 0, 0.6, 'Un respiro más largo después de un punto o una pregunta.'),
        paso('No cortar pausas menores a', 'minCorte', 0.02, 0.04, 0.6, 'Las pausas más cortas que esto se dejan como están.'),
        slider('Fundido de audio en cada unión', 0, 40, 1, c.fundido, (v) => `${v} ms`, (v) => { c.fundido = v; cambio(); }),
        toggle('Zoom en cada corte', c.zoomAlterna, (v) => { c.zoomAlterna = v; cambio(); }, 'Un tramo sí y otro no sale con zoom, para que el salto no se note.')) : null);
    requestAnimationFrame(() => { pintarTodo(); });
    const seguir = setInterval(() => {
      if (!cont.isConnected) return clearInterval(seguir);
      const t = video ? video.currentTime : 0; cabeza.style.left = `${tx(t)}%`;
      if (video && !video.paused) { const x = (t / dur) * tl.clientWidth; if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 40) scroller.scrollLeft = x - 40; }
    }, 80);
    if (!window.__thResize) { window.__thResize = true; window.addEventListener('resize', () => { if (enRecorte()) pintarPanel(); }); }
    return [cont];
  }
  async function panelRecorte() {
    return [cardTexto(), cardLimpieza(), ...(await panelPausas())];
  }

  // ----- Estilo -----
  function aplicarLook(l) {
    const dis = (f) => !f || S.fuentes.includes(f);
    const patch = structuredClone(l.patch);
    if (!dis(patch.font)) delete patch.font;
    if (!dis(patch.emphFont)) patch.emphFont = '';
    if (patch.subs) { if (!dis(patch.subs.font)) delete patch.subs.font; if (!dis(patch.subs.emphFont)) patch.subs.emphFont = ''; }
    S.p.plan.style = fusionar(estilo(), patch);
    refrescar(); toast(`Look ${l.nombre} aplicado`);
  }
  async function seccionesLooks() {
    const st = estilo();
    const propios = await api(A + '/looks').catch(() => []);
    const aplicarPropio = (l) => { S.p.plan.style = fusionar(estilo(), structuredClone(l.style)); refrescar(); toast(`Look ${l.nombre} aplicado`); };
    const guardarLook = async () => {
      const nombre = (prompt('Nombre para este look:') || '').trim();
      if (!nombre) return;
      await api(A + '/looks', { method: 'POST', body: { nombre, style: structuredClone(estilo()) } });
      toast(`Look ${nombre} guardado.`); pintarPanel();
    };
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Mis looks'),
        h('p', { class: 'sub' }, 'Guarda el estilo actual (tipografías, colores, brillo, subtítulos, imagen y zooms) para usarlo en cualquier video.'),
        propios.length ? h('div', { class: 'looks' }, propios.map((l) => h('div', { class: 'look own' },
          h('span', { class: 'look-aa', style: `font-family:${fam(l.style.font)};color:${l.style.accent}` }, 'Aa'),
          h('strong', {}, l.nombre),
          h('div', { class: 'row-gap' },
            h('button', { type: 'button', class: 'btn gold sm', onclick: () => aplicarPropio(l) }, 'Usar'),
            h('button', { type: 'button', class: 'btn danger sm', 'aria-label': 'Borrar look ' + l.nombre, onclick: async () => { if (confirm(`¿Borrar el look ${l.nombre}?`)) { await api(`${A}/looks/${l.id}`, { method: 'DELETE' }); pintarPanel(); } } }, 'Borrar'))))) : h('p', { class: 'hint' }, 'Todavía no guardaste ninguno.'),
        h('div', {}, h('button', { type: 'button', class: 'btn ghost', onclick: guardarLook, html: icon('plus') + ' Guardar el estilo actual como look' }))),
      h('section', { class: 'card' }, h('h2', {}, 'Looks listos'), h('p', { class: 'sub' }, 'Un clic cambia tipografías, colores, brillo y zooms a la vez. Después afinas lo que quieras.'),
        h('div', { class: 'looks' }, LOOKS.map((l) => h('button', { type: 'button', class: 'look', onclick: () => aplicarLook(l) },
          h('span', { class: 'look-aa', style: `font-family:${fam(l.f)}` }, 'Aa'), h('strong', {}, l.nombre), h('small', {}, l.nota))))),
    ];
  }

  // ----- Títulos -----
  const corto = (t) => { const s = t.replace(/\*/g, '').trim(); return !s.includes(' ') && s.length <= 9; };
  function repartir() {
    const st = estilo();
    const perm = st.posiciones.length ? st.posiciones : ['arriba'];
    const anims = st.animaciones.length ? st.animaciones : ['pop'];
    ordenar().forEach((ev, k) => {
      let pos = null;
      for (let j = 0; j < perm.length; j++) { const p = perm[(k + j) % perm.length]; if (p === 'detras' && !corto(ev.text)) continue; pos = p; break; }
      ev.pos = pos || 'arriba'; delete ev.y;
      if (ev.pos === 'detras') ev.size = ev.size === 'XL' || ev.size === 'L' ? ev.size : 'L';
      if ((ev.pos === 'centro' || ev.pos === 'abajo') && ev.size === 'XL') ev.size = 'L';
      ev.anim = anims[k % anims.length];
      ev.sfx = st.sonidoTitulos === 'auto' ? sfxAuto(ev.anim) : st.sonidoTitulos;
    });
    refrescar(); toast('Repartí posiciones y animaciones entre tus títulos');
  }
  // Al cambiar "dónde pueden aparecer" o "animaciones", los títulos que ya no cumplen se mueven al instante.
  function ajustarAPermitidas() {
    const st = estilo(), perm = st.posiciones, anims = st.animaciones.length ? st.animaciones : ['pop'];
    let movidos = 0, kp = 0, ka = 0;
    ordenar().forEach((ev) => {
      if (ev.kind) return;
      if (!perm.includes(ev.pos) || (ev.pos === 'detras' && !corto(ev.text))) {
        let pos = null;
        for (let j = 0; j < perm.length; j++) { const p = perm[(kp + j) % perm.length]; if (p === 'detras' && !corto(ev.text)) continue; pos = p; break; }
        kp++;
        ev.pos = pos || perm.find((p) => p !== 'detras') || 'arriba'; delete ev.y;
        if (ev.pos === 'detras') ev.size = ev.size === 'XL' || ev.size === 'L' ? ev.size : 'L';
        if ((ev.pos === 'centro' || ev.pos === 'abajo') && ev.size === 'XL') ev.size = 'L';
        movidos++;
      }
      if (!anims.includes(ev.anim)) { ev.anim = anims[ka++ % anims.length]; if (st.sonidoTitulos === 'auto') ev.sfx = sfxAuto(ev.anim); movidos++; }
    });
    return movidos;
  }
  const objetivo = () => (S.sel.size ? plan().events.filter((e) => S.sel.has(e.id)) : plan().events);
  function aplicarA(campo, valor) {
    const lista = objetivo();
    lista.forEach((e) => {
      e[campo] = valor;
      if (campo === 'pos') delete e.y;
      if (campo === 'anim' && estilo().sonidoTitulos === 'auto') e.sfx = sfxAuto(valor);
    });
    refrescar(); toast(`Cambié ${lista.length} ${lista.length === 1 ? 'título' : 'títulos'}`);
  }
  function resaltarPalabra(ev, i) {
    const t = ev.text.split(/\s+/);
    t[i] = t[i].startsWith('*') && t[i].endsWith('*') && t[i].length > 2 ? t[i].slice(1, -1) : `*${t[i].replace(/\*/g, '')}*`;
    ev.text = t.join(' '); refrescar();
  }
  function filaTitulo(ev) {
    const abierto = S.abiertos.has(ev.id);
    const aviso = ev.pos === 'detras' && !corto(ev.text);
    const toggleAb = () => { abierto ? S.abiertos.delete(ev.id) : S.abiertos.add(ev.id); pintarPanel(); };
    return h('li', { class: 'ev' + (S.sel.has(ev.id) ? ' sel' : '') },
      h('div', { class: 'ev-top' },
        h('input', { type: 'checkbox', class: 'chk', 'aria-label': 'Seleccionar título', checked: S.sel.has(ev.id), onchange: (e) => { e.target.checked ? S.sel.add(ev.id) : S.sel.delete(ev.id); pintarPanel(); } }),
        h('span', { class: 'tiempo' }, fmt(ev.start)),
        h('input', { class: 'ev-text', value: ev.text.replace(/\*/g, ''), 'aria-label': 'Texto del título', style: `font-family:${fam(estilo().font)}`,
          onchange: (e) => { ev.text = e.target.value.toUpperCase(); cambio(); pintarPanel(); } }),
        h('span', { class: 'tag' }, (POS.find((p) => p[0] === ev.pos) || [])[1]),
        h('button', { class: 'btn ghost sm', 'aria-expanded': String(abierto), onclick: toggleAb }, abierto ? 'Cerrar' : 'Ajustar')),
      aviso ? h('p', { class: 'warn-t' }, 'Detrás de la cabeza solo se lee una palabra corta. Mejor Arriba, Centro o Abajo.') : null,
      abierto ? h('div', { class: 'ev-det' },
        seg('Posición', POS, ev.pos, (v) => { ev.pos = v; delete ev.y; refrescar(); }),
        seg('Tamaño', TAM, ev.size, (v) => { ev.size = v; refrescar(); }),
        seg('Animación', ANIM, ev.anim, (v) => { ev.anim = v; refrescar(); }),
        seg('Sonido', sfxOpts(), ev.sfx || 'none', (v) => { ev.sfx = v; oirSfx(v); refrescar(); }),
        seg('Color', [['accent', 'Acento'], ['text', 'Texto']], ev.color, (v) => { ev.color = v; refrescar(); }),
        slider('Altura en pantalla', 0.08, 0.85, 0.01, ev.y ?? ALTURA_POS[ev.pos] ?? 0.3, (v) => `${Math.round(v * 100)}% desde arriba${ev.y == null ? ' (automática)' : ''}`, (v) => { ev.y = v; cambio(); }),
        ev.y != null ? h('div', {}, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { delete ev.y; refrescar(); } }, 'Volver a la altura automática')) : null,
        ev.text.includes(' ') ? h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Palabra clave (toca una)'), h('div', { class: 'chips' }, ev.text.split(/\s+/).map((w, i) => h('button', { type: 'button', class: 'chip' + (w.startsWith('*') && w.length > 2 ? ' on' : ''), onclick: () => resaltarPalabra(ev, i) }, w.replace(/\*/g, ''))))) : null,
        h('div', { class: 'ev-times' },
          h('label', { class: 'mini-f' }, 'Entra (s)', h('input', { type: 'number', step: 0.05, min: 0, value: ev.start, onchange: (e) => { ev.start = Math.max(0, Number(e.target.value)); refrescar(); } })),
          h('label', { class: 'mini-f' }, 'Sale (s)', h('input', { type: 'number', step: 0.05, min: 0, value: ev.end, onchange: (e) => { ev.end = Math.max(ev.start + 0.2, Number(e.target.value)); refrescar(); } }))),
        h('div', { class: 'row-gap' },
          h('button', { class: 'btn ghost sm', onclick: () => { if (video) { video.currentTime = Math.max(0, tVideo(ev.start) - 0.3); video.play().catch(() => {}); } } }, 'Ir a este momento'),
          h('button', { class: 'btn ghost sm', onclick: () => lanzar('renderizar', { calidad: 'borrador', desde: Math.max(0, ev.start - 1), hasta: ev.end + 1 }) }, 'Probar solo este tramo'),
          h('button', { class: 'btn danger sm', onclick: () => { plan().events = plan().events.filter((x) => x !== ev); S.sel.delete(ev.id); refrescar(); } }, 'Quitar'))) : null);
  }

  // ----- Elegir palabras grandes desde la transcripción -----
  const puntajeTitulo = (w) => {
    const n = nz(w);
    if (!n || STOP_T.has(n)) return 0;
    let p = n.length;
    if (CLAVES_T.has(n)) p += 5; else if (VERBAL_T.some((x) => n.endsWith(x)) || /[óé]$/.test(w)) p -= 3;
    if (n.endsWith('mente')) p -= 3;
    if (/\d/.test(n)) p += 6;
    if (/^\p{Lu}/u.test(w)) p += 1;
    return p;
  };
  const sinSignos = (w) => w.replace(/[^\p{L}\p{N}%$]/gu, '');
  // Qué palabras de la transcripción ya son un título (índice -> evento)
  function mapaGrandes(pal) {
    const m = new Map();
    for (const ev of plan().events.filter((e) => !e.kind)) {
      const toks = String(ev.text || '').replace(/\*/g, '').split(/\s+/).map(nz).filter(Boolean);
      if (!toks.length) continue;
      let i0 = -1, mejor = 0.5;
      pal.forEach((w, i) => { const d = Math.abs(w.start - (ev.start + 0.05)); if (d < mejor && nz(w.w) === toks[0]) { mejor = d; i0 = i; } });
      if (i0 < 0) continue;
      toks.forEach((t, k) => { if (pal[i0 + k] && nz(pal[i0 + k].w) === t) m.set(i0 + k, ev); });
    }
    return m;
  }
  // Sugerencia: la palabra de más peso de cada frase, si llega al mínimo de la cantidad de títulos elegida
  function sugerirGrandes(pal, vivas, grandes) {
    const min = DENS_MIN[estilo().densidad] || 5, out = [];
    let cur = [];
    const cierra = () => {
      if (!cur.length) return;
      const mejor = cur.reduce((a, b) => (puntajeTitulo(pal[b].w) > puntajeTitulo(pal[a].w) ? b : a), cur[0]);
      const sc = puntajeTitulo(pal[mejor].w);
      if (sc >= min && !grandes.has(mejor)) out.push({ i: mejor, sc });
      cur = [];
    };
    vivas.forEach((i, n) => {
      cur.push(i);
      const sig = n + 1 < vivas.length ? pal[vivas[n + 1]].start - pal[i].end : 99;
      if (sig >= 0.35 || /[.?!¿¡]$/.test(pal[i].w) || cur.length >= 7) cierra();
    });
    cierra();
    return out;
  }
  function crearGrande(ws) {
    const st = estilo(), perm = st.posiciones.length ? st.posiciones : ['arriba'], anims = st.animaciones.length ? st.animaciones : ['pop'];
    const k = plan().events.filter((e) => !e.kind).length;
    let partes = ws.map((w) => sinSignos(w.w).toUpperCase()).filter(Boolean);
    if (!partes.length) return null;
    const dur = plan().duration || 1e9;
    if (partes.length > 1) { const m = partes.reduce((a, b, q) => (puntajeTitulo(ws[q].w) > puntajeTitulo(ws[a].w) ? q : a), 0); partes[m] = `*${partes[m]}*`; }
    const texto = partes.join(' '), plano = texto.replace(/\*/g, '');
    let pos = null;
    for (let j = 0; j < perm.length; j++) { const p = perm[(k + j) % perm.length]; if (p === 'detras' && !corto(plano)) continue; pos = p; break; }
    pos = pos || perm.find((p) => p !== 'detras') || 'arriba';
    const nmax = Math.max(...plano.split(' ').map((x) => x.length)); let size = nmax <= 6 ? 'XL' : nmax <= 10 ? 'L' : 'M';
    if ((pos === 'centro' || pos === 'abajo') && size === 'XL') size = 'L';
    const anim = anims[k % anims.length], start = Math.max(0, ws[0].start - 0.05);
    return { id: 'e' + Date.now().toString(36) + Math.floor(Math.random() * 99), start: +start.toFixed(2), end: +Math.min(Math.max(ws[ws.length - 1].end + 0.55, start + 1.0), dur).toFixed(2),
      text: texto, pos, size, anim, color: k % 2 === 0 ? 'accent' : 'text', sfx: st.sonidoTitulos === 'auto' ? sfxAuto(anim) : st.sonidoTitulos };
  }
  function cardElegirGrandes() {
    const caja = h('section', { class: 'card' }, h('h2', {}, 'Elegir palabras grandes'));
    const pal = S.p.palabras || [];
    if (!pal.length) { caja.append(h('p', { class: 'sub' }, 'Todavía no hay transcripción. Cuando termine de analizar el video, aquí eliges las palabras que van en grande.')); return caja; }
    let sel = new Set(), base = new Set(), ancla = -1, arrastra = false, movido = false;
    const rango = (a, b) => { const r = []; for (let q = Math.min(a, b); q <= Math.max(a, b); q++) r.push(q); return r; };
    const cont = h('div', { class: 'kar kar-grandes', tabindex: '0', 'aria-label': 'Transcripción. Selecciona palabras y pulsa Intro para ponerlas en grande.' });
    const barra = h('div', { class: 'kbar', 'aria-live': 'polite' });
    const br = plan().cortes.borradas || [], vivas = pal.map((_, i) => i).filter((i) => !borradaPal(pal[i], br));
    const grandes = mapaGrandes(pal), sugs = sugerirGrandes(pal, vivas, grandes), esSug = new Map(sugs.map((x) => [x.i, x]));
    const spans = vivas.map((i, n) => {
      const sp = h('span', { class: 'kw' + (grandes.has(i) ? ' big' : '') + (esSug.has(i) ? ' sug' : ''), title: esSug.has(i) ? 'Sugerida: es la palabra con más peso de su frase.' : 'Arrastra para seleccionar. Cmd+clic suma o quita palabras sueltas. Máximo 3 seguidas por título.' }, pal[i].w);
      sp.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; e.preventDefault(); cont.focus({ preventScroll: true });
        const cmd = e.metaKey || e.ctrlKey;
        if (e.shiftKey && ancla >= 0) { base = cmd ? new Set(sel) : new Set(); sel = new Set([...base, ...rango(ancla, n)]); movido = true; }
        else if (cmd) { base = new Set(sel); ancla = n; arrastra = true; movido = false; if (sel.has(n)) sel.delete(n); else sel.add(n); }  // Cmd+clic: suma o quita una palabra suelta
        else { base = new Set(); ancla = n; sel = new Set([n]); arrastra = true; movido = false; }
        marcar();
      });
      sp.addEventListener('mouseenter', () => { if (arrastra && ancla >= 0) { sel = new Set([...base, ...rango(ancla, n)]); if (n !== ancla) movido = true; marcar(); } });
      sp.addEventListener('click', (e) => { if (!movido && video && !(e.metaKey || e.ctrlKey || e.shiftKey)) video.currentTime = tVideo(pal[i].start); });
      sp.addEventListener('dblclick', () => { sel = new Set([n]); alternar(); });
      return sp;
    });
    const fin = () => { arrastra = false; }; document.addEventListener('mouseup', fin);
    const selN = () => [...sel].sort((a, b) => a - b);
    const selPal = () => selN().map((n) => vivas[n]);
    // al repintar la tarjeta, la lista vuelve a donde estaba en vez de saltar al inicio
    const guardaScroll = () => { const o = cont.closest('.panel'); S.scrKar = { i: cont.scrollTop, o: o ? o.scrollTop : 0, op: o, t: Date.now() }; };
    function alternar() {
      const idx = selPal(); if (!idx.length) return;
      const g = grandes, todas = idx.every((i) => g.has(i));
      if (todas) {
        const evs = new Set(idx.map((i) => g.get(i))); plan().events = plan().events.filter((e) => !evs.has(e));
        toast(`Quité ${evs.size} ${evs.size === 1 ? 'título' : 'títulos'}. Cmd+Z lo deshace.`);
      } else {
        // cada grupo de palabras seguidas es un título; las sueltas (Cmd+clic) son uno cada una
        const runs = [];
        selN().filter((n) => !g.has(vivas[n])).forEach((n) => { const r = runs[runs.length - 1]; if (r && n === r[r.length - 1] + 1) r.push(n); else runs.push([n]); });
        if (runs.some((r) => r.length > 3)) return toast('Máximo 3 palabras seguidas por título. Selecciona menos.');
        const nuevos = [];
        runs.forEach((r) => { const ev = crearGrande(r.map((n) => pal[vivas[n]])); if (ev) { plan().events.push(ev); nuevos.push(ev); } });
        if (!nuevos.length) return toast('Esa selección no tiene palabras para poner en grande.');
        toast(nuevos.length === 1 ? `Puse «${nuevos[0].text.replace(/\*/g, '')}» en grande. Cmd+Z lo deshace.` : `Puse ${nuevos.length} títulos en grande. Cmd+Z lo deshace.`);
      }
      sel = new Set(); guardaScroll(); refrescar();
    }
    const aceptarSugeridas = () => {
      let n = 0;
      sugs.forEach((x) => { const ev = crearGrande([pal[x.i]]); if (ev) { plan().events.push(ev); n++; } });
      toast(`Puse ${n} ${n === 1 ? 'palabra' : 'palabras'} en grande. Cmd+Z lo deshace.`); sel = new Set(); guardaScroll(); refrescar();
    };
    cont.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); alternar(); }
      else if (e.key === 'Escape') { sel = new Set(); marcar(); e.stopPropagation(); }
    });
    function marcar() {
      spans.forEach((sp, n) => sp.classList.toggle('sel', sel.has(n)));
      const idx = selPal(), todas = idx.length && idx.every((i) => grandes.has(i));
      const txt = idx.length ? `${idx.length} ${idx.length === 1 ? 'palabra' : 'palabras'}: «${idx.slice(0, 4).map((i) => pal[i].w).join(' ')}${idx.length > 4 ? '…' : ''}»`
        : `${new Set(grandes.values()).size} en grande · ${sugs.length} ${sugs.length === 1 ? 'sugerida' : 'sugeridas'}. Arrastra sobre las palabras para elegir.`;
      const nb = h('div', {}, h('span', { class: 'kbar-t' }, txt),
        idx.length ? h('button', { type: 'button', class: 'btn gold sm', onclick: alternar }, todas ? 'Quitar de las grandes' : 'Poner en grande') : null,
        !idx.length && sugs.length ? h('button', { type: 'button', class: 'btn gold sm', onclick: aceptarSugeridas }, `Aceptar las ${sugs.length} sugeridas`) : null);
      barra.replaceChildren(...nb.childNodes);
    }
    cont.append(...spans.flatMap((x) => [x, document.createTextNode(' ')]));
    marcar();
    // la tarjeta puede repintarse más de una vez seguida: la posición guardada vale un segundo
    if (S.scrKar && Date.now() - S.scrKar.t < 1000) { const k = S.scrKar; requestAnimationFrame(() => { cont.scrollTop = k.i; if (k.op && k.op.isConnected) k.op.scrollTop = k.o; }); }
    caja.append(h('p', { class: 'sub' }, 'Selecciona palabras como cuando las quitas; con Cmd+clic eliges varias sueltas y cada una sale en grande por separado. Las subrayadas con puntos son sugerencias del editor, las pintadas ya van en grande. Doble clic pone una al instante.'),
      barra, cont,
      h('div', { class: 'tl-leyenda' }, h('span', {}, h('i', { class: 'lg big' }), 'Va en grande'), h('span', {}, h('i', { class: 'lg sug' }), 'Sugerida')));
    const vigila = setInterval(() => { if (!caja.isConnected) { clearInterval(vigila); document.removeEventListener('mouseup', fin); } }, 1500);
    return caja;
  }
  function panelTitulos() {
    const st = estilo(), evs = ordenar();
    const n = S.sel.size;
    return [
      cardElegirGrandes(), cardEstilosGrandes(),
      h('section', { class: 'card' }, h('h2', {}, 'Cómo se reparten las palabras grandes'),
        toggle('Mostrar palabras grandes', st.titulos, (v) => { st.titulos = v; refrescar(); }),
        h('small', { class: 'hint' }, 'Si cambias la letra, pulsa "Proponer títulos de nuevo" para recalcular qué palabras se leen bien detrás de ti. El desenfoque del fondo se ajusta en la tarjeta Fondo desenfocado.'),
        chips('Dónde pueden aparecer', POS, st.posiciones, (v) => { if (!v.length) return toast('Deja al menos una posición.'); st.posiciones = v; const n = ajustarAPermitidas(); refrescar(); if (n) toast(`Moví ${n} ${n === 1 ? 'título' : 'títulos'} a lo que elegiste.`); }, 'Detrás de ti solo se usa con una palabra corta que se lea completa. Si no se lee, el título se va a Arriba, Centro o Abajo.'),
        chips('Animaciones que se alternan', ANIM, st.animaciones, (v) => { if (!v.length) return toast('Deja al menos una animación.'); st.animaciones = v; const n = ajustarAPermitidas(); refrescar(); if (n) toast(`Cambié la animación de ${n} ${n === 1 ? 'título' : 'títulos'}.`); }),
        h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Sonido de las palabras grandes'), h('p', { class: 'hint' }, `Ahora: ${nombreSfx(st.sonidoTitulos)}. Se cambia en la tarjeta Efectos de sonido, junto con el de zooms y cierre.`), h('button', { type: 'button', class: 'btn ghost sm', onclick: () => abrirHoja('sonidos'), html: ic('sonidos', 16) + ' Cambiar sonidos' })),
        seg('Cantidad de títulos', [[1, 'Pocos'], [2, 'Normal'], [3, 'Muchos']], st.densidad, (v) => { st.densidad = v; S.pendDens = true; refrescar(); }),
        S.pendDens ? h('div', { class: 'aviso' }, h('span', {}, 'Los títulos que ya tienes no cambian solos. Para que haya más o menos, hay que volver a proponerlos. Se pierden los que editaste a mano.'),
          h('button', { type: 'button', class: 'btn gold sm', onclick: () => { if (confirm('Esto borra tus títulos actuales y vuelve a proponerlos con la cantidad elegida. ¿Seguro?')) { S.pendDens = false; lanzar('replanear', { solo: 'titulos' }); } } }, 'Proponer títulos de nuevo')) : null,
        h('div', { class: 'row-gap' },
          h('button', { class: 'btn gold sm', onclick: repartir }, 'Repartir posiciones y animaciones'),
          h('button', { class: 'btn ghost sm', onclick: () => { if (confirm('Esto borra tus títulos actuales y vuelve a proponerlos con la cantidad elegida. ¿Seguro?')) lanzar('replanear', { solo: 'titulos' }); } }, 'Proponer títulos de nuevo'))),
      h('section', { class: 'card' },
        h('div', { class: 'row-between' }, h('h2', {}, `Tus títulos (${evs.length})`),
          h('button', { class: 'btn ghost sm', onclick: () => { const t = tiempoActual(); const ev = { id: 'e' + Date.now().toString(36), start: +t.toFixed(2), end: +(t + 1.1).toFixed(2), text: 'NUEVO', pos: 'arriba', size: 'L', anim: 'pop', color: 'accent', sfx: 'click' }; plan().events.push(ev); S.abiertos.add(ev.id); refrescar(); }, html: icon('plus') + ' Agregar en este momento' })),
        h('div', { class: 'bulk' },
          h('label', { class: 'chk-l' }, h('input', { type: 'checkbox', class: 'chk', checked: n > 0 && n === evs.length, onchange: (e) => { S.sel = e.target.checked ? new Set(evs.map((x) => x.id)) : new Set(); pintarPanel(); } }), n ? `${n} seleccionados` : 'Seleccionar todos'),
          h('strong', {}, `Cambiar ${n ? n + ' seleccionados' : 'todos'} a:`),
          seg('Posición', POS, null, (v) => aplicarA('pos', v)), seg('Tamaño', TAM, null, (v) => aplicarA('size', v)),
          seg('Animación', ANIM, null, (v) => aplicarA('anim', v)), seg('Sonido', sfxOpts(), null, (v) => aplicarA('sfx', v)),
          n ? h('button', { class: 'btn danger sm', onclick: () => { if (confirm(`¿Quitar ${n} títulos?`)) { plan().events = plan().events.filter((e) => !S.sel.has(e.id)); S.sel = new Set(); refrescar(); } } }, `Quitar ${n}`) : null),
        h('ul', { class: 'evs' }, evs.map(filaTitulo))),
      seccionLetra('tit'), seccionColores(),
    ];
  }

  // ----- Frases animadas (voz en off): texto cinético con animaciones que se conectan solas -----
  let COMBOS = { combos: [], emojis: {}, mezcla: [] };
  const ANIM_NOM = { pop: 'Pop', deslizar: 'Desliza', caer: 'Cae', escribir: 'Escribe', desenfoque: 'Enfoca', zoom: 'Zoom', rebote: 'Rebota', resorte: 'Resorte' };
  const SALIDAS = [['auto', 'Según la animación'], ['fade', 'Se desvanece'], ['subir', 'Sube'], ['bajar', 'Baja'], ['encoger', 'Se encoge'], ['corte', 'Corte directo']];
  const frasesDe = () => plan().events.filter((e) => e.kind === 'frase').sort((a, b) => a.start - b.start);
  const comboDe = (id) => COMBOS.combos.find((c) => c.id === id) || COMBOS.combos[0];
  function aplicarCombo(ev, c, salida) {
    Object.assign(ev, { combo: c.id, anim: c.anim, layout: c.layout, size: c.size, marcador: c.marcador });
    const fr = frasesDe(), i = fr.indexOf(ev), sig = fr[i + 1];
    ev.salida = salida && salida !== 'auto' ? salida : (sig && sig.start - ev.end < 0.06 ? 'corte' : c.salida);
  }
  function repartirCombos() {
    const P = plan(), vz = P.voz || (P.voz = { secuencia: 'mezcla', combos: COMBOS.mezcla, emojis: true });
    const ids = (vz.combos || []).filter((id) => COMBOS.combos.some((c) => c.id === id)); if (!ids.length) ids.push(COMBOS.combos[0]?.id);
    frasesDe().forEach((ev, i) => aplicarCombo(ev, comboDe(vz.secuencia === 'unico' ? ids[0] : ids[i % ids.length]), vz.salida));
  }
  const quitarEmojis = (tx) => tx.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\uFE0F\u200D]/gu, '');
  function emojisAuto(on) {
    frasesDe().forEach((ev) => {
      if (!on) { ev.text = quitarEmojis(ev.text); return; }
      if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ev.text)) return;
      const toks = ev.text.split(/\s+/);
      for (let i = 0; i < toks.length; i++) {
        const k = toks[i].replace(/\*/g, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]/g, ''), e = COMBOS.emojis[k] || COMBOS.emojis[toks[i].replace(/[^\p{L}\d]/gu, '').toLowerCase()];
        if (e) { toks[i] = toks[i].replace(/[,.;:]+$/, '') + e; ev.text = toks.join(' '); break; }
      }
    });
  }
  function panelFrases() {
    const P = plan(), vz = P.voz || (P.voz = { secuencia: 'mezcla', combos: COMBOS.mezcla, emojis: true });
    const fr = frasesDe(), unico = vz.secuencia === 'unico';
    const elegir = (id) => {
      if (unico) vz.combos = [id];
      else vz.combos = vz.combos.includes(id) ? (vz.combos.length > 1 ? vz.combos.filter((x) => x !== id) : vz.combos) : [...vz.combos, id];
      repartirCombos(); refrescar();
    };
    const tarjeta = (c) => {
      const on = vz.combos.includes(c.id);
      return h('button', { type: 'button', class: 'combo' + (on ? ' on' : ''), 'aria-pressed': String(on), title: `${c.n}: ${ANIM_NOM[c.anim]} al entrar`, onclick: () => elegir(c.id) },
        h('span', { class: `combo-vista a-${c.anim}${c.marcador ? ' marca' : ''}` }, h('b', {}, 'Tu '), h('i', {}, 'idea')), h('strong', {}, c.n), h('small', {}, ANIM_NOM[c.anim]));
    };
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Animación de las frases'),
        h('p', { class: 'sub' }, 'Cada frase entra palabra por palabra al ritmo de tu voz. Elige varias y se alternan solas, enlazadas una con la siguiente.'),
        seg('Cómo se reparten', [['mezcla', 'Una distinta en cada frase'], ['unico', 'La misma en todas']], vz.secuencia || 'mezcla', (v) => { vz.secuencia = v; if (v === 'unico') vz.combos = [vz.combos[0] || COMBOS.combos[0]?.id]; repartirCombos(); refrescar(); }),
        h('div', { class: 'combos', role: 'group', 'aria-label': 'Animaciones disponibles' }, COMBOS.combos.map(tarjeta)),
        h('small', { class: 'hint' }, unico ? 'Toca una para aplicarla a todas las frases.' : 'Toca varias para mezclarlas. Se reparten en orden entre las frases.')),
      h('section', { class: 'card' }, h('h2', {}, 'Cómo se enlazan'),
        seg('Salida de cada frase', SALIDAS, vz.salida || 'auto', (v) => { vz.salida = v === 'auto' ? '' : v; repartirCombos(); refrescar(); }),
        seg('Tamaño del texto', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], vz.tam || '', (v) => { vz.tam = v; fr.forEach((e) => { e.size = v; }); refrescar(); }),
        toggle('Emojis automáticos junto a las palabras clave', vz.emojis !== false, (v) => { vz.emojis = v; emojisAuto(v); refrescar(); }, 'Uno por frase como máximo. También puedes escribir tus propios emojis en el texto de cada frase.')),
      h('section', { class: 'card' }, h('h2', {}, 'Guardar como plantilla'),
        h('p', { class: 'sub' }, 'Guarda este fondo, estas animaciones, el estilo del texto y la música. En tu próxima voz en off la eliges con un clic.'),
        (() => {
          const nom = h('input', { placeholder: 'Nombre, por ejemplo Cuadrícula tips', maxlength: 40, 'aria-label': 'Nombre de la plantilla' });
          return h('div', { class: 'row-gap' }, nom, h('button', { type: 'button', class: 'btn ghost', onclick: async () => {
            if (!nom.value.trim()) return toast('Ponle un nombre a la plantilla.');
            const pl = plan();
            await api(A + '/plantillas-voz', { method: 'POST', body: { nombre: nom.value.trim(), fondo: S.p.fondo, c1: S.p.c1, c2: S.p.c2, imagen: S.p.imagen, style: structuredClone(pl.style), voz: structuredClone(pl.voz || {}), audio: structuredClone(pl.audio || {}) } });
            nom.value = ''; toast('Plantilla guardada. La verás al crear tu próxima voz en off.');
          } }, 'Guardar plantilla'));
        })()),
      h('section', { class: 'card' }, h('h2', {}, `Tus frases (${fr.length})`),
        h('p', { class: 'sub' }, 'Toca Editar en una frase para cambiar su texto, emojis, animación, tamaño, salida y altura. Entre *asteriscos* va la palabra que se destaca.'),
        fr.length ? h('ul', { class: 'evs' }, fr.map(capa)) : h('p', { class: 'hint' }, 'Todavía no hay frases. Pulsa el botón de abajo para crearlas desde tu voz.'),
        h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => lanzar('replanear', { solo: 'titulos' }), html: ic('reset', 15) + ' Rehacer todas las frases desde cero' })))
    ];
  }

  // ----- Escenas de texto: fondo, emojis, imagen y una animación sencilla -----
  const ESC_DEF = { texto: 'Lo que nadie te cuenta', emoji: '🔥', fondo: 'degradado', c1: '#2b1b4d', c2: '#0b0b12', imagen: '', anim: 'pop', size: 'L', dur: 2.5 };
  const ESC_ANIMS = [['pop', 'Pop'], ['rebote', 'Rebote'], ['elastico', 'Elástico'], ['escribir', 'Escribir'], ['deslizar', 'Deslizar'], ['crecer', 'Crecer'], ['fade', 'Fade']];
  const ESC_FONDOS = [['degradado', 'Degradado'], ['color', 'Color'], ['imagen', 'Imagen'], ['ninguno', 'Sin fondo']];
  const EMOJIS_RAPIDOS = ['🔥', '✨', '💡', '🚀', '📸', '🎬', '💰', '❤️', '😱', '👀', '✅', '❌', '⚡', '🎯'];
  const PALETAS = ['#2b1b4d', '#0f2a43', '#123b2e', '#4a1a1a', '#1a1a1a', '#f5c518', '#ffffff'];
  let ESCIMG = [];
  const escenaUrl = (n) => `/api${A}/escenas/${encodeURIComponent(n)}`;
  const aEvento = (E, t) => {
    const items = E.texto.split('\n').map((x) => x.trim()).filter(Boolean);
    return { id: 'x' + Date.now().toString(36), kind: 'escena', items, text: items.join(' ') || 'Escena', emoji: E.emoji, fondo: E.fondo, c1: E.c1, c2: E.c2, imagen: E.fondo === 'imagen' ? E.imagen : '',
      start: t, end: +(t + E.dur).toFixed(2), pos: 'centro', size: E.size, anim: E.anim, trans: E.trans || 'fade', color: 'accent', sfx: sfxTipo('escena', 'whoosh') };
  };
  function promptClaude(E, deseo) {
    return `Estoy usando Estudio Marketographer (carpeta marketographer-studio, módulo talking-head). Necesito una animación de texto que las escenas del editor todavía no cubren.

Lo que quiero ver en el video:
${deseo.trim() || '(describe aquí la animación con tus palabras)'}

Lo que ya existe y debes reutilizar:
- Un elemento del plan es un objeto con kind "escena", campos items (líneas de texto), emoji, fondo (degradado, color, imagen, ninguno), c1, c2, imagen, anim, size, start, end, y.
- Se dibuja en dos lugares que deben verse igual: la vista en vivo (modules/talking-head/live.js, función dibujarEscena) y el render final (modules/talking-head/engine/graficos.py, función _dibujar_escena).
- El panel para crearlas está en modules/talking-head/ui.js (seccionEscena).
- Mi escena actual en el editor: texto "${E.texto.replace(/\n/g, ' / ')}", emojis "${E.emoji}", fondo ${E.fondo}, animación ${E.anim}, duración ${E.dur} s.

Lo que necesito de ti:
1. Añade la animación nueva (o las opciones que haga falta) en live.js y graficos.py con el mismo resultado visual en ambos.
2. Agrega la opción al panel de escenas de ui.js.
3. Prueba que el render final y la vista en vivo coinciden en un fotograma de ejemplo.
4. Dime en una frase qué opción nueva aparece en el panel.`;
  }
  function seccionEscena() {
    const E = S.esc || (S.esc = { ...ESC_DEF });
    const existentes = plan().events.filter((e) => e.kind === 'escena').sort((a, b) => a.start - b.start);
    const agregar = () => {
      if (!E.texto.trim() && !E.emoji.trim()) return toast('Escribe un texto o elige un emoji.');
      if (E.fondo === 'imagen' && !E.imagen) return toast('Sube o elige una imagen para el fondo.');
      const t = +tiempoActual().toFixed(2);
      plan().events.push(aEvento(E, t)); refrescar(); toast(`Agregué la escena en el segundo ${t}. La ves en el video.`);
    };
    const subirImg = (file) => {
      if (!/\.(png|jpe?g|webp)$/i.test(file.name)) return toast('Sirven imágenes png, jpg y webp.');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${A}/escenas/subir?nombre=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.onload = async () => {
        let r = {}; try { r = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 200 && r.nombre) { E.imagen = r.nombre; E.fondo = 'imagen'; ESCIMG = await api(A + '/escenas').catch(() => ESCIMG); pintarPanel(); } else toast(r.error || `No pude subir la imagen (error ${xhr.status}).`);
      };
      xhr.onerror = () => toast('No pude subir la imagen. Revisa que el Estudio siga abierto.');
      xhr.send(file);
    };
    const input = h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp,image/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) subirImg(f); } });
    const deseo = h('textarea', { rows: 3, placeholder: 'Ejemplo: las palabras caen una a una como fichas de dominó y la última rebota', 'aria-label': 'Qué animación quieres pedirle a Claude' });
    const emojiIn = h('input', { type: 'text', value: E.emoji, maxlength: 24, placeholder: 'Pega o elige emojis', 'aria-label': 'Emojis', oninput: (e) => { E.emoji = e.target.value; } });
    const fila = (ev) => capa(ev);
    return h('section', { class: 'card' }, h('h2', {}, 'Escena con texto y emojis'),
      h('p', { class: 'sub' }, 'Una mini animación a pantalla completa o sobre tu video: texto que entra con movimiento, emojis que rebotan y un fondo sencillo. Se agrega donde está el video ahora mismo.'),
      h('label', { class: 'mini-f' }, 'Texto (una línea por renglón, *asteriscos* para resaltar)', h('textarea', { rows: 2, 'aria-label': 'Texto de la escena', oninput: (e) => { E.texto = e.target.value; } }, E.texto)),
      h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Emojis'), emojiIn,
        h('div', { class: 'chips' }, EMOJIS_RAPIDOS.map((x) => h('button', { type: 'button', class: 'chip', 'aria-label': `Agregar ${x}`, onclick: () => { if ([...E.emoji].length < 6) { E.emoji += x; emojiIn.value = E.emoji; } } }, x)),
          h('button', { type: 'button', class: 'chip', onclick: () => { E.emoji = ''; emojiIn.value = ''; } }, 'Borrar'))),
      seg('Animación del texto', ESC_ANIMS, E.anim, (v) => { E.anim = v; pintarPanel(); }),
      seg('Fondo', ESC_FONDOS, E.fondo, (v) => { E.fondo = v; if (v === 'imagen' && !E.imagen) E.imagen = ESCIMG[0]?.nombre || ''; pintarPanel(); }),
      E.fondo === 'degradado' || E.fondo === 'color' ? colorRow(E.fondo === 'color' ? 'Color del fondo' : 'Color de arriba', E.c1, PALETAS, (c) => { E.c1 = c; }) : null,
      E.fondo === 'degradado' ? colorRow('Color de abajo', E.c2, ['#0b0b12', '#000000', '#1a1a1a', '#4a1a1a', '#0f2a43'], (c) => { E.c2 = c; }) : null,
      E.fondo === 'imagen' ? h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Imagen de fondo'),
        h('div', { class: 'chips' }, ESCIMG.map((f) => h('button', { type: 'button', class: 'chip' + (E.imagen === f.nombre ? ' on' : ''), 'aria-pressed': String(E.imagen === f.nombre), onclick: () => { E.imagen = f.nombre; pintarPanel(); } }, f.nombre)),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => input.click(), html: icon('plus') + ' Subir imagen' }), input)) : null,
      seg('Cómo entra y sale la escena', TRANS, E.trans || 'fade', (v) => { E.trans = v; pintarPanel(); }),
      seg('Tamaño del texto', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], E.size, (v) => { E.size = v; }),
      slider('Duración', 1, 8, 0.1, E.dur, (v) => `${v.toFixed(1)} s`, (v) => { E.dur = v; }, ESC_DEF.dur),
      h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn gold', onclick: agregar, html: icon('plus') + ' Agregar en este momento' })),
      existentes.length ? h('div', {}, h('h3', {}, `Escenas en tu video (${existentes.length})`), h('ul', { class: 'evs' }, existentes.map(fila))) : null,
      h('details', { class: 'pedir' }, h('summary', {}, 'Quiero una animación que no está en la lista'),
        h('p', { class: 'hint' }, 'Cuéntalo con tus palabras. Te preparo el mensaje completo para que Claude lo cree dentro del Estudio, con todo el contexto técnico ya incluido.'),
        deseo, h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => copiar(promptClaude(E, deseo.value), 'Mensaje copiado. Pégalo en Claude Code.'), html: icon('copy') + ' Copiar mensaje para Claude' }))));
  }

  // ----- Capas: todo lo que agregaste, en orden, y cada cosa se edita en vivo -----
  const TIPO_CAPA = (e) => (e.kind === 'escena' ? 'Escena' : e.kind === 'frase' ? 'Frase' : e.kind === 'sticker' ? (e.fija ? 'Marca' : 'Sticker') : e.kind ? 'Elemento' : 'Título');
  const NOM_KIND = { lista: 'Lista', conexion: 'Conexión', numero: 'Número', barras: 'Barras', punto: 'Cambio de escena' };
  const nombreCapa = (e) => (e.kind === 'sticker' ? e.archivo || 'Sin imagen' : e.kind === 'escena' ? `${e.emoji || ''} ${(e.items || []).join(' ')}`.trim() || 'Escena'
    : e.kind === 'punto' ? 'Punto que cambia de escena' : e.kind && NOM_KIND[e.kind] ? `${NOM_KIND[e.kind]}: ${(e.text || '').slice(0, 30)}` : String(e.text || '').replace(/\*/g, ''));
  const irA = (t) => { if (video) video.currentTime = tVideo(t); if (live) live.ir(tVideo(t)); };
  const duplicarCapa = (ev) => { const c = structuredClone(ev); c.id = 'd' + Date.now().toString(36); const dur = ev.end - ev.start; c.start = +(ev.end + 0.2).toFixed(2); c.end = +(c.start + dur).toFixed(2); plan().events.push(c); S.abiertos.add(c.id); refrescar(); irA(c.start); };
  function bloqueTiempos(ev) {
    return h('div', { class: 'ev-times' },
      h('label', { class: 'mini-f' }, 'Empieza (s)', h('input', { type: 'number', step: '0.1', min: 0, value: ev.start, onchange: (e) => { ev.start = Math.max(0, +e.target.value); if (ev.end <= ev.start) ev.end = +(ev.start + 0.5).toFixed(2); cambio(); } })),
      h('label', { class: 'mini-f' }, 'Termina (s)', h('input', { type: 'number', step: '0.1', value: ev.end, onchange: (e) => { ev.end = Math.max(+e.target.value, ev.start + 0.2); cambio(); } })),
      h('button', { type: 'button', class: 'btn ghost sm', title: 'Mueve este elemento al momento del video que estás viendo', onclick: () => { const dur = ev.end - ev.start, t = +tiempoActual().toFixed(2); ev.start = t; ev.end = +(t + dur).toFixed(2); refrescar(); } }, 'Moverlo aquí'));
  }
  function bloqueAltura(ev, def, mn = 0.08, mx = 0.85) {
    return [slider('Altura en pantalla', mn, mx, 0.01, ev.y ?? def, (v) => `${Math.round(v * 100)}% desde arriba${ev.y == null ? ' (automática)' : ''}`, (v) => { ev.y = v; cambio(); }),
      ev.y != null ? h('div', {}, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { delete ev.y; refrescar(); } }, 'Volver a la altura automática')) : null];
  }
  function cuerpoEscena(ev) {
    return [bloqueTiempos(ev),
      h('label', { class: 'mini-f' }, 'Texto (una línea por renglón, *asteriscos* para resaltar)', h('textarea', { rows: 2, onchange: (e) => { ev.items = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); ev.text = ev.items.join(' '); cambio(); } }, (ev.items || []).join('\n'))),
      h('label', { class: 'mini-f' }, 'Emojis', h('input', { type: 'text', value: ev.emoji || '', onchange: (e) => { ev.emoji = e.target.value; cambio(); } })),
      slider('Tamaño de los emojis', 0.5, 2, 0.05, ev.emojiTam ?? 1, (v) => `${Math.round(v * 100)}%`, (v) => { ev.emojiTam = v; cambio(); }, 1),
      seg('Animación del texto', ESC_ANIMS, ev.anim, (v) => { ev.anim = v; refrescar(); }),
      seg('Tamaño del texto', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], ev.size || 'L', (v) => { ev.size = v; refrescar(); }),
      seg('Cómo entra y sale la escena', TRANS, ev.trans || 'fade', (v) => { ev.trans = v; refrescar(); }),
      seg('Fondo', ESC_FONDOS, ev.fondo, (v) => { ev.fondo = v; if (v === 'imagen' && !ev.imagen) ev.imagen = ESCIMG[0]?.nombre || ''; refrescar(); }),
      ev.fondo === 'degradado' || ev.fondo === 'color' ? colorRow(ev.fondo === 'color' ? 'Color del fondo' : 'Color de arriba', ev.c1, PALETAS, (c) => { ev.c1 = c; cambio(); }) : null,
      ev.fondo === 'degradado' ? colorRow('Color de abajo', ev.c2, ['#0b0b12', '#000000', '#1a1a1a', '#4a1a1a', '#0f2a43'], (c) => { ev.c2 = c; cambio(); }) : null,
      ev.fondo === 'imagen' && ESCIMG.length ? h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Imagen'), h('div', { class: 'chips' }, ESCIMG.map((f) => h('button', { type: 'button', class: 'chip' + (ev.imagen === f.nombre ? ' on' : ''), 'aria-pressed': String(ev.imagen === f.nombre), onclick: () => { ev.imagen = f.nombre; refrescar(); } }, f.nombre)))) : null,
      ...bloqueAltura(ev, ev.fondo === 'ninguno' ? 0.3 : 0.5),
      seg('Sonido al entrar', sfxOpts(), ev.sfx || 'none', (v) => { ev.sfx = v; oirSfx(v); refrescar(); })];
  }
  function cuerpoEspecial(ev) {
    return [bloqueTiempos(ev),
      ev.kind !== 'punto' ? h('label', { class: 'mini-f' }, 'Contenido', h('textarea', { rows: 3, onchange: (e) => { ev.items = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); ev.text = ev.items.join(' / '); cambio(); } }, (ev.items || []).join('\n'))) : null,
      ev.kind !== 'punto' ? seg('Tamaño', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], ev.size || 'M', (v) => { ev.size = v; refrescar(); }) : null,
      ev.kind !== 'punto' ? seg('Color', [['accent', 'Acento'], ['text', 'Texto']], ev.color || 'accent', (v) => { ev.color = v; refrescar(); }) : null,
      ev.kind !== 'punto' ? bloqueAltura(ev, { lista: 0.4, conexion: 0.3, numero: 0.42, barras: 0.36 }[ev.kind] ?? 0.4) : null,
      seg('Sonido', sfxOpts(), ev.sfx || 'none', (v) => { ev.sfx = v; oirSfx(v); refrescar(); })];
  }
  function cuerpoFrase(ev) {
    const vz = plan().voz || {};
    return [bloqueTiempos(ev),
      h('label', { class: 'mini-f' }, 'Texto de la frase (*asteriscos* resaltan, puedes poner emojis)', h('input', { type: 'text', value: ev.text, onchange: (e) => { ev.text = e.target.value; cambio(); } })),
      h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Animación'), h('div', { class: 'chips' }, COMBOS.combos.map((c) => h('button', { type: 'button', class: 'chip' + (ev.combo === c.id ? ' on' : ''), 'aria-pressed': String(ev.combo === c.id), onclick: () => { aplicarCombo(ev, c, vz.salida); refrescar(); } }, c.n)))),
      seg('Tamaño', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], ev.size || 'L', (v) => { ev.size = v; refrescar(); }),
      seg('Salida', SALIDAS.filter((x) => x[0] !== 'auto'), ev.salida || 'fade', (v) => { ev.salida = v; refrescar(); }),
      ...bloqueAltura(ev, 0.5)];
  }
  function subirSticker(file, alTerminar) {
    if (!/\.(png|webp|jpe?g)$/i.test(file.name)) return toast('Sirven imágenes png (mejor con transparencia), webp y jpg.');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${A}/escenas/subir?nombre=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.onload = async () => {
      let r = {}; try { r = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 200 && r.nombre) { ESCIMG = await api(A + '/escenas').catch(() => ESCIMG); alTerminar(r.nombre); } else toast(r.error || `No pude subir la imagen (error ${xhr.status}).`);
    };
    xhr.onerror = () => toast('No pude subir la imagen. Revisa que el Estudio siga abierto.');
    xhr.send(file);
  }
  function cuerpoSticker(ev) {
    const dur = plan().duration || 0;
    return [
      ev.fija ? null : bloqueTiempos(ev),
      h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Imagen'), h('div', { class: 'chips stk' }, ESCIMG.map((f) => h('button', { type: 'button', class: 'chip stk-i' + (ev.archivo === f.nombre ? ' on' : ''), 'aria-pressed': String(ev.archivo === f.nombre), title: f.nombre, onclick: () => { ev.archivo = f.nombre; refrescar(); } }, h('img', { src: escenaUrl(f.nombre), alt: f.nombre, loading: 'lazy' }))))),
      slider('Tamaño', 0.05, 1, 0.01, ev.ancho ?? 0.3, (v) => `${Math.round(v * 100)}% del ancho`, (v) => { ev.ancho = v; cambio(); }, 0.3),
      slider('Posición a lo ancho', 0, 1, 0.01, ev.x ?? 0.5, (v) => `${Math.round(v * 100)}%`, (v) => { ev.x = v; cambio(); }, 0.5),
      slider('Posición a lo alto', 0, 1, 0.01, ev.y ?? 0.3, (v) => `${Math.round(v * 100)}%`, (v) => { ev.y = v; cambio(); }, 0.3),
      slider('Giro', -45, 45, 1, ev.rot ?? 0, (v) => `${Math.round(v)} grados`, (v) => { ev.rot = v; cambio(); }, 0),
      slider('Opacidad', 0.1, 1, 0.01, ev.op ?? 1, (v) => `${Math.round(v * 100)}%`, (v) => { ev.op = v; cambio(); }, 1),
      toggle('Marca de agua: se ve todo el video, sin animación', !!ev.fija, (v) => { ev.fija = v; if (v) { ev.start = 0; ev.end = +dur.toFixed(2); ev.op = Math.min(ev.op ?? 1, 0.85); } refrescar(); }),
      ev.fija ? null : seg('Animación de entrada', Object.entries(ANIM_NOM), ev.anim || 'pop', (v) => { ev.anim = v; refrescar(); }),
      ev.fija ? null : seg('Salida', SALIDAS.filter((x) => x[0] !== 'auto'), ev.salida || 'fade', (v) => { ev.salida = v; refrescar(); }),
      h('small', { class: 'hint' }, 'También puedes arrastrarlo directamente sobre el video.')];
  }
  const cuerpoDe = (ev) => (ev.kind === 'escena' ? cuerpoEscena(ev) : ev.kind === 'frase' ? cuerpoFrase(ev) : ev.kind === 'sticker' ? cuerpoSticker(ev) : cuerpoEspecial(ev));
  // Fila de una capa: se abre para editar y cada cambio se ve al instante en el video.
  function capa(ev) {
    if (!ev.kind) return filaTitulo(ev);
    const abierto = S.abiertos.has(ev.id);
    const alternar = () => { if (abierto) S.abiertos.delete(ev.id); else { S.abiertos.add(ev.id); irA(ev.start + 0.4); } pintarPanel(); };
    return h('li', { class: 'ev capa' + (abierto ? ' abierta' : '') },
      h('div', { class: 'ev-top' }, h('span', { class: 'tiempo' }, fmt(ev.start)), h('span', { class: 'tag t-' + ev.kind }, TIPO_CAPA(ev)), h('strong', { class: 'grow ev-nom' }, nombreCapa(ev)),
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-expanded': String(abierto), onclick: alternar }, abierto ? 'Cerrar' : 'Editar')),
      abierto ? h('div', { class: 'ev-det' }, ...cuerpoDe(ev).flat(),
        h('div', { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => irA(ev.start + 0.4) }, 'Verlo en el video'),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => duplicarCapa(ev) }, 'Duplicar'),
          h('button', { type: 'button', class: 'btn danger sm', onclick: () => { plan().events = plan().events.filter((e) => e.id !== ev.id); S.abiertos.delete(ev.id); refrescar(); } }, 'Quitar'))) : null);
  }
  function panelCapas() {
    const filtro = S.filtroCapas || 'todo';
    const todas = plan().events.slice().sort((a, b) => a.start - b.start);
    const cuenta = { todo: todas.length, titulo: todas.filter((e) => !e.kind).length, escena: todas.filter((e) => e.kind === 'escena').length, frase: todas.filter((e) => e.kind === 'frase').length, sticker: todas.filter((e) => e.kind === 'sticker').length, elemento: todas.filter((e) => e.kind && !['escena', 'frase', 'sticker'].includes(e.kind)).length };
    const pasa = (e) => filtro === 'todo' || (filtro === 'titulo' ? !e.kind : filtro === 'elemento' ? e.kind && !['escena', 'frase', 'sticker'].includes(e.kind) : e.kind === filtro);
    const op = [['todo', 'Todo'], ['titulo', 'Títulos'], ['escena', 'Escenas'], ['sticker', 'Stickers'], ['elemento', 'Elementos']];
    if (esVoz()) op.splice(1, 0, ['frase', 'Frases']);
    const lista = todas.filter(pasa);
    return [h('section', { class: 'card' }, h('h2', {}, `Todo lo que hay en tu video (${todas.length})`),
      h('p', { class: 'sub' }, 'Aquí están juntos los títulos, escenas, frases, stickers y elementos, en el orden en que aparecen. Toca Editar en cualquiera y cambia lo que quieras: lo ves al instante en el video.'),
      h('div', { class: 'chips' }, op.map(([id, n]) => h('button', { type: 'button', class: 'chip' + (filtro === id ? ' on' : ''), 'aria-pressed': String(filtro === id), onclick: () => { S.filtroCapas = id; pintarPanel(); } }, `${n} ${cuenta[id]}`))),
      lista.length ? h('ul', { class: 'evs' }, lista.map(capa)) : h('p', { class: 'hint' }, 'Todavía no hay nada de este tipo. Agrégalo desde Elementos.'))];
  }
  const TRANS = [['fade', 'Desvanecido'], ['cruce', 'Cruzado largo'], ['barrido', 'Barrido'], ['zoom', 'Corte con zoom']];
  function seccionSticker() {
    const input = h('input', { type: 'file', accept: '.png,.webp,.jpg,.jpeg,image/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) subirSticker(f, (n) => { agregarSticker(n, false); }); } });
    const agregarSticker = (archivo, fija) => {
      const t = +tiempoActual().toFixed(2), dur = plan().duration || 0;
      const ev = fija ? { id: 's' + Date.now().toString(36), kind: 'sticker', archivo, start: 0, end: +dur.toFixed(2), x: 0.86, y: 0.07, ancho: 0.18, op: 0.75, fija: true, text: archivo, sfx: sfxTipo('sticker', 'none') }
        : { id: 's' + Date.now().toString(36), kind: 'sticker', archivo, start: t, end: +(t + 2.5).toFixed(2), x: 0.5, y: 0.3, ancho: 0.3, anim: 'pop', salida: 'fade', text: archivo, sfx: sfxTipo('sticker', 'none') };
      plan().events.push(ev); S.abiertos.add(ev.id); refrescar(); toast(fija ? 'Marca de agua puesta. Ábrela en Todas mis capas para ajustarla.' : `Agregué el sticker en el segundo ${t}. Arrástralo sobre el video.`);
    };
    const nSt = plan().events.filter((e) => e.kind === 'sticker').length;
    return h('section', { class: 'card' }, h('h2', {}, 'Stickers y logo'),
      h('p', { class: 'sub' }, 'Sube un png con transparencia (tu logo, una flecha, un recorte) y colócalo donde quieras, con animación de entrada. Como marca de agua se queda todo el video.'),
      ESCIMG.length ? h('div', { class: 'chips stk' }, ESCIMG.map((f) => h('button', { type: 'button', class: 'chip stk-i', title: `Agregar ${f.nombre} en este momento`, onclick: () => agregarSticker(f.nombre, false) }, h('img', { src: escenaUrl(f.nombre), alt: f.nombre, loading: 'lazy' })))) : null,
      h('div', { class: 'row-gap' },
        h('button', { type: 'button', class: 'btn gold', onclick: () => input.click(), html: icon('plus') + ' Subir imagen y agregarla' }), input,
        ESCIMG.length ? h('button', { type: 'button', class: 'btn ghost', onclick: () => agregarSticker(ESCIMG[ESCIMG.length - 1].nombre, true) }, 'Última imagen como marca de agua') : null),
      nSt ? h('small', { class: 'hint' }, `Tienes ${nSt} en el video. Edítalos en Todas mis capas.`) : null);
  }

  // ----- Elementos especiales: listas, conexiones, números, barras, puntos y cámara lenta -----
  const KINDS = {
    lista: { n: 'Lista que enfoca cada punto', ayuda: 'Un punto por línea. El punto activo se ve nítido y los demás se desenfocan.', ej: 'Luz\nEncuadre\nHistoria', dur: (k) => 0.6 + 1.1 * k },
    conexion: { n: 'Conectar ideas', ayuda: 'De 2 a 4 ideas, una por línea. Una línea las une una tras otra.', ej: 'Foto\nHistoria\nVenta', dur: (k) => 0.8 + 0.7 * k },
    numero: { n: 'Número que sube', ayuda: 'Primera línea el número con su unidad (90 días, 3x, $1500). Segunda línea la etiqueta, opcional.', ej: '90 días\nde datos antes de rendirte', dur: () => 2.4 },
    barras: { n: 'Barras', ayuda: 'Una barra por línea con el formato nombre:valor, por ejemplo Antes:20 y Después:85.', ej: 'Antes:20\nDespués:85', dur: (k) => 1.4 + 0.4 * k },
    escena: { n: 'Escena de texto', ayuda: '', ej: '', dur: () => 2.5 },
    punto: { n: 'Punto que cambia de escena', ayuda: 'Un punto crece, cubre la pantalla y al irse la escena cambia de plano.', ej: '', dur: () => 0.8 },
  };
  const ESP_DEF = { tipo: 'lista', texto: KINDS.lista.ej, size: 'M', y: null };
  function panelElementos() {
    const E = S.esp || (S.esp = { ...ESP_DEF });
    const k = KINDS[E.tipo];
    const especiales = plan().events.filter((e) => e.kind && !['escena', 'frase', 'sticker'].includes(e.kind)).sort((a, b) => a.start - b.start);
    const agregar = () => {
      const items = E.texto.split('\n').map((x) => x.trim()).filter(Boolean);
      if (E.tipo !== 'punto' && !items.length) return toast('Escribe al menos una línea.');
      const t = +tiempoActual().toFixed(2);
      const ev = { id: 'x' + Date.now().toString(36), kind: E.tipo, items, text: items.join(' / ') || 'Punto', start: t, end: +(t + k.dur(items.length)).toFixed(2), pos: 'centro', size: E.size, anim: 'fade', color: 'accent', sfx: sfxTipo(E.tipo, E.tipo === 'punto' ? 'whoosh' : 'none') };
      if (E.y != null) ev.y = E.y;
      plan().events.push(ev); refrescar(); toast(`Agregué "${k.n}" en el segundo ${t}.`);
    };
    const filaEsp = (ev) => capa(ev);
    return [
      seccionEscena(),
      seccionSticker(),
      h('section', { class: 'card' }, h('h2', {}, 'Agregar un elemento'),
        h('p', { class: 'sub' }, 'Se agrega en el momento del video que estás viendo. Después ajustas tiempos y contenido en la lista de abajo.'),
        seg('Tipo', Object.entries(KINDS).filter(([id]) => id !== 'escena').map(([id, v]) => [id, v.n.split(' que ')[0]]), E.tipo, (v) => { E.tipo = v; E.texto = KINDS[v].ej; pintarPanel(); }),
        h('p', { class: 'hint' }, k.ayuda),
        E.tipo !== 'punto' ? h('textarea', { rows: 4, 'aria-label': 'Contenido', oninput: (e) => { E.texto = e.target.value; } }, E.texto) : null,
        E.tipo !== 'punto' ? seg('Tamaño', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], E.size, (v) => { E.size = v; pintarPanel(); }) : null,
        slider('Altura en pantalla (vacío = automática)', 0.1, 0.85, 0.01, E.y ?? 0.4, (v) => `${Math.round(v * 100)}%`, (v) => { E.y = v; }),
        h('div', {}, h('button', { type: 'button', class: 'btn gold', onclick: agregar, html: icon('plus') + ' Agregar en este momento' }))),
      h('section', { class: 'card' }, h('h2', {}, `Elementos en tu video (${especiales.length})`),
        especiales.length ? h('ul', { class: 'evs' }, especiales.map(filaEsp)) : h('p', { class: 'hint' }, 'Todavía no agregaste ninguno.'))
    ];
  }

  function seccionLenta() {
    const lentos = (plan().lentos = plan().lentos || []);
    const lentaAdd = () => {
      const t = +tiempoActual().toFixed(2);
      lentos.push({ start: t, end: +(t + 1.5).toFixed(2), factor: 2, grave: true });
      refrescar(); toast(`Cámara lenta desde el segundo ${t}.`);
    };
    return h('section', { class: 'card' }, h('h2', {}, 'Cámara lenta'),
        h('p', { class: 'sub' }, 'Ralentiza una frase. Con voz grave, la voz baja de tono y se oscurece, como en los videos que están de moda. Los títulos, zooms y subtítulos siguen el ritmo.'),
        h('div', {}, h('button', { type: 'button', class: 'btn ghost', onclick: lentaAdd, html: icon('plus') + ' Cámara lenta desde este momento' })),
        lentos.length ? h('ul', { class: 'evs' }, lentos.map((l) => h('li', { class: 'ev' },
          h('div', { class: 'ev-top' }, h('span', { class: 'tiempo' }, `${fmt(l.start)} a ${fmt(l.end)}`),
            h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { if (video) video.currentTime = tVideo(l.start); } }, 'Ir'),
            h('button', { type: 'button', class: 'btn danger sm', onclick: () => { plan().lentos = lentos.filter((x) => x !== l); refrescar(); } }, 'Quitar')),
          h('div', { class: 'ev-times' },
            h('label', { class: 'mini-f' }, 'Empieza (s)', h('input', { type: 'number', step: '0.1', value: l.start, onchange: (e) => { l.start = +e.target.value; cambio(); } })),
            h('label', { class: 'mini-f' }, 'Termina (s)', h('input', { type: 'number', step: '0.1', value: l.end, onchange: (e) => { l.end = +e.target.value; cambio(); } }))),
          seg('Velocidad', [[1.5, '1.5x más lento'], [2, '2x'], [3, '3x'], [4, '4x']], l.factor, (v) => { l.factor = v; refrescar(); }),
          toggle('Voz grave y oscura', l.grave, (v) => { l.grave = v; refrescar(); })))) : null);
  }
  async function panelFormato() {
    const P = plan(), f = P.formato || '9x16', e = (P.encuadre = P.encuadre || { x: 0.5, y: 0.4 }), d = S.dim;
    const [nw, nh] = FMT_NOM[f];
    let recorte = null;
    if (d) { const ra = d.w / d.h, fa = nw / nh; if (Math.abs(ra - fa) / fa > 0.02) recorte = ra > fa ? 'x' : 'y'; }
    return [h('section', { class: 'card' }, h('h2', {}, 'Formato del video'),
      h('p', { class: 'sub' }, 'Elige la proporción en la que editas. El video, los textos y la exportación salen en ese formato.'),
      seg('Proporción', FORMATOS_UI, f, (v) => { P.formato = v; cambio(); pintar(); }),
      h('p', { class: 'hint' }, `Sale en ${nw}x${nh}.` + (d ? ` Tu original es ${d.w}x${d.h}.` : '') + (recorte ? ' Tiene otra proporción: se recorta para llenar el cuadro, nunca se estira.' : '')),
      recorte === 'x' ? slider('Qué parte del ancho conservar', 0, 1, 0.01, e.x, (x) => (x < 0.35 ? 'Más de la izquierda' : x > 0.65 ? 'Más de la derecha' : 'Centrado'), (x) => { e.x = x; cambio(); }, 0.5) : null,
      recorte === 'y' ? slider('Qué parte del alto conservar', 0, 1, 0.01, e.y, (x) => (x < 0.3 ? 'Más de arriba' : x > 0.6 ? 'Más de abajo' : 'Centrado'), (x) => { e.y = x; cambio(); }, 0.4) : null,
      h('p', { class: 'hint' }, 'Si ya exportaste, vuelve a exportar después de cambiar el formato.'))];
  }
  async function panelCamara() { return [seccionZooms(), seccionLenta()]; }

  // ----- Subtítulos -----
  // Estilos listos para los subtítulos: un clic cambia varias cosas. Después se afina en Letra.
  const fnt = (k) => S.fuentes.find((f) => f.toLowerCase().includes(k)) || DEF.subs.font;
  const ESTILOS_SUBS = [
    ['clasico', 'Clásico', { font: 'poppins-extrabold', mayus: true, caso: 'mayus', caja: false, contorno: 0.8, glow: 0, tracking: 0, resalte: 'palabra', claves: true }],
    ['caja', 'Caja negra', { font: 'poppins-bold', mayus: false, caso: 'tal', caja: true, contorno: 0, glow: 0, tracking: 0, resalte: 'palabra', claves: true }],
    ['pop', 'Pop', { font: 'anton', mayus: true, caso: 'mayus', caja: false, contorno: 0.9, glow: 0.6, tracking: 0.02, resalte: 'palabra', claves: true }],
    ['neon', 'Neón', { font: 'bebas', mayus: true, caso: 'mayus', caja: false, contorno: 0.2, glow: 1, tracking: 0.06, resalte: 'palabra', claves: false }],
    ['limpio', 'Limpio', { font: 'poppins-bold', mayus: false, caso: 'tal', caja: false, contorno: 0.5, glow: 0, tracking: 0, resalte: 'ninguno', claves: false }],
    ['cine', 'Cine', { font: 'dmserif', mayus: false, caso: 'tal', caja: false, contorno: 0.6, glow: 0, tracking: 0.02, resalte: 'ninguno', claves: false }],
  ];
  const estiloActivo = (s) => ESTILOS_SUBS.find(([, , e]) => fnt(e.font) === s.font && !!s.caja === e.caja && Math.abs((s.contorno ?? 0) - e.contorno) < 0.06 && Math.abs((s.glow ?? 0) - e.glow) < 0.06 && !!s.claves === e.claves && (s.resalte || 'ninguno') === e.resalte)?.[0];
  function cardEstilosSubs() {
    const st = estilo(), s = st.subs, act = estiloActivo(s);
    const muestra = ([id, nombre, e]) => {
      const f = fnt(e.font), sombra = [e.contorno > 0.03 ? `0 0 ${1 + e.contorno * 2}px #000, 0 0 ${1 + e.contorno * 2}px #000, 0 1px ${e.contorno * 3}px #000` : '', e.glow > 0.03 ? `0 0 ${4 + e.glow * 14}px ${st.accent}` : ''].filter(Boolean).join(',');
      const txt = e.caso === 'mayus' ? 'ASÍ SE LEE' : 'Así se lee';
      return h('button', { type: 'button', class: 'est' + (act === id ? ' on' : ''), 'aria-pressed': String(act === id), 'aria-label': `Estilo ${nombre}`,
        onclick: () => { Object.assign(s, e, { font: f, emphFont: '' }); s.on = true; refrescar(); } },
        h('span', { class: 'est-m' }, h('span', { class: e.caja ? 'est-t caja' : 'est-t', style: `font-family:${fam(f)};letter-spacing:${e.tracking}em;text-shadow:${sombra || 'none'}` }, txt.split(' ').map((w, k, arr) => h('span', { style: k === arr.length - 1 && e.claves ? `color:${st.accent}` : '' }, w + (k < arr.length - 1 ? ' ' : ''))))),
        h('small', {}, nombre));
    };
    return h('section', { class: 'card' }, h('h2', {}, 'Estilos listos'),
      h('p', { class: 'sub' }, 'Un clic y los subtítulos cambian en el video. Después afinas abajo lo que quieras.'),
      h('div', { class: 'ests' }, ESTILOS_SUBS.map(muestra)));
  }
  // Estilos listos para las palabras grandes. Cambian letra, brillo, mayúsculas y animaciones; los subtítulos se quedan como están.
  const ESTILOS_GRANDES = [
    ['impacto', 'Impacto', { font: 'anton', emph: 'archivoblack', caso: 'mayus', glow: 0.7, contorno: 0, tracking: 0.02, anims: ['pop', 'rebote', 'crecer'] }],
    ['limpio', 'Limpio', { font: 'poppins-extrabold', emph: 'working', caso: 'mayus', glow: 0.2, contorno: 0, tracking: -0.02, anims: ['deslizar', 'fade', 'escribir'] }],
    ['editorial', 'Editorial', { font: 'dmserif', emph: 'poppins-extrabold', caso: 'tal', glow: 0.15, contorno: 0, tracking: 0, anims: ['fade', 'deslizar', 'bajar'] }],
    ['neon', 'Neón', { font: 'righteous', emph: 'bangers', caso: 'mayus', glow: 1, contorno: 0, tracking: 0.03, anims: ['pop', 'elastico', 'crecer'] }],
    ['comic', 'Cómic', { font: 'bangers', emph: 'bangers', caso: 'mayus', glow: 0.3, contorno: 0.6, tracking: 0.02, anims: ['rebote', 'tiembla', 'pop'] }],
  ];
  const fntG = (k) => S.fuentes.find((f) => f.toLowerCase().includes(k)) || DEF.font;
  const estiloGrandeActivo = (st) => ESTILOS_GRANDES.find(([, , e]) => fntG(e.font) === st.font && st.titulosCaso === e.caso && Math.abs((st.glow ?? 0) - e.glow) < 0.06 && Math.abs((st.contorno ?? 0) - e.contorno) < 0.06)?.[0];
  function cardEstilosGrandes() {
    const st = estilo(), act = estiloGrandeActivo(st);
    const muestra = ([id, nombre, e]) => {
      const f = fntG(e.font), sombra = [e.contorno > 0.03 ? `0 0 ${1 + e.contorno * 2}px #000, 0 0 ${1 + e.contorno * 2}px #000` : '', e.glow > 0.03 ? `0 0 ${4 + e.glow * 14}px ${st.accent}` : ''].filter(Boolean).join(',');
      const txt = e.caso === 'mayus' ? 'ASÍ SALTA' : 'Así salta';
      return h('button', { type: 'button', class: 'est' + (act === id ? ' on' : ''), 'aria-pressed': String(act === id), 'aria-label': `Estilo ${nombre}`,
        onclick: () => {
          st.mismoEstilo = false;
          Object.assign(st, { font: f, emphFont: fntG(e.emph), titulosCaso: e.caso, glow: e.glow, contorno: e.contorno, tracking: e.tracking, animaciones: e.anims.slice() });
          const n = ajustarAPermitidas(); refrescar(); toast(n ? `Estilo ${nombre} aplicado. Cambié la animación de ${n} ${n === 1 ? 'título' : 'títulos'}.` : `Estilo ${nombre} aplicado.`);
        } },
        h('span', { class: 'est-m' }, h('span', { class: 'est-t', style: `font-family:${fam(f)};letter-spacing:${e.tracking}em;text-shadow:${sombra || 'none'}` }, txt.split(' ').map((w, k, arr) => h('span', { style: k === arr.length - 1 ? `color:${st.accent}` : '' }, w + (k < arr.length - 1 ? ' ' : ''))))),
        h('small', {}, nombre));
    };
    return h('section', { class: 'card' }, h('h2', {}, 'Estilos listos'),
      h('p', { class: 'sub' }, 'Un clic cambia la letra, el brillo y las animaciones de las palabras grandes. Los subtítulos no se tocan.'),
      h('div', { class: 'ests' }, ESTILOS_GRANDES.map(muestra)));
  }
  function panelSubs() {
    const s = estilo().subs;
    return [
      cardEstilosSubs(),
      h('section', { class: 'card' }, h('h2', {}, 'Subtítulos'),
        toggle('Mostrar subtítulos', s.on, (v) => { s.on = v; refrescar(); }, 'Salen de lo que dices, palabra por palabra. Si algo se transcribió mal, corrígelo en el paso Texto.'),
        seg('Tamaño', [['S', 'Pequeño'], ['M', 'Medio'], ['L', 'Grande'], ['XL', 'Enorme']], s.size, (v) => { s.size = v; refrescar(); }),
        slider('Altura en pantalla', 0.5, 0.8, 0.01, s.y, (v) => `${Math.round(v * 100)}% desde arriba`, (v) => { s.y = v; cambio(); }, DEF.subs.y),
        slider('Máximo de palabras por bloque (siempre se corta en puntos, comas y pausas)', 1, 6, 1, s.maxPal, (v) => String(v), (v) => { s.maxPal = v; cambio(); }, DEF.subs.maxPal),
        seg('Cuando una palabra sale en grande', [['completo', 'Subtítulo completo'], ['atenuar', 'Apagar esa palabra'], ['quitar', 'Quitarla']], s.conGrande || 'completo', (v) => { s.conGrande = v; refrescar(); }),
        h('p', { class: 'hint' }, (s.conGrande || 'completo') === 'completo' ? 'La frase se lee entera abajo y la palabra importante salta en grande arriba. Es lo que recomiendo.' : s.conGrande === 'atenuar' ? 'La palabra sigue en su sitio dentro de la frase, con menos brillo mientras sale en grande.' : 'La palabra desaparece del subtítulo y el resto se reacomoda. La frase queda incompleta.'),
        toggle('Pulso al entrar la palabra grande', s.pulso !== false, (v) => { s.pulso = v; refrescar(); }, 'En el instante en que un título sube en grande, esa palabra del subtítulo late y toma el color de acento. Une los dos textos a la vista.'),
        toggle('Resaltar la palabra que estás diciendo', s.resalte === 'palabra', (v) => { s.resalte = v ? 'palabra' : 'ninguno'; refrescar(); }),
        toggle('Resaltar palabras clave', s.claves, (v) => { s.claves = v; refrescar(); }, 'Las palabras importantes de cada bloque salen distintas. Abajo, en Letra, eliges con qué tipografía.'),
        toggle('Caja oscura detrás del texto', s.caja, (v) => { s.caja = v; refrescar(); })),
      seccionLetra('sub'), seccionColores(),
    ];
  }

  // ----- Efectos -----

  // ----- Contraste automático y tomas de apoyo -----
  const lumRel = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contraste = (a, b) => { const x = lumRel(a), y = lumRel(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const BROLL = [
    [/c[aá]mara|obturador|lente/, 'Plano detalle de tu cámara con el dedo en el obturador'], [/luz|ventana|l[aá]mpara|flash/, 'Luz entrando por una ventana, plano corto y lento'],
    [/cliente|clientes|comprador/, 'Reacción de un cliente viendo sus fotos en pantalla'], [/sesi[oó]n|estudio|retrato/, 'Backstage de una sesión, grabado desde atrás de ti'],
    [/precio|cobrar|dinero|pagar|factura|ganar/, 'Calculadora o billetes en primer plano, a cámara lenta'], [/redes|instagram|reel|tiktok|algoritmo|viral/, 'Celular haciendo scroll, plano sobre el hombro'],
    [/edit|retoque|lightroom|photoshop/, 'Pantalla del editor mostrando el antes y el después'], [/foto|fotograf/, 'Fotos impresas sobre la mesa, plano cenital'],
    [/video|grab|c[aá]maras/, 'Monitor de la cámara con el cuadro encuadrado'], [/market|embudo|estrategia/, 'Libreta con un embudo dibujado a mano'],
    [/vend|venta|contrato|negocio/, 'Apretón de manos o contrato firmado, plano detalle'], [/tiempo|horas|d[ií]as|semanas/, 'Reloj o cronómetro, plano muy cerrado'],
  ];
  function tomasApoyo() {
    const pal = S.p.palabras || [];
    const frases = []; let cur = [];
    pal.forEach((w) => { cur.push(w); if (/[.?!]$/.test(w.w)) { frases.push(cur); cur = []; } });
    if (cur.length) frases.push(cur);
    const evs = plan().events;
    return frases.filter((f) => f[f.length - 1].end - f[0].start >= 2.2).map((f) => {
      const txt = f.map((w) => w.w).join(' '), n = nz(txt);
      const hit = BROLL.find(([re]) => re.test(txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) || re.test(txt.toLowerCase()));
      return { t: f[0].start, fin: f[f.length - 1].end, txt, idea: hit ? hit[1] : 'Plano detalle de lo que mencionas, 2 segundos, sin tapar tu cara', ocupada: evs.some((e) => e.start >= f[0].start && e.start < f[f.length - 1].end) };
    }).filter((x) => !x.ocupada).slice(0, 12);
  }
  async function cardsContraste() {
    const L = await api(`${A}/proyectos/${S.p.id}/luz`).catch(() => null);
    const st = estilo();
    const tomas = tomasApoyo();
    const cont = [];
    if (L) {
      const clara = L.luz.arriba > 0.5;
      const rec = [...ACENTOS, '#181818'].map((c) => [c, contraste(c, L.color)]).sort((a, b) => b[1] - a[1])[0];
      cont.push(h('section', { class: 'card' }, h('h2', {}, 'Contraste con tu fondo'),
        h('p', { class: 'sub' }, `Luz medida detrás de ti: arriba ${Math.round(L.luz.arriba * 100)}%, centro ${Math.round(L.luz.centro * 100)}%, abajo ${Math.round(L.luz.abajo * 100)}%. ${clara ? 'El fondo de arriba es claro y los textos claros se pierden.' : 'El fondo es oscuro, los textos claros se leen bien.'}`),
        h('div', { class: 'row-gap' },
          clara ? h('button', { type: 'button', class: 'btn gold', onclick: () => { estilo().imagen.degradado = Math.max(estilo().imagen.degradado, 0.6); refrescar(); toast('Activé un degradado a negro arriba y abajo.'); } }, 'Activar degradado a negro') : null,
          rec[0].toLowerCase() !== st.accent.toLowerCase() ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { st.accent = rec[0]; refrescar(); toast('Cambié el color de acento.'); } }, `Usar el acento ${rec[0]} (contraste ${rec[1].toFixed(1)}:1)`) : h('span', { class: 'hint' }, `Tu acento actual ya es el de mejor contraste (${rec[1].toFixed(1)}:1).`))));
    }
    cont.push(h('section', { class: 'card' }, h('h2', {}, `Tomas de apoyo sugeridas (${tomas.length})`),
      h('p', { class: 'sub' }, 'Momentos largos sin ningún título donde una toma de apoyo mantiene la atención. Son ideas para grabar o buscar, sin tocar tu video.'),
      tomas.length ? h('ul', { class: 'evs' }, tomas.map((x) => h('li', { class: 'ev' }, h('div', { class: 'ev-top' }, h('span', { class: 'tiempo' }, fmt(x.t)), h('strong', { class: 'grow' }, x.idea),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { if (video) video.currentTime = tVideo(x.t); } }, 'Ir')), h('small', { class: 'hint' }, `"${x.txt.slice(0, 110)}${x.txt.length > 110 ? '...' : ''}"`)))) : h('p', { class: 'hint' }, 'No hay tramos largos sin títulos.')));
    return cont;
  }
  function seccionZooms() {
    const st = estilo();
    return h('section', { class: 'card' }, h('h2', {}, 'Zooms'),
        toggle('Zooms automáticos', st.zooms, (v) => { st.zooms = v; refrescar(); }, 'Entran tras cada silencio o al empezar una frase.'),
        slider('Intensidad', 0.5, 2, 0.05, st.zoomIntensidad, (v) => `${v.toFixed(2)}x`, (v) => { st.zoomIntensidad = v; cambio(); }, DEF.zoomIntensidad),
        seg('Estilo del movimiento', [['suave', 'Suave'], ['normal', 'Normal'], ['punch', 'Con golpe']], st.zoomEstilo, (v) => { st.zoomEstilo = v; refrescar(); }),
        seg('Frecuencia', [['poco', 'Pocos'], ['normal', 'Normal'], ['mucho', 'Muchos']], st.zoomFrecuencia, (v) => { st.zoomFrecuencia = v; S.pendZ = true; refrescar(); }),
        S.pendZ ? h('div', { class: 'aviso' }, h('span', {}, 'Los zooms que ya tienes no cambian solos. Recalcúlalos para aplicar la frecuencia. Los que moviste a mano se reemplazan.'),
          h('button', { type: 'button', class: 'btn gold sm', onclick: () => { S.pendZ = false; lanzar('replanear', { solo: 'zooms' }); } }, 'Recalcular zooms'))
          : h('div', {}, h('button', { class: 'btn ghost sm', onclick: () => lanzar('replanear', { solo: 'zooms' }) }, 'Recalcular zooms con esta frecuencia')),
        toggle('Blanco y negro mientras dura cada zoom', st.zoomBN, (v) => { st.zoomBN = v; refrescar(); }, 'El color vuelve cuando el zoom termina.'),
        toggle('Zoom lento continuo después de cada zoom', st.zoomDeriva, (v) => { st.zoomDeriva = v; refrescar(); }),
        h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, 'Sonido al hacer zoom'), h('p', { class: 'hint' }, `Ahora: ${nombreSfx(st.sfxZoom)}.`), h('button', { type: 'button', class: 'btn ghost sm', onclick: () => abrirHoja('sonidos'), html: ic('sonidos', 16) + ' Cambiar sonidos' })));
  }
  async function panelLook() {
    const st = estilo(), im = st.imagen;
    return [
      ...(await seccionesLooks()),
      h('section', { class: 'card' }, h('h2', {}, 'Contraste y color'),
        slider('Contraste', 0.7, 1.5, 0.05, im.contraste, (v) => `${Math.round(v * 100)}%`, (v) => { im.contraste = v; cambio(); }, DEF.imagen.contraste),
        slider('Saturación', 0, 1.8, 0.05, im.saturacion, (v) => `${Math.round(v * 100)}%`, (v) => { im.saturacion = v; cambio(); }, DEF.imagen.saturacion),
        slider('Brillo', -40, 40, 1, im.brillo, (v) => String(v), (v) => { im.brillo = v; cambio(); }, DEF.imagen.brillo),
        slider('Degradado oscuro arriba y abajo', 0, 1, 0.05, im.degradado, (v) => (v < 0.03 ? 'Apagado' : `${Math.round(v * 100)}%`), (v) => { im.degradado = v; cambio(); }, DEF.imagen.degradado),
        slider('Viñeta (bordes oscuros)', 0, 1, 0.05, im.vineta, (v) => (v < 0.03 ? 'Apagada' : `${Math.round(v * 100)}%`), (v) => { im.vineta = v; cambio(); }, DEF.imagen.vineta)),
      ...(await cardsContraste()),
    ];
  }

  // ----- Guion: corregir mirando el video, palabra por palabra o todo el texto -----
  // Alinea el texto corregido solo con lo que sigue en el video; lo borrado se queda donde estaba.
  function alinearVivas(texto) {
    const br = plan().cortes.borradas || [], todas = S.p.palabras || [];
    const vivas = todas.filter((w) => !borradaPal(w, br)), muertas = todas.filter((w) => borradaPal(w, br));
    const r = alinear(vivas, texto);
    return { ...r, vivas: r.palabras, palabras: [...r.palabras, ...muertas].sort((a, b) => a.start - b.start) };
  }
  const guionTexto = () => vivasUI().map((w, i, a) => w.w + (/[.?!]$/.test(w.w) && i < a.length - 1 ? '\n\n' : ' ')).join('').trim();
  // Guarda un texto corregido: conserva los tiempos de lo que no cambió y arregla las palabras de los títulos.
  async function guardarTexto(texto) {
    const r = alinearVivas(texto);
    if (!r.vivas.length) return toast('El texto no puede quedar vacío.');
    let ev = 0;
    plan().events.forEach((e) => {
      if (e.kind) return;
      e.text = e.text.split(/\s+/).map((tk) => { const limpio = tk.replace(/\*/g, ''), nuevo = r.cambios.get(nz(limpio)); if (!nuevo) return tk; ev++; const up = nuevo.replace(/[^\p{L}\p{N}%$]/gu, '').toUpperCase(); return tk.startsWith('*') ? `*${up}*` : up; }).join(' ');
    });
    await guardarPalabras(r.palabras);
    S.p.palabras = r.palabras; S.p.tieneOriginal = true; S.guion = null;
    if (r.pares.length) S.aprender = r.pares;
    await recalcularCortes();
    cambio();
    toast(`Guardado. Palabras cambiadas: ${r.cambiadas}. Títulos corregidos: ${ev}.`);
    pintarPanel();
  }
  async function aplicarVocabulario() {
    try {
      const r = await api(`${A}/proyectos/${S.p.id}/vocabulario/aplicar`, { method: 'POST', body: {} });
      S.p.palabras = r.words; if (r.cambios.length) S.p.tieneOriginal = true;
      let ev = 0;
      r.cambios.forEach(([viejo, nuevo]) => {
        const kv = nz(viejo), nn = nuevo.replace(/^[¿¡(«"']+|[.,;:!?)»"'…]+$/g, '').toUpperCase();
        plan().events.forEach((e) => { if (e.kind) return; e.text = e.text.split(/\s+/).map((tk) => { if (nz(tk.replace(/\*/g, '')) !== kv) return tk; ev++; return tk.startsWith('*') && tk.endsWith('*') && tk.length > 2 ? `*${nn}*` : nn; }).join(' '); });
      });
      S.guion = null; cambio();
      toast(r.cambios.length ? `Corregí ${r.cambios.length} palabras${ev ? ` y ${ev} en títulos` : ''}.` : 'No encontré nada que corregir.');
      pintarPanel();
    } catch (e) { toast(e.message); }
  }
  // Transcripción que sigue al video: la palabra que suena se resalta y con doble clic se corrige.
  // ---------- recortar con la transcripción: borrar palabras y que desaparezcan del video ----------
  const enRecorte = () => ['cortes', 'recorte'].includes(S.panel || S.inline);
  const unirR = (rs) => { const o = []; for (const [a, b] of [...rs].sort((x, y) => x[0] - y[0])) { if (o.length && a <= o[o.length - 1][1] + 0.001) o[o.length - 1][1] = Math.max(o[o.length - 1][1], b); else o.push([a, b]); } return o; };
  const quitadosTodos = () => { const c = plan().cortes || {}; return unirR((c.on ? c.rangos || [] : []).concat(c.borradas || [])); };
  const borradaPal = (w, br) => { const m = (w.start + w.end) / 2; return br.some(([a, b]) => m >= a && m < b); };
  const MMSS = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
  // Dónde cortar para sacar las palabras i..j: a mitad del hueco con las vecinas, o con un respiro si hay una pausa larga.
  function limitesPal(pal, i, j) {
    const d = plan().duration || (pal.length ? pal[pal.length - 1].end + 0.5 : 0);
    const gA = i > 0 ? pal[i].start - pal[i - 1].end : 9, gB = j < pal.length - 1 ? pal[j + 1].start - pal[j].end : 9;
    const a = i === 0 ? Math.max(0, pal[i].start - 0.05) : gA <= 0.5 ? (pal[i - 1].end + pal[i].start) / 2 : pal[i].start - 0.12;
    let b = j === pal.length - 1 ? Math.min(d, pal[j].end + 0.1) : gB <= 0.5 ? (pal[j].end + pal[j + 1].start) / 2 : pal[j].end + 0.12;
    if (b - a < 0.05) b = a + 0.05;
    return [+Math.max(0, a).toFixed(3), +b.toFixed(3)];
  }
  const vivasUI = () => { const br = plan().cortes.borradas || []; return (S.p.palabras || []).filter((w) => !borradaPal(w, br)); };
  // Con el corte por palabras activo, las pausas se recalculan cada vez que cambia lo que se queda.
  async function recalcularCortes() {
    const c = plan().cortes;
    if (!c.on || c.modo !== 'palabras') return;
    try { if (!S.env) S.env = await api(`${A}/proyectos/${S.p.id}/envolvente`); } catch { return; }
    const d = plan().duration, mid = (x) => (x[0] + x[1]) / 2;
    const auto = porPalabras(vivasUI(), S.env.db, d, c, S.env.hop || 0.01).filter((x) => !(c.ignorar || []).some(([a, b]) => mid(x) >= a && mid(x) <= b));
    c.rangos = unirR([...auto, ...(c.manual || [])]); delete c.auto;
  }
  function quitarPal(i, j) {
    const c = plan().cortes;
    c.borradas = unirR([...(c.borradas || []), limitesPal(S.p.palabras, i, j)]);
    return recalcularCortes().then(() => { cambio(); S.pausasRepinta?.(); });
  }
  function dejarPal(i, j) {
    const c = plan().cortes, [a, b] = limitesPal(S.p.palabras, i, j), out = [];
    for (const [x, y] of c.borradas || []) {
      if (y <= a || x >= b) { out.push([x, y]); continue; }
      if (a - x > 0.04) out.push([x, a]);
      if (y - b > 0.04) out.push([b, y]);
    }
    c.borradas = out;
    return recalcularCortes().then(() => { cambio(); S.pausasRepinta?.(); });
  }
  // Busca lo que casi siempre sobra: palabras repetidas, frases dichas dos veces, muletillas y palabras sueltas entre pausas.
  const MULETILLAS = new Set(['eh', 'ehh', 'eeh', 'em', 'emm', 'mm', 'mmm', 'hmm', 'hmmm', 'uh', 'uhm', 'ah', 'aah']);
  const POCO_CONTENIDO = new Set('a al el la los las un una unos unas de del en con por para que y e o u pero como se su sus mi mis tu tus lo le les me te nos si no es son muy mas sin sobre entre hasta desde cuando donde ya yo tu'.split(' '));
  const SUELTAS_OK = new Set(['si', 'no', 'ya', 'ok', 'y', 'vale', 'eh', 'ah', 'oh', 'hey', 'uf']);
  function detectarLimpieza(pal, ignoradas) {
    const k = pal.map((w) => nz(w.w)), out = [], usado = new Set();
    const ign = new Set(ignoradas || []);
    const id = (tipo, i) => `${tipo}:${Math.round(pal[i].start * 100)}`;
    const meter = (tipo, i, j, extra) => {
      if (ign.has(id(tipo, i))) return;
      for (let x = i; x <= j; x++) usado.add(x);
      out.push({ id: id(tipo, i), tipo, i, j, t0: pal[i].start, t1: pal[j].end, texto: pal.slice(i, j + 1).map((w) => w.w).join(' '), despues: pal.slice(j + 1, j + 4).map((w) => w.w).join(' '), ...extra });
    };
    for (let i = 0; i < pal.length; i++) {
      if (usado.has(i) || !k[i]) continue;
      if (MULETILLAS.has(k[i])) { meter('muletilla', i, i); continue; }
      if (k[i] === 'o' && k[i + 1] === 'sea' && (/,$/.test(pal[i + 1].w) || (pal[i + 2] && pal[i + 2].start - pal[i + 1].end >= 0.25))) { meter('muletilla', i, i + 1); i++; continue; }
      if (k[i + 1] === k[i] && pal[i + 1].start - pal[i].end < 0.7 && !/[.?!]$/.test(pal[i].w)) { meter('palabra', i, i); continue; }
      let hecho = false;
      for (let d = 2; d <= 14 && i + d < pal.length && !hecho; d++) {
        let m = 0;
        while (m < d && i + d + m < pal.length && k[i + m] && k[i + m] === k[i + d + m]) m++;
        if (m < 2) continue;
        const contenido = k.slice(i, i + m).filter((x) => x.length >= 4 && !POCO_CONTENIDO.has(x)).length;
        if (!contenido || !(m >= 3 || d <= m + 2)) continue;
        let limpio = true;
        for (let x = i; x < i + d - 1; x++) if (/[.?!]$/.test(pal[x].w)) limpio = false;
        if (!limpio || pal.slice(i, i + d).some((_, x) => usado.has(i + x))) continue;
        meter('frase', i, i + d - 1, { retoma: pal.slice(i + d, i + d + Math.min(m + 2, 6)).map((w) => w.w).join(' ') });
        hecho = true;
      }
      if (hecho) { i = out[out.length - 1].j; continue; }
      const antes = i > 0 ? pal[i].start - pal[i - 1].end : 0, tras = i < pal.length - 1 ? pal[i + 1].start - pal[i].end : 0;
      if (i > 0 && i < pal.length - 1 && k[i].length <= 3 && !SUELTAS_OK.has(k[i]) && antes >= 0.45 && tras >= 0.45 && !/[.?!]$/.test(pal[i].w)) meter('suelta', i, i);
    }
    return out.sort((a, b) => a.i - b.i);
  }
  const TIPO_LIMPIEZA = {
    frase: ['Frase repetida', 'Dijiste esto dos veces. Se quita la primera toma y se queda la última.'],
    palabra: ['Palabra repetida', 'La misma palabra dos veces seguidas.'],
    muletilla: ['Muletilla', 'Un sonido o una coletilla que no aporta nada.'],
    suelta: ['Palabra suelta', 'Quedó aislada entre dos pausas, como un arranque que no siguió.'],
  };
  function cardLimpieza() {
    const caja = h('section', { class: 'card' });
    const pintar = () => {
      const pal = S.p.palabras || [], c = plan().cortes, br = c.borradas || [];
      const sug = detectarLimpieza(pal, c.sugIgnoradas).filter((s) => !pal.slice(s.i, s.j + 1).every((w) => borradaPal(w, br)));
      const quitar = (lista) => { lista.forEach((s) => quitarPal(s.i, s.j)); S.karRepinta?.(); pintar(); };
      const ignorar = (s) => { c.sugIgnoradas = [...(c.sugIgnoradas || []), s.id]; cambio(); pintar(); };
      const escuchar = (s) => { if (!video) return; video.currentTime = tVideo(Math.max(0, s.t0 - 0.8)); video.play?.(); };
      const grupos = Object.keys(TIPO_LIMPIEZA).map((t) => [t, sug.filter((s) => s.tipo === t)]).filter(([, l]) => l.length);
      const mostrar = S.verTodasSug ? sug : sug.slice(0, 6);
      const nuevo = h('div', {}, h('h2', {}, 'Limpieza sugerida'),
        sug.length ? [
          h('p', { class: 'sub' }, `Encontré ${sug.length} ${sug.length === 1 ? 'cosa' : 'cosas'} que probablemente quieras quitar. Escucha cada una y decide. Lo que quites se corta del video y se puede devolver.`),
          h('div', { class: 'row-gap' }, grupos.map(([t, l]) => h('button', { type: 'button', class: 'btn ghost sm', onclick: () => quitar(l) }, `Quitar ${l.length > 1 ? 'todas' : 'la'} ${TIPO_LIMPIEZA[t][0].toLowerCase()}${l.length > 1 ? 's' : ''} (${l.length})`))),
          h('ul', { class: 'evs lim' }, mostrar.map((s) => h('li', { class: 'ev lim-i' },
            h('div', { class: 'lim-t' }, h('span', { class: 'lim-tag t-' + s.tipo }, TIPO_LIMPIEZA[s.tipo][0]), h('span', { class: 'lim-s' }, MMSS(s.t0))),
            h('p', { class: 'lim-txt', title: TIPO_LIMPIEZA[s.tipo][1] }, h('s', {}, s.texto), s.tipo === 'frase' ? ` ${s.retoma}…` : s.despues ? ` ${s.despues}…` : ''),
            h('div', { class: 'row-gap' },
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => escuchar(s), html: ic('play', 14) + ' Escuchar' }),
              h('button', { type: 'button', class: 'btn gold sm', onclick: () => quitar([s]) }, 'Quitar'),
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => ignorar(s) }, 'Dejarla'))))),
          sug.length > 6 ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { S.verTodasSug = !S.verTodasSug; pintar(); } }, S.verTodasSug ? 'Ver menos' : `Ver las ${sug.length - 6} restantes`) : null,
        ] : h('p', { class: 'sub' }, (c.sugIgnoradas || []).length ? 'Ya revisaste todo lo que encontré.' : 'No encontré repeticiones ni muletillas. Si algo se te escapó, selecciona esas palabras en la transcripción y pulsa Supr.'),
        (c.sugIgnoradas || []).length ? h('div', {}, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { c.sugIgnoradas = []; cambio(); pintar(); } }, 'Volver a mostrar las que dejé')) : null);
      caja.replaceChildren(...nuevo.childNodes);
      decorar(caja);
    };
    S.limpiezaRepinta = pintar;
    pintar();
    return caja;
  }
  function karaoke() {
    const pal = S.p.palabras || [];
    const cont = h('div', { class: 'kar', tabindex: '0', 'aria-label': 'Transcripción. Selecciona palabras y pulsa Supr para quitarlas del video.' });
    const barra = h('div', { class: 'kbar', 'aria-live': 'polite' });
    let sel = null, ancla = -1, arrastra = false, movido = false;
    const spans = pal.map((w, i) => {
      const sp = h('span', { class: 'kw', 'data-i': i, title: 'Clic para ir aquí. Arrastra o usa Mayús para seleccionar.' }, w.w);
      sp.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); cont.focus({ preventScroll: true });
        if (e.shiftKey && ancla >= 0) { sel = [Math.min(ancla, i), Math.max(ancla, i)]; movido = true; }
        else { ancla = i; sel = [i, i]; arrastra = true; movido = false; }
        marcar();
      });
      sp.addEventListener('mouseenter', () => { if (arrastra && ancla >= 0) { sel = [Math.min(ancla, i), Math.max(ancla, i)]; if (i !== ancla) movido = true; marcar(); } });
      sp.addEventListener('click', () => { if (!movido && video) video.currentTime = tVideo(w.start); });
      return sp;
    });
    const alFinal = () => { arrastra = false; };
    document.addEventListener('mouseup', alFinal);
    const alternar = () => {
      if (!sel) return;
      const br = plan().cortes.borradas || [], todas = pal.slice(sel[0], sel[1] + 1).every((w) => borradaPal(w, br));
      if (todas) dejarPal(sel[0], sel[1]); else quitarPal(sel[0], sel[1]);
      const n = sel[1] - sel[0] + 1; sel = null; marcar(); S.limpiezaRepinta?.();
      toast(todas ? `Devolví ${n} ${n === 1 ? 'palabra' : 'palabras'} al video.` : `Quité ${n} ${n === 1 ? 'palabra' : 'palabras'} del video. Cmd+Z lo deshace.`);
    };
    cont.addEventListener('keydown', (e) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); alternar(); }
      else if (e.key === 'Escape') { sel = null; marcar(); e.stopPropagation(); }
      else if (cmd && e.key.toLowerCase() === 'a') { e.preventDefault(); sel = [0, pal.length - 1]; marcar(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && sel) {
        e.preventDefault(); e.stopPropagation();
        const d = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey) { if (ancla < 0) ancla = sel[0]; const foco = (sel[0] === ancla ? sel[1] : sel[0]) + d, f = Math.max(0, Math.min(pal.length - 1, foco)); sel = [Math.min(ancla, f), Math.max(ancla, f)]; }
        else { const f = Math.max(0, Math.min(pal.length - 1, (d < 0 ? sel[0] : sel[1]) + d)); ancla = f; sel = [f, f]; }
        marcar(); spans[sel[0]].scrollIntoView({ block: 'nearest' });
      }
    });
    function marcar() {
      const br = plan().cortes.borradas || [];
      spans.forEach((sp, i) => { sp.classList.toggle('del', borradaPal(pal[i], br)); sp.classList.toggle('sel', !!sel && i >= sel[0] && i <= sel[1]); });
      const d = plan().duration || 0, quitado = quitadosTodos().reduce((a, [x, y]) => a + Math.max(0, Math.min(y, d) - Math.max(x, 0)), 0);
      const n = sel ? sel[1] - sel[0] + 1 : 0, todas = sel && pal.slice(sel[0], sel[1] + 1).every((w) => borradaPal(w, br));
      const resumen = sel ? `${n} ${n === 1 ? 'palabra' : 'palabras'}: «${pal.slice(sel[0], Math.min(sel[1], sel[0] + 7) + 1).map((w) => w.w).join(' ')}${n > 8 ? '…' : ''}»`
        : br.length ? `Quitaste ${br.length} ${br.length === 1 ? 'tramo' : 'tramos'} con el texto. El video pasa de ${MMSS(d)} a ${MMSS(Math.max(d - quitado, 0))}.`
        : 'Arrastra sobre las palabras para seleccionarlas y pulsa Supr. Desaparecen del video.';
      const nb = h('div', {}, h('span', { class: 'kbar-t' }, resumen),
        sel ? h('button', { type: 'button', class: 'btn gold sm', onclick: alternar }, todas ? 'Devolver al video' : 'Quitar del video') : null,
        !sel && br.length ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => viajar(-1), html: ic('deshacer', 14) + ' Deshacer' }) : null,
        !sel && br.length ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { if (!confirm('Esto devuelve al video todas las palabras que quitaste con el texto. ¿Seguir?')) return; plan().cortes.borradas = []; cambio(); marcar(); S.limpiezaRepinta?.(); } }, 'Devolver todo') : null);
      barra.replaceChildren(...nb.childNodes);
    }
    cont.append(...spans.flatMap((x) => [x, document.createTextNode(' ')]));
    S.karRepinta = marcar;
    marcar();
    let actual = -1;
    const tick = setInterval(() => {
      if (!cont.isConnected) { clearInterval(tick); document.removeEventListener('mouseup', alFinal); return; }
      if (!video || !(S.tab === 'live' || S.tab === 'source')) return;
      const t = video.currentTime; let k = -1;
      for (let a = 0, b = pal.length - 1; a <= b;) { const m = (a + b) >> 1; if (pal[m].start <= t) { k = m; a = m + 1; } else b = m - 1; }
      if (k === actual) return;
      spans[actual]?.classList.remove('on'); actual = k; if (k >= 0) { spans[k].classList.add('on'); if (!video.paused && !sel) { const top = spans[k].offsetTop - cont.clientHeight / 2; if (Math.abs(top - cont.scrollTop) > 40) cont.scrollTo({ top, behavior: 'smooth' }); } }
    }, 90);
    return h('div', { class: 'kwrap' }, cont, barra);
  }
  function cardTexto() {
    return h('section', { class: 'card' }, h('h2', {}, 'Lo que dijiste'),
      h('p', { class: 'sub' }, 'Dale reproducir y mira cómo se ilumina cada palabra. Clic en una palabra para ir a ese momento. Arrastra para seleccionar varias y pulsa Supr: desaparecen del video, con su audio y sus subtítulos. Aquí no se corrige nada, eso se hace en el paso siguiente.'),
      karaoke(),
      h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => live?.alternar(), html: ic('play', 14) + ' Reproducir o pausar' })));
  }
  // Para corregir palabras: solo aparece lo que quedó en el video.
  function karaokeCorregir() {
    const pal = vivasUI();
    const cont = h('div', { class: 'kar', tabindex: '0', 'aria-label': 'Texto que quedó en el video. Doble clic en una palabra para corregirla.' });
    const spans = pal.map((w, i) => {
      const sp = h('span', { class: 'kw', 'data-i': i, title: 'Clic para ir aquí. Doble clic para corregir.' }, w.w);
      sp.addEventListener('click', () => { if (video) video.currentTime = tVideo(w.start); });
      sp.addEventListener('dblclick', () => {
        const inp = h('input', { class: 'kw-in', value: w.w, size: Math.max(w.w.length, 3), 'aria-label': 'Corregir palabra' });
        const fin = async (ok) => { inp.onblur = null; if (ok && inp.value.trim() && inp.value.trim() !== w.w) { const t = pal.map((x, k) => (k === i ? inp.value.trim() : x.w)).join(' '); await guardarTexto(t); } else inp.replaceWith(sp); };
        inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); };
        inp.onblur = () => fin(true);
        sp.replaceWith(inp); inp.focus(); inp.select();
      });
      return sp;
    });
    cont.append(...spans.flatMap((x) => [x, document.createTextNode(' ')]));
    let actual = -1;
    const tick = setInterval(() => {
      if (!cont.isConnected) return clearInterval(tick);
      if (!video || !(S.tab === 'live' || S.tab === 'source')) return;
      const t = video.currentTime; let k = -1;
      for (let a = 0, b = pal.length - 1; a <= b;) { const m = (a + b) >> 1; if (pal[m].start <= t) { k = m; a = m + 1; } else b = m - 1; }
      if (k === actual) return;
      spans[actual]?.classList.remove('on'); actual = k; if (k >= 0) { spans[k].classList.add('on'); if (!video.paused) { const top = spans[k].offsetTop - cont.clientHeight / 2; if (Math.abs(top - cont.scrollTop) > 40) cont.scrollTo({ top, behavior: 'smooth' }); } }
    }, 90);
    return cont;
  }
  async function panelGuion() {
    const todos = await api('/guiones/guiones').catch(() => []);
    const temas = await api('/guiones/temas').catch(() => []);
    const lista = todos.filter((g) => g.formato === 'talking-head');
    const titulo = (g) => temas.find((t) => t.id === g.temaId)?.titulo || 'Guion sin tema';
    let elegido = lista[0]?.id || '';
    const sel = h('select', { 'aria-label': 'Guion de Guiones' }, lista.map((g) => h('option', { value: g.id }, titulo(g))));
    sel.onchange = () => { elegido = sel.value; };
    const usar = async () => {
      const g = lista.find((x) => x.id === elegido);
      if (!g) return toast('No hay guiones de Talking Head en Guiones.');
      if (esVoz()) {
        if (!confirm('Las frases animadas van a usar las palabras exactas de este guion. Los tiempos siguen saliendo de tu voz y cada frase conserva su animación. ¿Seguir?')) return;
        const Lv = leerGuion(g.texto);
        if (!Lv.palabras.length) return toast('El guion está vacío.');
        const rv = alinearVivas(Lv.palabras.join(' '));
        await guardarPalabras(rv.palabras);
        S.p.palabras = rv.palabras; S.p.tieneOriginal = true; S.guion = null;
        cambio(); refrescar();
        toast(`Listo. Tus frases ahora dicen exactamente lo que escribiste (${rv.cambiadas} palabras cambiadas).`);
        return pintarPanel();
      }
      if (!confirm('El guion de Guiones pasa a ser la verdad del video: reemplaza las palabras de los subtítulos (los tiempos se conservan), los títulos y los zooms. ¿Seguir?')) return;
      const L = leerGuion(g.texto);
      if (!L.palabras.length) return toast('El guion está vacío.');
      const r = alinearVivas(L.palabras.join(' '));
      await guardarPalabras(r.palabras);
      S.p.palabras = r.palabras; S.p.tieneOriginal = true; S.guion = null;
      const P = r.palabras, t0 = (i) => P[Math.min(i, P.length - 1)].start, t1 = (i) => P[Math.min(i, P.length - 1)].end;
      const pl = plan();
      if (L.enfasis.length) {
        pl.events = L.enfasis.map((e, k) => {
          const ws = e.texto.toUpperCase().split(' ');
          const texto = ws.length === 1 ? ws[0] : ws.slice(0, -1).join(' ') + ' *' + ws[ws.length - 1] + '*';
          const ini = t0(e.i), fin = Math.min(t1(e.i + e.n - 1) + 0.35, ini + 2.4);
          return { id: 'g' + Date.now().toString(36) + k, start: +ini.toFixed(2), end: +Math.max(fin, ini + 0.9).toFixed(2), text: texto, pos: 'arriba', size: ws.length > 2 ? 'M' : 'L', anim: 'pop', color: 'accent', sfx: 'none' };
        });
      }
      if (L.zooms.length || L.cortes.length) {
        const niveles = [1.08, 1.12];
        pl.zooms = [...L.zooms, ...L.cortes].sort((a, b) => a - b).map((i, k) => ({ t: +t1(i).toFixed(2), level: niveles[k % 2] }));
      }
      L.sfx.forEach((s2) => {
        const t = t1(s2.i), cerca = [...pl.events].sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0];
        if (cerca && Math.abs(cerca.start - t) < 2.5 && ['click', 'pop', 'whoosh', 'tick', 'ding'].includes(s2.nombre)) cerca.sfx = s2.nombre;
      });
      if (L.enfasis.length) repartir(); else refrescar();
      toast(`Guion aplicado: ${L.enfasis.length} títulos, ${L.zooms.length + L.cortes.length} zooms, ${L.sfx.length} sonidos.`);
      pintarPanel();
    };
    const area = h('textarea', { class: 'guion', rows: 12, spellcheck: 'true', lang: 'es', 'aria-label': 'Guion completo' });
    area.value = S.guion ?? guionTexto();
    area.addEventListener('input', () => { S.guion = area.value; });
    const modo = S.modoGuion || 'seguir'; S.verTodasSug = false;
    const nVoc = (S.aj.vocab?.terminos || []).filter((t) => t.trim()).length + (S.aj.vocab?.reemplazos || []).filter((r) => r.de).length;
    const marcadas = new Set();
    const aprender = S.aprender && S.aprender.length ? h('section', { class: 'card reveal' }, h('h2', {}, 'Recordar estas correcciones'),
      h('p', { class: 'sub' }, 'Corregiste estas palabras. Si Whisper se equivoca siempre igual, guárdalas en tu vocabulario y se arreglan solas en los videos nuevos.'),
      h('ul', { class: 'evs' }, S.aprender.map(([viejo, nuevo], k) => { marcadas.add(k); return h('li', { class: 'ev' }, h('label', { class: 'chk-l' }, h('input', { type: 'checkbox', class: 'chk', checked: true, onchange: (e) => (e.target.checked ? marcadas.add(k) : marcadas.delete(k)) }), h('span', {}, `${viejo}  →  ${nuevo}`))); })),
      h('div', { class: 'row-gap' },
        h('button', { type: 'button', class: 'btn gold', onclick: async () => {
          const v = S.aj.vocab || { terminos: [], reemplazos: [] };
          S.aprender.forEach(([viejo, nuevo], k) => { if (!marcadas.has(k)) return; if (!v.reemplazos.some((r) => nz(r.de) === nz(viejo))) v.reemplazos.push({ de: viejo.toLowerCase(), a: nuevo }); if (!v.terminos.some((t) => nz(t) === nz(nuevo))) v.terminos.push(nuevo); });
          await guardarVocab(v); S.aprender = null; toast('Guardé tus correcciones en el vocabulario.'); pintarPanel();
        } }, 'Guardar en mi vocabulario'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { S.aprender = null; pintarPanel(); } }, 'No guardar'))) : null;
    return [
      h('section', { class: 'card' }, h('h2', {}, 'Lo que queda en el video'),
        h('div', { class: 'seg', role: 'tablist' },
          h('button', { type: 'button', class: 'seg-b' + (modo === 'seguir' ? ' on' : ''), onclick: () => { S.modoGuion = 'seguir'; pintarPanel(); }, html: ic('ojo', 14) + ' Seguir el video' }),
          h('button', { type: 'button', class: 'seg-b' + (modo === 'editar' ? ' on' : ''), onclick: () => { S.modoGuion = 'editar'; pintarPanel(); }, html: ic('doc', 14) + ' Editar todo el texto' })),
        modo === 'seguir' ? [
          h('p', { class: 'sub' }, 'Dale reproducir y mira cómo se ilumina cada palabra. Clic en una palabra para ir a ese momento. Doble clic para corregirla y pulsa Enter. Solo aparece lo que se queda en el video.'),
          karaokeCorregir(),
          h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => live?.alternar(), html: ic('play', 14) + ' Reproducir o pausar' }))
        ] : [
          h('p', { class: 'sub' }, 'Aquí está todo lo que dijiste, como lo entendió el reconocimiento de voz. Corrige lo que salió mal, por ejemplo nombres propios. Los subtítulos y los títulos se actualizan y los tiempos se acomodan solos.'),
          area,
          h('div', { class: 'row-gap' }, h('button', { class: 'btn gold', onclick: () => guardarTexto(area.value) }, 'Guardar correcciones'))],
        S.p.tieneOriginal ? h('div', {}, h('button', { class: 'btn ghost sm', onclick: async () => {
          if (!confirm('Esto vuelve a la transcripción original y descarta tus correcciones. ¿Seguro?')) return;
          const o = await api(`${A}/proyectos/${S.p.id}/palabras-originales`);
          await guardarPalabras(o.words);
          S.p.palabras = o.words; S.guion = null; cambio(); toast('Volví a la transcripción original.'); pintarPanel();
        }, html: ic('deshacer', 14) + ' Volver a la transcripción original' })) : null),
      aprender,
      h('section', { class: 'card' }, h('h2', {}, 'Mi vocabulario'),
        h('p', { class: 'sub' }, nVoc ? `Tienes ${nVoc} reglas guardadas en tus ajustes. Corrige este video con ellas o edítalas.` : 'Aún no tienes reglas. Agrega en Ajustes las palabras que Whisper escribe mal, por ejemplo marketógrafos o membresías.'),
        h('div', { class: 'row-gap' },
          nVoc ? h('button', { type: 'button', class: 'btn gold', onclick: aplicarVocabulario }, 'Corregir este video con mi vocabulario') : null,
          h('button', { type: 'button', class: 'btn ghost', onclick: () => abrirHoja('ajustes') }, 'Editar mi vocabulario'))),
      h('details', { class: 'card' }, h('summary', {}, 'Usar un guion de Guiones'),
        h('p', { class: 'sub' }, 'Elige el guion que escribiste. Las palabras *marcadas* se vuelven títulos, [ZOOM] y [CORTE] se vuelven zooms y [SFX: click] pone el sonido en el título más cercano. Los tiempos salen de lo que realmente dijiste.'),
        lista.length ? [sel, h('div', {}, h('button', { type: 'button', class: 'btn gold', onclick: usar }, 'Aplicar este guion al video'))] : h('p', { class: 'hint' }, 'Aún no tienes guiones de Talking Head. Créalos en el módulo Guiones.')),
    ];
  }

  await cargarFuentes();
  sincronizarVocab();
  await inicio();
}
