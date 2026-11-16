// Storytelling: una narración y las imágenes de cada escena se convierten en un video vertical con subtítulos.
// Usa el motor de Talking Head: crea un video "de solo voz", reparte las imágenes en las pausas de la narración
// y lo abre en el editor para afinar y exportar.
import { repartir, eventoEscena } from './assets/reparto.js';
const TH = '/talking-head';
const TRANS = [['cruce', 'Fundido lento'], ['fade', 'Fundido corto'], ['barrido', 'Cortina'], ['zoom', 'Golpe de zoom']];

export async function mount(root, { api, toast, h, icon }) {
  const S = { titulo: '', audio: null, imgs: [], trans: 'cruce', trabajando: '', rec: null, seg: 0 };
  const subir = (ruta, cuerpo) => fetch('/api' + ruta, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: cuerpo })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'No pude subir el archivo.'); return j; });
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let historias = [];
  try { historias = (await api(TH + '/proyectos')).filter((p) => p.historia); } catch { /* el motor puede no estar listo */ }
  const abrir = (id) => { try { sessionStorage.setItem('th-abrir', id); } catch { /* sin almacenamiento */ } location.hash = '#/talking-head'; };

  // ---------- grabar la narración aquí mismo ----------
  let stream = null, chunks = [], reloj = 0;
  async function grabar() {
    if (S.rec) { S.rec.stop(); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast('No pude usar el micrófono. Revisa el permiso del navegador o sube un audio.'); return; }
    chunks = []; S.seg = 0;
    S.rec = new MediaRecorder(stream);
    S.rec.ondataavailable = (e) => chunks.push(e.data);
    S.rec.onstop = () => {
      clearInterval(reloj); stream.getTracks().forEach((t) => t.stop());
      S.audio = new File(chunks, 'narracion.webm', { type: S.rec.mimeType || 'audio/webm' }); S.rec = null; pintar();
    };
    S.rec.start(); reloj = setInterval(() => { S.seg++; pintar(); }, 1000); pintar();
  }

  // ---------- crear el video ----------
  async function crear() {
    if (!S.audio) return toast('Falta la narración: sube un audio o grábala.');
    if (S.imgs.length < 2) return toast('Sube al menos dos imágenes, una por escena.');
    try {
      const sello = Date.now().toString(36), nombres = [];
      for (let i = 0; i < S.imgs.length; i++) {
        S.trabajando = `Subiendo la imagen ${i + 1} de ${S.imgs.length}`; pintar();
        const ext = (/\.(png|jpe?g|webp)$/i.exec(S.imgs[i].name) || ['.jpg'])[0].toLowerCase();
        nombres.push((await subir(`${TH}/escenas/subir?nombre=${encodeURIComponent(`historia-${sello}-${i + 1}${ext}`)}`, S.imgs[i])).nombre);
      }
      S.trabajando = 'Subiendo la narración'; pintar();
      const titulo = S.titulo.trim() || 'Historia';
      const p = await subir(`${TH}/voz?historia=1&fondo=negro&titulo=${encodeURIComponent(titulo)}&nombre=${encodeURIComponent(S.audio.name)}`, S.audio);
      // El motor transcribe la voz. Se espera a que termine antes de repartir las escenas.
      for (let est = p; ; est = await api(`${TH}/proyectos/${p.id}/estado`)) {
        if (est.status?.error) throw new Error(est.status.error);
        if (!est.corriendo && est.analizado) break;
        S.trabajando = est.status?.msg ? `${est.status.msg}${est.status.pct ? ` (${Math.round(est.status.pct)}%)` : ''}` : 'Transcribiendo tu voz'; pintar();
        await esperar(1500);
      }
      S.trabajando = 'Repartiendo las escenas'; pintar();
      const full = await api(`${TH}/proyectos/${p.id}`), plan = full.plan;
      const tramos = repartir(full.palabras || [], plan.duration || full.duracionVoz, nombres.length);
      // Las escenas van primero en la lista para que los subtítulos y las frases se dibujen encima.
      plan.events = tramos.map((t, i) => eventoEscena(nombres[i], t, S.trans, i, i === tramos.length - 1)).concat((plan.events || []).filter((e) => e.kind !== 'escena'));
      await api(`${TH}/proyectos/${p.id}/plan`, { method: 'PUT', body: plan });
      toast('Historia lista. Se abre en el editor.');
      abrir(p.id);
    } catch (e) { S.trabajando = ''; pintar(); toast(e.message || 'No pude crear la historia.'); }
  }

  function pintar() {
    const elegirImgs = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true, onchange: (e) => { S.imgs = S.imgs.concat([...e.target.files]).slice(0, 10); pintar(); } });
    const elegirAudio = h('input', { type: 'file', accept: 'audio/*,video/mp4,.m4a,.mp3,.wav,.webm', hidden: true, onchange: (e) => { if (e.target.files[0]) { S.audio = e.target.files[0]; pintar(); } } });
    const ocupado = !!S.trabajando;
    root.replaceChildren(
      h('div', { class: 'page-head' }, h('h1', {}, 'Storytelling'), h('p', {}, 'Cuentas la historia con tu voz y cada escena lleva su imagen. El Estudio transcribe, pone los subtítulos, cambia de imagen en las pausas y deja el video listo para afinar y exportar.')),
      h('div', { class: 'card hist' },
        h('label', { class: 'hist-campo' }, h('span', {}, 'Título de la historia'),
          h('input', { type: 'text', maxlength: '80', value: S.titulo, placeholder: 'El día que casi regalo una boda', oninput: (e) => { S.titulo = e.target.value; } })),

        h('div', { class: 'hist-paso' }, h('h2', {}, '1. La narración'),
          h('p', { class: 'muted' }, 'Sube el audio que ya grabaste o grábalo ahora. Entre 30 y 90 segundos funciona mejor.'),
          h('div', { class: 'hist-fila' },
            h('button', { type: 'button', class: 'btn ghost', disabled: ocupado || !!S.rec, onclick: () => elegirAudio.click(), html: icon('folder', 16) + ' Subir audio' }),
            h('button', { type: 'button', class: 'btn ' + (S.rec ? 'danger' : 'ghost'), disabled: ocupado, onclick: grabar, html: icon('mic', 16) + (S.rec ? ` Detener (${S.seg} s)` : ' Grabar ahora') }),
            S.audio && !S.rec ? h('span', { class: 'hist-ok' }, `Lista: ${S.audio.name} (${(S.audio.size / 1e6).toFixed(1).replace('.', ',')} MB)`) : null),
          elegirAudio),

        h('div', { class: 'hist-paso' }, h('h2', {}, '2. Las imágenes de cada escena'),
          h('p', { class: 'muted' }, 'Una imagen por escena, en el orden en que pasan. Verticales se ven mejor. Mínimo dos.'),
          h('ul', { class: 'hist-imgs' },
            S.imgs.map((f, i) => h('li', {}, h('img', { src: URL.createObjectURL(f), alt: `Escena ${i + 1}` }), h('span', {}, `Escena ${i + 1}`),
              h('div', { class: 'hist-fila' },
                i > 0 ? h('button', { type: 'button', class: 'btn ghost sm', disabled: ocupado, 'aria-label': `Mover la escena ${i + 1} antes`, onclick: () => { S.imgs.splice(i - 1, 0, S.imgs.splice(i, 1)[0]); pintar(); }, html: icon('chev-izq', 14) }) : null,
                h('button', { type: 'button', class: 'btn ghost sm', disabled: ocupado, 'aria-label': `Quitar la escena ${i + 1}`, onclick: () => { S.imgs.splice(i, 1); pintar(); }, html: icon('x', 14) })))),
            h('li', {}, h('button', { type: 'button', class: 'hist-mas', disabled: ocupado || S.imgs.length >= 10, onclick: () => elegirImgs.click(), html: icon('plus', 22) + '<span>Agregar imágenes</span>' }))),
          elegirImgs),

        h('div', { class: 'hist-paso' }, h('h2', {}, '3. Cómo cambia de una escena a otra'),
          h('div', { class: 'hist-fila', role: 'radiogroup', 'aria-label': 'Transición entre escenas' },
            TRANS.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(S.trans === v), class: 'btn sm ' + (S.trans === v ? 'gold' : 'ghost'), disabled: ocupado, onclick: () => { S.trans = v; pintar(); } }, l)))),

        h('div', { class: 'hist-pie' },
          ocupado ? h('span', { class: 'hist-trab', role: 'status', 'aria-live': 'polite' }, S.trabajando + '…') : h('span', { class: 'muted' }, 'Después puedes cambiar cada escena, los subtítulos y la música en el editor.'),
          h('button', { type: 'button', class: 'btn gold', disabled: ocupado, onclick: crear, html: icon('film', 16) + ' Crear el video' }))),

      historias.length ? h('div', {}, h('h2', { class: 'hist-sec' }, 'Tus historias'),
        h('ul', { class: 'hist-lista' }, historias.map((p) => h('li', {}, h('button', { type: 'button', class: 'btn ghost', onclick: () => abrir(p.id) },
          h('strong', {}, p.nombre), h('small', {}, ` ${p.tieneFinal ? 'Con video final' : 'Para afinar'}${p.creado ? ' · ' + new Date(p.creado).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : ''}`)))))) : null);
  }
  pintar();
}
