// Cascarón del Estudio: lee los módulos del servidor, arma el menú y monta cada interfaz.
const ICONS = {
  pen: '<path d="M4 20l1-4L16 5a2.1 2.1 0 013 3L8 19zM13.5 7.5l3 3"/>',
  video: '<path d="M5 6h8a3 3 0 013 3v6a3 3 0 01-3 3H5a3 3 0 01-3-3V9a3 3 0 013-3zM16 11l6-3v8l-6-3z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M17 5a3.5 3.5 0 010 7M22 20c0-2.6-1.7-4.6-4-5.4"/>',
  film: '<path d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  'chev-izq': '<path d="M15 6l-6 6 6 6"/>',
  'chev-der': '<path d="M9 6l6 6-6 6"/>',
  idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  doc: '<path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5M9 13h6M9 17h4"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  estructura: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  mic: '<path d="M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4"/>',
  folder: '<path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
};
export const icon = (name, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Algo falló');
  return data;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}

const main = document.getElementById('main');
// Entrada escalonada de lo que aparece al abrir una pantalla. Se quita sola para que los cambios posteriores no se repitan.
function entrada(el) { el.classList.add('entra'); clearTimeout(el._ent); el._ent = setTimeout(() => el.classList.remove('entra'), 1100); }
window.estudioEntrada = entrada;
const nav = document.getElementById('nav');
let modules = [];

function renderNav(activeId) {
  nav.replaceChildren(...modules.map((m) => {
    const a = h('a', { href: `#/${m.id}`, title: m.nombre, 'aria-current': m.id === activeId ? 'page' : null },
      h('span', { html: icon(m.icono) }), m.nombre,
      m.estado !== 'listo' ? h('span', { class: 'pill' }, 'Pronto') : null);
    return h('li', {}, a);
  }));
}

function renderSoon(m) {
  main.replaceChildren(h('div', { class: 'soon' },
    h('div', { class: 'page-head' }, h('h1', {}, m.nombre), h('p', {}, m.descripcion)),
    m.pasos ? h('div', {}, h('h2', { style: 'font-size:20px;margin-bottom:10px' }, 'Cómo va a funcionar'), h('ol', {}, m.pasos.map((p) => h('li', {}, p)))) : null,
    m.necesita ? h('div', { class: 'callout' }, h('strong', {}, 'Para empezar: '), m.necesita) : null));
}

