// Reparte la narración entre las escenas: cada cambio de imagen cae en la pausa más larga cerca del corte parejo,
// para que la imagen no cambie a mitad de una frase.   Prueba:  node modules/storytelling/assets/reparto.js
export function repartir(palabras, duracion, n) {
  const cortes = [];
  for (let k = 1; k < n; k++) {
    const ideal = (duracion * k) / n, ventana = (duracion / n) * 0.3;
    let mejor = ideal, hueco = 0;
    for (let i = 0; i < palabras.length - 1; i++) {
      const fin = palabras[i].end, pausa = palabras[i + 1].start - fin, medio = fin + pausa / 2;
      if (Math.abs(medio - ideal) <= ventana && pausa > hueco && medio > (cortes[cortes.length - 1] || 0) + 1) { hueco = pausa; mejor = medio; }
    }
    cortes.push(+mejor.toFixed(2));
  }
  const bordes = [0, ...cortes, +duracion.toFixed(2)];
  return bordes.slice(0, -1).map((ini, i) => ({ start: ini, end: bordes[i + 1] }));
}

// Evento de escena tal como lo entiende el motor de Talking Head (engine/graficos.py, kind "escena").
// Cada escena dura un poco más que su tramo (SOLAPE) para que la siguiente entre encima: así el cambio es un fundido
// de imagen a imagen y no pasa por negro. La última termina justo con la narración.
export const SOLAPE = 1.1;
export function eventoEscena(imagen, tramo, trans, i, esUltima) {
  return { id: 'h' + Date.now().toString(36) + i, kind: 'escena', items: [], text: 'Escena ' + (i + 1), emoji: '', fondo: 'imagen', imagen, velo: false,
    start: tramo.start, end: +(tramo.end + (esUltima ? 0 : SOLAPE)).toFixed(2), pos: 'centro', size: 'L', trans, color: 'accent' };
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('reparto.js')) {
  const { strict: a } = await import('node:assert');
  // 12 palabras de 1 s seguidas, con una pausa larga entre la 5.ª y la 6.ª (de 5,0 a 6,6).
  const w = []; let t = 0;
  for (let i = 0; i < 12; i++) { if (i === 5) t += 1.6; w.push({ start: t, end: t + 0.9 }); t += 1; }
  const dur = t;
  const dos = repartir(w, dur, 2);
  a.equal(dos.length, 2); a.equal(dos[0].start, 0); a.equal(dos[1].end, +dur.toFixed(2));
  a.ok(dos[0].end > 4.9 && dos[0].end < 6.6, 'el corte cae en la pausa larga, no a mitad de palabra');
  a.equal(dos[0].end, dos[1].start);
  const tres = repartir(w, dur, 3);
  a.equal(tres.length, 3); a.ok(tres[0].end < tres[1].end && tres[1].end < tres[2].end);
  tres.forEach((x) => a.ok(x.end - x.start > 1));
  a.deepEqual(repartir([], 10, 2), [{ start: 0, end: 5 }, { start: 5, end: 10 }]);   // sin palabras: partes iguales
  a.equal(repartir(w, dur, 1).length, 1);
  const ev = eventoEscena('a.jpg', dos[0], 'cruce', 0, false);
  a.equal(ev.end, +(dos[0].end + SOLAPE).toFixed(2)); a.equal(eventoEscena('b.jpg', dos[1], 'cruce', 1, true).end, dos[1].end);
  a.equal(ev.kind, 'escena'); a.equal(ev.fondo, 'imagen'); a.equal(ev.velo, false); a.deepEqual(ev.items, []);
  console.log('reparto: 15 comprobaciones pasan');
}
