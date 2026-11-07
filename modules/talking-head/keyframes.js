// Fotogramas clave: un elemento puede cambiar de posición, tamaño, giro o transparencia con el tiempo.
// ev.kf = [{ t, x, y, ancho, rot, op, escala, fx, fy, opacidad }]: t en segundos desde que empieza el elemento; cada fotograma lleva las
// propiedades que fija. Entre dos fotogramas se mueve suave (curva smoothstep); antes del primero y después del último se queda quieto.
// La misma fórmula está en engine/graficos.py (kf_valor): si cambias una, cambia la otra.
export const PROPS_KF = ['x', 'y', 'ancho', 'rot', 'op', 'escala', 'fx', 'fy', 'opacidad'];

export function kfValor(ev, prop, d, base) {
  const ks = (ev.kf || []).filter((k) => k[prop] != null);
  if (!ks.length) return base;
  ks.sort((a, b) => a.t - b.t);
  if (d <= ks[0].t) return ks[0][prop];
  const u = ks[ks.length - 1];
  if (d >= u.t) return u[prop];
  for (let i = 1; i < ks.length; i++) {
    if (d <= ks[i].t) {
      const a = ks[i - 1], b = ks[i], f = (d - a.t) / Math.max(b.t - a.t, 1e-6), e = f * f * (3 - 2 * f);
      return a[prop] + (b[prop] - a[prop]) * e;
    }
  }
  return u[prop];
}

// Cambia una propiedad: sin animación se guarda en el elemento; con animación, en el fotograma de ese instante (lo crea si no hay uno cerca).
export function kfPoner(ev, prop, valor, d, valoresActuales = {}) {
  if (!ev.kf || !ev.kf.length) { ev[prop] = valor; return; }
  let k = ev.kf.find((x) => Math.abs(x.t - d) < 0.08);
  if (!k) {
    k = { t: Math.round(Math.max(0, d) * 100) / 100 };
    for (const p of PROPS_KF) { const v = kfValor(ev, p, d, valoresActuales[p]); if (v != null) k[p] = v; }
    ev.kf.push(k);
    ev.kf.sort((a, b) => a.t - b.t);
  }
  k[prop] = valor;
}

// Fija un fotograma nuevo en el instante d con los valores que tiene el elemento en ese momento (si ya hay uno cerca, no hace nada).
export function kfFijar(ev, d, valores = {}) {
  if (!ev.kf || ev.kf.some((x) => Math.abs(x.t - d) < 0.08)) return;
  const k = { t: Math.round(Math.max(0, d) * 100) / 100 };
  for (const p of PROPS_KF) { const v = kfValor(ev, p, d, valores[p]); if (v != null) k[p] = v; }
  ev.kf.push(k); ev.kf.sort((a, b) => a.t - b.t);
}

// Activa la animación: un fotograma al empezar y otro al terminar con los valores de hoy.
export function kfActivar(ev, valores) {
  const base = {}; for (const p of PROPS_KF) if (valores[p] != null) base[p] = valores[p];
  ev.kf = [{ t: 0, ...base }, { t: Math.round((ev.end - ev.start) * 100) / 100, ...base }];
}

// node -e "import('./keyframes.js').then(m=>{const e={kf:[{t:0,x:0},{t:2,x:1}]};console.assert(m.kfValor(e,'x',-1,9)===0);console.assert(Math.abs(m.kfValor(e,'x',1,9)-0.5)<1e-9);console.assert(m.kfValor(e,'x',5,9)===1);console.assert(m.kfValor({},'x',1,9)===9)})"
