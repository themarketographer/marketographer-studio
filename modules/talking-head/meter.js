// Medidor de sonido: picos por canal (barras) y volumen percibido en LUFS. Solo lee la mezcla en vivo, no la cambia.
export const dbDe = (pico) => 20 * Math.log10(Math.max(pico, 1e-6));
export const lufsDe = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-10));
// node -e "import('./meter.js').then(m=>{console.assert(Math.abs(m.dbDe(0.5)+6.02)<0.01);console.assert(Math.abs(m.lufsDe(1)+0.691)<0.01)})"

const MIN = -60, MARCAS = [-6, -12, -18, -24, -36, -48];
const fmt = (n) => (n > -70 ? n.toFixed(1).replace('.', ',').replace('-', '−') : '—');

export function crearMedidor({ h, fuente }) {
  const W = 44, H = 220, dpr = window.devicePixelRatio || 1;
  const cv = h('canvas', { width: W * dpr, height: H * dpr, style: `width:${W}px;height:${H}px`, 'aria-hidden': 'true' });
  const g = cv.getContext('2d');
  const txt = h('p', { class: 'med-txt', role: 'status', 'aria-label': 'Volumen del sonido' }, 'Sin sonido');
  const el = h('div', { class: 'medidor' }, cv, txt, h('p', { class: 'hint' }, 'Para redes: cerca de −14'));
  let nodos = null, fuenteAc = null, raf = 0, sat = false, cierra = false;
  const nivel = [0, 0], retenido = [MIN, MIN], tRet = [0, 0], hist = [];
  let tPrev = performance.now();

  function conectar(f) {
    const { ac, master } = f;
    const split = ac.createChannelSplitter(2), an = [0, 1].map(() => { const a = ac.createAnalyser(); a.fftSize = 2048; return a; });
    const sh = ac.createBiquadFilter(), hp = ac.createBiquadFilter(), ak = ac.createAnalyser();
    sh.type = 'highshelf'; sh.frequency.value = 1681; sh.gain.value = 4;
    hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5; ak.fftSize = 32768;
    master.connect(split); an.forEach((a, i) => split.connect(a, i));
    master.connect(sh); sh.connect(hp); hp.connect(ak);
    nodos = { an, ak, bufs: an.map((a) => new Float32Array(a.fftSize)), bk: new Float32Array(ak.fftSize), sr: ac.sampleRate, master, split, sh };
    fuenteAc = ac;
  }
  function desconectar() {
    if (!nodos) return;
    try { nodos.master.disconnect(nodos.split); nodos.master.disconnect(nodos.sh); } catch { /* ya cerrado */ }
    nodos = null; fuenteAc = null;
  }

  function cuadro(now) {
    if (cierra || !el.isConnected) { desconectar(); raf = 0; return; }
    const dt = Math.min((now - tPrev) / 1000, 0.1); tPrev = now;
    const f = fuente();
    if (f && f.ac !== fuenteAc) { desconectar(); conectar(f); } else if (!f && nodos) desconectar();
    if (nodos) {
      nodos.an.forEach((a, i) => {
        a.getFloatTimeDomainData(nodos.bufs[i]);
        let p = 0; for (const x of nodos.bufs[i]) p = Math.max(p, Math.abs(x));
        const db = Math.max(dbDe(p), MIN);
        nivel[i] = db >= nivel[i] ? db : Math.max(db, nivel[i] - 20 * dt);
        if (db >= retenido[i] || now - tRet[i] > 1500) { retenido[i] = db; tRet[i] = now; }
        if (db >= -0.1) sat = true;
      });
      nodos.ak.getFloatTimeDomainData(nodos.bk);
      const n = Math.min(nodos.bk.length, Math.round(0.4 * nodos.sr));
      let s = 0; for (let i = nodos.bk.length - n; i < nodos.bk.length; i++) s += nodos.bk[i] * nodos.bk[i];
      hist.push([now, 2 * s / n]);
      while (hist.length && now - hist[0][0] > 3000) hist.shift();
      const corto = hist.reduce((a, x) => a + x[1], 0) / hist.length;
      txt.textContent = `Ahora ${fmt(lufsDe(hist[hist.length - 1][1]))} LUFS · Promedio ${fmt(lufsDe(corto))}`;
    } else { nivel[0] = Math.max(MIN, nivel[0] - 20 * dt); nivel[1] = Math.max(MIN, nivel[1] - 20 * dt); txt.textContent = 'Sin sonido'; }
    pintar();
    raf = requestAnimationFrame(cuadro);
  }

  function pintar() {
    const css = getComputedStyle(el), col = (v) => css.getPropertyValue(v).trim() || '#888';
    const y = (db) => H - 14 - ((Math.max(db, MIN) - MIN) / -MIN) * (H - 20);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.font = '8px system-ui'; g.fillStyle = col('--muted'); g.strokeStyle = col('--line');
    for (const m of MARCAS) { g.beginPath(); g.moveTo(0, y(m)); g.lineTo(W, y(m)); g.stroke(); g.fillText(String(m), W / 2 - 8, y(m) - 1); }
    [0, 1].forEach((i) => {
      const x = 4 + i * 22;
      for (const [a, b, c] of [[MIN, -12, '--ok'], [-12, -3, '--accent'], [-3, 0, '--neg']]) {
        const lo = Math.max(a, MIN), hi = Math.min(b, nivel[i]); if (hi <= lo) continue;
        g.fillStyle = col(c); g.fillRect(x, y(hi), 16, y(lo) - y(hi));
      }
      g.fillStyle = col('--ink'); g.fillRect(x, y(retenido[i]), 16, 1.5);
    });
    g.fillStyle = sat ? col('--neg') : col('--line'); g.beginPath(); g.arc(W / 2, 6, 4, 0, 7); g.fill();
  }
  cv.title = 'Si se pone rojo, el sonido saturó. Toca para apagarlo.';
  cv.onclick = () => { sat = false; };
  raf = requestAnimationFrame(cuadro);
  return { el, destroy: () => { cierra = true; cancelAnimationFrame(raf); desconectar(); } };
}
