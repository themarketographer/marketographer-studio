// Panel "Exportar": presets de salida sobre el video final ya armado (una pasada de ffmpeg cada uno).
const CAL = [[16, 'Alta'], [10, 'Media'], [4, 'Liviana']];
const FPS = [[0, 'Igual'], [24, '24'], [30, '30'], [60, '60']];
const FORM = [['h264', 'MP4 H.264'], ['hevc', 'MP4 HEVC'], ['prores', 'MOV ProRes']];

export async function hojaExportar({ h, api, A, S, toast, seg, guardarAjustes, repintar, exportarFinal }) {
  const id = S.p.id, base = `/api${A}/proyectos/${id}`;
  const { presets } = await api(`${A}/presets-export`);
  const lista = await api(`${A}/proyectos/${id}/exportados`).catch(() => []);
  const aj = S.aj;
  aj.exportSel = (aj.exportSel || ['redes']).filter((x) => presets.some((p) => p.id === x));
  aj.exportCustom = aj.exportCustom || { corto: 1080, fps: 0, codec: 'h264', mbps: 10, lufs: true };
  const C = aj.exportCustom;
  const guardar = () => guardarAjustes(aj);
  const estado = h('p', { class: 'hint', role: 'status' }, '');
  const hecho = () => aj.exportSel.length + (aj.exportCustomOn ? 1 : 0);

  const tarjeta = (p) => {
    const on = aj.exportSel.includes(p.id);
    return h('button', { type: 'button', class: 'pz' + (on ? ' on' : ''), 'aria-pressed': String(on),
      onclick: () => { aj.exportSel = on ? aj.exportSel.filter((x) => x !== p.id) : [...aj.exportSel, p.id]; guardar(); repintar(); } },
    h('strong', {}, p.n), h('small', {}, p.uso));
  };

  const esperar = async () => {
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 1000));
      const r = await api(`${A}/proyectos/${id}/estado`);
      if (!r.corriendo) { if (r.status?.error) throw new Error(r.status.error); return; }
    }
  };
  async function exportar() {
    if (!S.p.tieneFinal) { toast('Primero arma el video final con el botón dorado.'); return; }
    const tareas = aj.exportSel.map((p) => ({ preset: p }));
    if (aj.exportCustomOn) tareas.push({ preset: 'custom', custom: { codec: C.codec, corto: C.corto, fps: C.fps || null, mbps: C.mbps, lufs: C.lufs ? -14 : null, n: 'Personalizado' } });
    if (!tareas.length) { toast('Marca al menos un formato.'); return; }
    btn.disabled = true;
    try {
      for (const [i, t] of tareas.entries()) {
        estado.textContent = `Exportando ${i + 1} de ${tareas.length}...`;
        await api(`${A}/proyectos/${id}/exportar`, { method: 'POST', body: t });
        await esperar();
      }
      toast('Listo. Tus archivos están abajo.');
    } catch (e) { toast(e.message); }
    repintar();
  }
  const btn = h('button', { type: 'button', class: 'btn gold', onclick: exportar }, `Exportar ${hecho()} archivo${hecho() === 1 ? '' : 's'}`);

  const personalizado = h('details', { open: !!aj.exportCustomOn },
    h('summary', {}, 'Personalizado'),
    h('label', { class: 'sw-row' }, h('input', { type: 'checkbox', checked: !!aj.exportCustomOn, onchange: (e) => { aj.exportCustomOn = e.target.checked; guardar(); repintar(); } }), h('span', {}, 'Incluir este ajuste')),
    seg('Resolución', [[720, '720p'], [1080, '1080p']], C.corto, (v) => { C.corto = Number(v); guardar(); repintar(); }),
    seg('Cuadros por segundo', FPS, C.fps, (v) => { C.fps = Number(v); guardar(); repintar(); }),
    seg('Formato', FORM, C.codec, (v) => { C.codec = v; guardar(); repintar(); }),
    seg('Calidad', CAL, C.mbps, (v) => { C.mbps = Number(v); guardar(); repintar(); }),
    h('label', { class: 'sw-row' }, h('input', { type: 'checkbox', checked: !!C.lufs, onchange: (e) => { C.lufs = e.target.checked; guardar(); } }), h('span', {}, 'Sonido parejo para redes (−14 LUFS)')));

  const filas = lista.map((f) => {
    const vol = f.lufs != null ? ` · ${String(f.lufs).replace('.', ',')} LUFS · pico ${String(f.pico).replace('.', ',')} dB` : '';
    const aviso = f.lufs != null && (f.lufs < -16 || f.lufs > -12) ? 'Para redes conviene cerca de −14.' : '';
    return h('li', {}, h('a', { href: `${base}/exportados/${encodeURIComponent(f.nombre)}`, download: f.nombre }, f.nombre), h('small', {}, ` ${f.mb} MB${vol}. ${[f.nota, aviso].filter(Boolean).join(' ')}`));
  });

  return [
    S.p.tieneFinal ? null : h('div', { class: 'callout warn' }, 'Aún no hay video final. ', h('button', { type: 'button', class: 'btn ghost sm', onclick: exportarFinal }, 'Armar video final')),
    h('div', { class: 'pz-grid' }, presets.map(tarjeta)),
    personalizado,
    h('div', { class: 'actions' }, btn),
    estado,
    h('h3', {}, 'Ya exportados'),
    filas.length ? h('ul', { class: 'lista-export' }, filas) : h('p', { class: 'hint' }, 'Todavía no exportaste nada en otros formatos.'),
  ];
}
