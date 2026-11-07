// Panel "Propiedades": junta los editores que ya existen según lo que se elija en la línea de tiempo.
const R2 = (n) => Math.round(n * 100) / 100;
const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0').replace('.', ',')}`;

export function cuerpoPropiedades(sel, ctx) {
  const { h, seg, slider, toggle, plan, cambio, refrescar, irPaso, filaTitulo, cuerpoFrase, cuerpoSticker, cuerpoEscena, cuerpoEspecial, abrirTitulo } = ctx;
  const P = plan(), dur = P.duration || 1, ref = sel && sel.ref;
  const vive = sel && ({ evento: P.events, zoom: P.zooms, lento: P.lentos, filtro: P.filtros }[sel.tipo] || []).includes(ref);
  const card = (...k) => h('section', { class: 'card' }, ...k);
  if (!sel || (['evento', 'zoom', 'lento', 'filtro'].includes(sel.tipo) && !vive) || (sel.tipo === 'borrada' && !((P.cortes || {}).borradas || []).includes(ref)))
    return [card(h('p', { class: 'sub' }, 'Toca algo en la línea de tiempo para ver sus ajustes.'))];
  if (sel.tipo === 'pausa') return [card(h('h2', {}, 'Pausa automática'), h('p', { class: 'sub' }, `De ${mmss(ref[0])} a ${mmss(ref[1])}. Se corta sola. Ajústala en Recortar.`),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => irPaso('recorte') }, 'Ir a Recortar'))];
  if (sel.tipo === 'borrada') return [card(h('h2', {}, 'Tramo quitado'), h('p', { class: 'sub' }, `De ${mmss(ref[0])} a ${mmss(ref[1])}. Lo quitaste con el texto o con la línea de tiempo.`),
    h('button', { type: 'button', class: 'btn gold', onclick: () => { P.cortes.borradas.splice(P.cortes.borradas.indexOf(ref), 1); refrescar(); } }, 'Restaurar este tramo'))];

  // Sección "Tiempo": inicio, fin y duración (cambiar la duración mueve el fin)
  const campo = (lbl, val, min, max, alCambiar) => h('label', { class: 'mini-f' }, lbl, h('input', { type: 'number', step: 0.01, min, max, value: val,
    onchange: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) alCambiar(v); refrescar(); } }));
  const tiempo = sel.tipo === 'zoom'
    ? card(h('h2', {}, 'Tiempo'), h('div', { class: 'ev-times' }, campo('Momento (s)', ref.t, 0, dur, (v) => { ref.t = R2(Math.min(Math.max(v, 0), dur)); })), h('p', { class: 'hint' }, mmss(ref.t)))
    : card(h('h2', {}, 'Tiempo'), h('div', { class: 'ev-times' },
      campo('Inicio (s)', ref.start, 0, dur, (v) => { if (v >= 0 && v < ref.end) ref.start = R2(v); }),
      campo('Fin (s)', ref.end, 0, dur, (v) => { if (v > ref.start && v <= dur) ref.end = R2(v); }),
      campo('Duración (s)', R2(ref.end - ref.start), 0.2, dur, (v) => { if (v >= 0.2) ref.end = R2(Math.min(dur, ref.start + v)); })),
    h('p', { class: 'hint' }, `${mmss(ref.start)} → ${mmss(ref.end)}`));

  if (sel.tipo === 'zoom') return [tiempo, card(h('h2', {}, 'Zoom'), slider('Cuánto acerca', 1, 1.3, 0.01, ref.level ?? 1.1, (v) => `${Number(v).toFixed(2)}x`, (v) => { ref.level = v; cambio(); }, 1.1))];
  if (sel.tipo === 'filtro') return [tiempo, card(h('h2', {}, 'Filtro'), slider('Intensidad', 0, 1, 0.05, ref.k ?? 1, (v) => `${Math.round(v * 100)}%`, (v) => { ref.k = v; cambio(); }, 1),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => { ref.start = null; ref.end = null; refrescar(); } }, 'Ponerlo en todo el video'))];
  if (sel.tipo === 'lento') return [tiempo, card(h('h2', {}, 'Cámara lenta'),
    seg('Velocidad', [[1.5, '1.5x más lento'], [2, '2x'], [3, '3x'], [4, '4x']], ref.factor, (v) => { ref.factor = v; refrescar(); }),
    toggle('Voz grave y oscura', ref.grave, (v) => { ref.grave = v; refrescar(); }))];

  // evento: el editor que ya tiene su tipo
  let cuerpo;
  if (!ref.kind) { abrirTitulo(ref.id); cuerpo = [h('ul', { class: 'evs' }, filaTitulo(ref))]; }
  else if (ref.kind === 'frase') cuerpo = cuerpoFrase(ref);
  else if (ref.kind === 'sticker') cuerpo = cuerpoSticker(ref);
  else if (ref.kind === 'escena') cuerpo = cuerpoEscena(ref);
  else cuerpo = cuerpoEspecial(ref);
  const opac = ref.kind === 'sticker' ? null : slider('Opacidad', 0.1, 1, 0.01, ref.opacidad ?? 1, (v) => `${Math.round(v * 100)}%`, (v) => { ref.opacidad = v >= 0.995 ? undefined : v; if (ref.opacidad === undefined) delete ref.opacidad; cambio(); }, 1);
  return [ref.fija ? null : tiempo, opac ? card(opac) : null, card(h('h2', {}, 'Ajustes'), ...cuerpo)];
}