let currentCss;
async function route() {
  const id = location.hash.replace(/^#\//, '') || modules[0]?.id;
  const m = modules.find((x) => x.id === id) || modules[0];
  renderNav(m.id);
  document.title = `${m.nombre} · Estudio Marketographer`;
  currentCss?.remove();
  if (m.estado === 'listo' && m.hasUi) {
    currentCss = h('link', { rel: 'stylesheet', href: `/m/${m.id}/ui.css` });
    document.head.append(currentCss);
    main.replaceChildren();
    try {
      const mod = await import(`/m/${m.id}/ui.js?v=${Date.now()}`);
      await mod.mount(main, { api, toast, h, icon });
    } catch (e) {
      console.error(e);
      main.replaceChildren(h('div', { class: 'callout' }, 'No pude abrir este módulo: ' + e.message));
    }
  } else renderSoon(m);
  main.focus({ preventScroll: true });
  entrada(main);
}

modules = await api('/modules');
addEventListener('hashchange', route);
route();

// Si el Estudio se actualiza mientras la pantalla sigue abierta, se avisa (si no, queda una mezcla de pantalla vieja con motor nuevo).
(async () => {
  let base; try { base = (await api('/version')).ui; } catch { return; }
  setInterval(async () => {
    let v; try { v = (await api('/version')).ui; } catch { return; }
    if (v === base || document.getElementById('aviso-version')) return;
    document.body.append(h('div', { id: 'aviso-version', role: 'status', style: 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:100;background:var(--ink);color:var(--surface-100);padding:10px 14px;border-radius:14px;display:flex;gap:12px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.4)' },
      h('span', {}, 'El Estudio se actualizó.'), h('button', { class: 'btn gold sm', onclick: () => location.reload() }, 'Recargar')));
  }, 15000);
})();

// Tamaño de la interfaz: 70% a 130%, se recuerda en este navegador.
(() => {
  const val = document.getElementById('esc-val'); if (!val) return;
  const poner = (e) => { e = Math.min(1.3, Math.max(0.7, Math.round(e * 100) / 100)); document.documentElement.style.setProperty('--esc', e); val.textContent = Math.round(e * 100) + '%'; try { localStorage.setItem('estudio.escala', e); } catch { /* sin almacenamiento */ } };
  const act = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--esc')) || 0.9;
  document.getElementById('esc-menos').onclick = () => poner(act() - 0.05);
  document.getElementById('esc-mas').onclick = () => poner(act() + 0.05);
  document.getElementById('esc-reset').onclick = () => poner(0.9);
  val.textContent = Math.round(act() * 100) + '%';
})();

// Copias de seguridad: lista, crea y restaura las copias fechadas de data/*.json.
document.getElementById('resp-btn')?.addEventListener('click', async () => {
  const fondo = h('div', { class: 'resp-fondo', onclick: (e) => { if (e.target === fondo) fondo.remove(); } });
  const caja = h('div', { class: 'resp-caja', role: 'dialog', 'aria-label': 'Copias de seguridad' });
  fondo.append(caja); document.body.append(fondo);
  const fecha = (id) => { const m = /^(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)/.exec(id); return m ? `${m[3]}/${m[2]}/${m[1]} a las ${m[4]}:${m[5]}` : id; };
  async function pintar() {
    const lista = await api('/respaldos');
    caja.replaceChildren(
      h('h2', {}, 'Copias de seguridad'),
      h('p', {}, 'Cada vez que abres el Estudio se guarda una copia si algo cambió. Se conservan las últimas 15. Restaurar guarda antes lo que tienes ahora.'),
      ...(lista.length ? lista.map((r) => h('div', { class: 'resp-fila' },
        h('span', {}, fecha(r.id), h('small', {}, `${r.temas} temas, ${r.guiones} guiones, ${r.clases} clases`)),
        h('button', { onclick: async () => {
          if (!confirm(`Restaurar la copia del ${fecha(r.id)}? Tus datos actuales se guardan antes.`)) return;
          await api(`/respaldos/${r.id}/restaurar`, { method: 'POST' }); toast('Copia restaurada. Recarga la página.'); setTimeout(() => location.reload(), 900);
        } }, 'Restaurar'))) : [h('p', {}, 'Todavía no hay copias.')]),
      h('div', { class: 'resp-pie' },
        h('button', { onclick: async () => { const r = await api('/respaldos', { method: 'POST' }); toast(r.id === 'sin-cambios' ? 'Ya tienes una copia igual a lo actual' : 'Copia creada'); pintar(); } }, 'Hacer una copia ahora'),
        h('button', { onclick: () => fondo.remove() }, 'Cerrar')));
  }
  pintar();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.resp-fondo')?.remove(); });

// Barra lateral colapsable (se recuerda en este navegador).
(() => {
  const app = document.querySelector('.app'), brand = document.querySelector('.brand'); if (!app || !brand) return;
  const b = h('button', { type: 'button', class: 'side-toggle', 'aria-label': 'Ocultar o mostrar el menú', title: 'Ocultar o mostrar el menú' });
  const poner = (c) => { app.classList.toggle('colapsado', c); b.setAttribute('aria-expanded', String(!c)); b.innerHTML = icon(c ? 'chev-der' : 'chev-izq', 16); try { localStorage.setItem('estudio.menu', c ? '1' : '0'); } catch { /* sin almacenamiento */ } };
  b.onclick = () => { poner(!app.classList.contains('colapsado')); setTimeout(() => dispatchEvent(new Event('resize')), 240); };
  brand.append(b);
  let c = false; try { c = localStorage.getItem('estudio.menu') === '1'; } catch { /* sin almacenamiento */ }
  poner(c);
})();
