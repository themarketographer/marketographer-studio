// Panel "Exportar": un solo botón. Arma el video final si hace falta y después saca cada formato elegido (una pasada de ffmpeg cada uno).
const CAL = [[16, 'Alta'], [10, 'Media'], [4, 'Liviana']];
const FPS = [[0, 'Igual'], [24, '24'], [30, '30'], [60, '60']];
const FORM = [['h264', 'MP4 H.264'], ['hevc', 'MP4 HEVC'], ['prores', 'MOV ProRes']];

export async function hojaExportar({ h, api, A, S, toast, seg, guardarAjustes, guardarYa, tiempoRestante, verUltimo, repintar }) {
  const id = S.p.id, base = `/api${A}/proyectos/${id}`;
  const { presets } = await api(`${A}/presets-export`);
  const lista = await api(`${A}/proyectos/${id}/exportados`).catch(() => []);
  const aj = S.aj;
  aj.exportSel = (aj.exportSel || ['redes']).filter((x) => presets.some((p) => p.id === x));
  if (!aj.exportSel.length && !aj.exportCustomOn) aj.exportSel = ['redes'];
  aj.exportCustom = aj.exportCustom || { corto: 1080, fps: 0, codec: 'h264', mbps: 10, lufs: true };
  const C = aj.exportCustom;
  const guardar = () => guardarAjustes(aj);
  const hecho = () => aj.exportSel.length + (aj.exportCustomOn ? 1 : 0);
  const necesitaFinal = () => !S.p.tieneFinal || S.dirty;

  const barra = h('i', { style: 'width:0%' });
  const progreso = h('div', { class: 'exp-prog', hidden: true, role: 'status', 'aria-live': 'polite' }, h('div', { class: 'bar' }, barra), h('small', {}, ''));
  const estado = progreso.querySelector('small');

  const tarjeta = (p) => {
    const on = aj.exportSel.includes(p.id);
    return h('button', { type: 'button', class: 'pz' + (on ? ' on' : ''), 'aria-pressed': String(on),
      onclick: () => { aj.exportSel = on ? aj.exportSel.filter((x) => x !== p.id) : [...aj.exportSel, p.id]; guardar(); repintar(); } },
    h('strong', {}, p.n), h('small', {}, p.uso));
  };

  // Espera a que termine lo que corre en el motor y muestra el avance con el tiempo que falta.
  const esperar = async (cual) => {
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 800));
      const r = await api(`${A}/proyectos/${id}/estado`);
      const st = r.status || {};
      barra.style.width = `${Math.min(100, Number(st.pct) || 0)}%`;
      estado.textContent = [cual, tiempoRestante(st)].filter(Boolean).join(' · ');
      if (!r.corriendo) { if (st.error) throw new Error(st.error); return; }
    }
  };

  async function exportar() {
    const tareas = aj.exportSel.map((p) => ({ preset: p }));
    if (aj.exportCustomOn) tareas.push({ preset: 'custom', custom: { codec: C.codec, corto: C.corto, fps: C.fps || null, mbps: C.mbps, lufs: C.lufs ? -14 : null, n: 'Personalizado' } });
    if (!tareas.length) { toast('Marca al menos un formato.'); return; }
    btn.disabled = true; progreso.hidden = false; barra.style.width = '0%';
    try {
      if (necesitaFinal()) {
        estado.textContent = 'Armando el video final…';
        await guardarYa();
        await api(`${A}/proyectos/${id}/renderizar`, { method: 'POST', body: { calidad: 'final' } });
        await esperar('Armando el video final');
        const d = await api(`${A}/proyectos/${id}`);
        S.p.tieneFinal = d.tieneFinal; S.dirty = false;
      }
      for (const [i, t] of tareas.entries()) {
        const nombre = t.preset === 'custom' ? 'Personalizado' : (presets.find((p) => p.id === t.preset) || {}).n || t.preset;
        estado.textContent = `Exportando ${nombre}…`;
        await api(`${A}/proyectos/${id}/exportar`, { method: 'POST', body: t });
        await esperar(tareas.length > 1 ? `${i + 1} de ${tareas.length}: ${nombre}` : nombre);
      }
      toast('Listo. Tus archivos están abajo.');
    } catch (e) { toast(e.message); }
    repintar();
  }
  const etq = () => `Exportar ${hecho()} archivo${hecho() === 1 ? '' : 's'}`;
  const btn = h('button', { type: 'button', class: 'btn gold exp-btn', onclick: exportar }, etq());

  const personalizado = h('details', { open: !!aj.exportCustomOn },
    h('summary', {}, 'Ajuste personalizado'),
    h('label', { class: 'sw-row' }, h('input', { type: 'checkbox', checked: !!aj.exportCustomOn, onchange: (e) => { aj.exportCustomOn = e.target.checked; guardar(); repintar(); } }), h('span', {}, 'Incluir este ajuste')),
    seg('Resolución', [[720, '720p'], [1080, '1080p']], C.corto, (v) => { C.corto = Number(v); guardar(); repintar(); }),
    seg('Cuadros por segundo', FPS, C.fps, (v) => { C.fps = Number(v); guardar(); repintar(); }),
    seg('Formato', FORM, C.codec, (v) => { C.codec = v; guardar(); repintar(); }),
    seg('Calidad', CAL, C.mbps, (v) => { C.mbps = Number(v); guardar(); repintar(); }),
    h('label', { class: 'sw-row' }, h('input', { type: 'checkbox', checked: !!C.lufs, onchange: (e) => { C.lufs = e.target.checked; guardar(); } }), h('span', {}, 'Sonido parejo para redes (−14 LUFS)')));

  const filas = lista.map((f) => {
    const vol = f.lufs != null ? ` · ${String(f.lufs).replace('.', ',')} LUFS` : '';
    const aviso = f.lufs != null && (f.lufs < -16 || f.lufs > -12) ? ' (para redes conviene cerca de −14)' : '';
    return h('li', {}, h('a', { href: `${base}/exportados/${encodeURIComponent(f.nombre)}`, download: f.nombre }, f.nombre), h('small', {}, ` ${f.mb} MB${vol}${aviso}${f.nota ? ' · ' + f.nota : ''}`));
  });

  return [
    h('div', { class: 'pz-grid' }, presets.map(tarjeta)),
    personalizado,
    h('div', { class: 'exp-accion' }, btn,
      h('small', { class: 'hint' }, necesitaFinal() ? 'Primero se arma el video final con tus cambios (tarda un poco) y luego sale cada formato.' : 'El video final ya está listo: solo falta sacar los formatos.')),
    progreso,
    S.p.tieneFinal ? h('div', { class: 'exp-ultimo' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: verUltimo }, '▶ Ver el último video armado')) : null,
    filas.length ? h('div', { class: 'ctl' }, h('h3', {}, 'Ya exportados'), h('ul', { class: 'lista-export' }, filas)) : null,
  ];
}
