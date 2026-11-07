# Plan: traer funciones de FilmCraft al Estudio Marketographer

Plan escrito por Opus (2026-11-07) para que lo ejecuten Sonnet o Haiku.
**Reemplaza la Fase 3 de `PLAN-FILMCRAFT.md`** (el fork en Rust queda en pausa, solo como referencia).
La idea ahora es la contraria: el Estudio (esta app web) sigue siendo la base, con todo lo automático,
y le sumamos lo mejor de FilmCraft reescrito en JavaScript/Python, dentro del módulo Talking Head.

## Para Pablo, en simple
Se agregan 6 cosas, en este orden (de la más barata y útil a la más difícil):
1. **Exportar** en distintos tamaños y formatos (redes, YouTube, WhatsApp, ProRes, GIF, solo audio).
2. **Medidor de audio** que se mueve mientras suena el video, con el volumen recomendado para redes.
3. **Línea de tiempo** grande con pistas: textos, elementos, tu voz, cámara y sonidos. Arrastras, alargas,
   acortas, borras tramos y haces zoom.
4. **Panel de propiedades**: tocas algo en la línea de tiempo y a un lado ves todos sus ajustes.
5. **Filtros** (blanco y negro, cálido, frío, vívido...) para todo el video o solo un tramo.
6. **Gráficos esenciales**: plantillas listas (nombre y cargo, llamada con flecha, etiqueta, título de sección).

Lo automático de hoy (analizar, cortar pausas, títulos, subtítulos, zooms, sonidos) **no se toca**.
Cada fase termina con algo que puedes probar. Si una fase no te gusta, se para ahí.

---

## 0. Lo que ya sabemos (no lo vuelvas a investigar)

### Arquitectura del Estudio
- Servidor Node: `server/index.js`. Módulos en `modules/<id>/`. El que importa aquí es `modules/talking-head/`.
- `modules/talking-head/ui.js` (~2860 líneas): todo el editor. Función `mount(root, ctx)` (línea ~210).
  Estado global `S` (línea ~231). `plan()` devuelve `S.p.plan`. **Toda edición termina en `cambio()`**
  (línea ~247): guarda, redibuja la vista en vivo, la línea de tiempo y crea un paso de deshacer (Cmd+Z).
  Si tu cambio llama a `cambio()`, deshacer/rehacer ya funcionan solos.
- `modules/talking-head/live.js` (~1000 líneas): la vista en vivo. Dibuja cada cuadro en un `<canvas>` del navegador.
  `crearLive(...)` devuelve `{ el, video, redraw, antes, ir(t), alternar, destroy }` (línea ~986).
- `modules/talking-head/engine/render.py` (~1050 líneas): el **video exportado** se dibuja aquí, cuadro a cuadro en
  Python (PIL + OpenCV + numpy), y se codifica con ffmpeg (`common.encoder_args`, `common.ffmpeg_exe`).
- **Regla de oro:** todo lo que se ve en el video existe **dos veces**: en `live.js` (vista en vivo) y en
  `render.py`/`graficos.py` (exportación). Si cambias una, cambias la otra con las mismas fórmulas y constantes.
  Para no duplicar datos, las listas compartidas viven en un JSON del motor que leen los dos lados
  (patrón ya usado: `engine/combos.json`, servido en `GET /api/talking-head/combos`).
- Rutas del módulo: `modules/talking-head/server.js` con `route.get/post/put/delete('/ruta', ({ params, body, query }) => ...)`.
  Para devolver un archivo: `return { __file: ruta, type: 'video/mp4' }`. Limpiar nombres con `limpio()` (ya existe ahí).
  Lanzar el motor Python: `lanzar(id, ['accion', ...args])` (mira `/renderizar`, línea ~273).
- CLI del motor: `engine/cli.py`, `ap.add_argument("accion", choices=[...])`. Nueva acción = agregar a `choices` y a su `if`.
- Exportación extra ya existente: `engine/exportar.py` (`srt`, `transcripcion`, `formato` para recortar a 4:5/1:1).
- Marca: tokens en `web/shell.css` líneas 10-23 (`--accent: #fddc5b`, `--ink`, `--surface-200`, `--border`, `--neg`, `--ok`).
  Estilos del módulo en `modules/talking-head/ui.css`. Modo oscuro ya resuelto con esos tokens: **usa solo tokens, nunca colores sueltos**
  (excepción: colores de pistas, que ya existen en `.ltime`, líneas 198-203 y 365 de `ui.css`).

### Datos de un proyecto (`data/th/<id>/`)
- `plan.json`: `{ version, duration, fps, style, events[], zooms[], cortes{}, audio{}, cierre{}, lentos[], formato }`.
  - `events[]`: títulos (sin `kind`) `{id, start, end, text, pos, size, anim, color, sfx}`;
    elementos con `kind` = `frase | lista | conexion | numero | barras | punto | sticker | escena`.
    Definiciones de elementos en `ui.js` `const KINDS` (línea ~2283) y dibujo en `engine/graficos.py` (`preparar`, `dibujar`).
  - `zooms[]`: `{t, level}`. `lentos[]`: `{start, end, ...}`.
  - `cortes.borradas`: `[[a,b], ...]` tramos que **siempre** se quitan (los respetan `cuts.rangos_plan` línea 202 y
    `live.js` línea ~917). Las palabras dentro de un tramo borrado desaparecen solas de los subtítulos (`palabras_vivas`).
  - `audio.musica`: `{archivo, vol, duck, inicio, fundido}`.
- **Todos los tiempos del plan están en segundos del video original** (`source.mp4`), antes de cortes.
- `words.json`: `{words: [{w, start, end}, ...]}`. `envolvente.json`: `{hop: 0.01, db: [...]}` (volumen cada 10 ms;
  ruta `GET /api/talking-head/proyectos/:id/envolvente`).
- `final.mp4`: último video exportado (1080 de lado corto, `common.NOMINAL`).
- Proyecto de prueba con todo: `data/th/mvfnhi3hjdw` (tiene final.mp4, música, cortes y títulos).

### Qué tiene FilmCraft que copiamos (solo el comportamiento, no el código Rust)
- Presets de exportación: `filmcraft-fork/crates/export/src/presets.rs` (TikTok 10 Mbps, Reels 8 Mbps, Shorts 12 Mbps,
  todos normalizados a −14 LUFS; YouTube 1080p 16 Mbps; ProRes 422 HQ/422/LT/4444; GIF 640 px a 15 fps).
- Medidor: picos estéreo en dB, subida rápida, bajada de 20 dB/s, pico retenido; lectura M/S/I en LUFS y TP en dBTP
  (`crates/ui-egui/src/panels/meters.rs`).
- Línea de tiempo: pistas, arrastrar, recortar bordes, imán (snapping), zoom, borrar tramo con cierre del hueco.
- Panel de controles del efecto (inspector) para lo seleccionado.
**No hace falta abrir el fork.** Todo lo necesario está descrito en este plan.

---

## Reglas para ahorrar créditos (para el modelo que ejecute)
1. Una tarea por sesión. Lee solo lo que la tarea nombra. Usa `grep -n` antes de abrir un archivo; abre por rangos de líneas.
2. **Archivos nuevos para funciones nuevas** (`timeline.js`, `meter.js`, `inspector.js`, `engine/filtros.py`...).
   En `ui.js` solo se agregan las líneas para conectarlos. No reescribas funciones que funcionan.
3. Campos nuevos del plan siempre **opcionales**: si faltan, se usa el valor por defecto. Proyectos viejos deben abrir igual.
4. Comprobaciones mínimas después de cada tarea:
   - `node --check modules/talking-head/<archivo>.js` por cada JS tocado.
   - `.venv/bin/python -m py_compile modules/talking-head/engine/<archivo>.py` por cada Python tocado.
   - Abrir el Estudio con la vista previa (`preview_start` con nombre `estudio`, puerto 4177), entrar al proyecto de prueba
     y revisar que no haya errores en la consola (`read_console_messages`). Usa `read_page`/`find` antes que capturas;
     captura solo si la tarea es visual, con `scale 0.5`.
5. Si algo falla 2 veces seguidas con el mismo error, para y anótalo en la Bitácora. No sigas probando a ciegas.
6. Nunca toques `data/` sin copiarla antes a `data/respaldos/<fecha>/`. Nunca borres videos del usuario.
7. Al terminar cada tarea: 2-3 líneas en la **Bitácora** (al final) + un commit en la rama `filmcraft-funciones`
   con mensaje en español. No hagas push sin que Pablo lo pida.
8. Haiku hace las tareas **[H]**, Sonnet las **[S]**. Si Haiku no puede, que lo anote y pase a Sonnet.
9. Explícale a Pablo en español simple, sin jerga (no es programador).

---

## FASE 0 — Preparar (Haiku, 10 min)

### 0.1 [H] Guardar lo que hay y abrir rama
- En `marketographer-studio/`: hoy hay cambios sin guardar de la Fase 1 anterior (`cli.py`, `common.py`, `exportar.py`,
  `matte.py`, `render.py`) y `PLAN-FILMCRAFT.md` sin agregar. **Pregunta a Pablo** antes de hacer el commit
  "Motor más rápido: render y recorte en paralelo (fase 1)" con esos archivos y los dos planes.
- Luego `git switch -c filmcraft-funciones`.
- **Hecho cuando:** `git status` limpio y en la rama nueva.

---

## FASE 1 — Exportación en varios tamaños y formatos (1 día)

Idea: el video se sigue armando igual (`render.py` → `final.mp4`). Exportar con un preset es **una sola pasada de
ffmpeg** sobre `final.mp4`. Barato y sin riesgo para lo que ya funciona.

### 1.1 [H] Lista de presets en un JSON compartido
Crear `modules/talking-head/engine/presets_export.json`:
```json
{ "presets": [
  { "id": "redes",    "n": "Redes (TikTok, Reels, Shorts)", "uso": "Lo que más usas. Sonido parejo a −14 LUFS.", "codec": "h264", "corto": 1080, "mbps": 12, "lufs": -14, "ext": "mp4" },
  { "id": "youtube",  "n": "YouTube",            "uso": "Alta calidad para YouTube y web.",          "codec": "h264", "corto": 1080, "mbps": 16, "lufs": -14, "ext": "mp4" },
  { "id": "liviano",  "n": "Liviano (WhatsApp)", "uso": "Pesa poco, para mandar por chat.",          "codec": "h264", "corto": 720,  "mbps": 4,  "lufs": -14, "ext": "mp4" },
  { "id": "hevc",     "n": "HEVC (más chico)",   "uso": "Misma calidad, archivo más pequeño. iPhone y Mac.", "codec": "hevc", "corto": 1080, "mbps": 8, "lufs": null, "ext": "mp4" },
  { "id": "prores",   "n": "Máxima calidad (ProRes 422 HQ)", "uso": "Para seguir editando en otro programa. Pesa mucho.", "codec": "prores", "perfil": 3, "corto": 1080, "lufs": null, "ext": "mov" },
  { "id": "gif",      "n": "GIF",                "uso": "Animación corta sin sonido.",              "codec": "gif",  "corto": 480,  "fps": 15, "ext": "gif" },
  { "id": "wav",      "n": "Solo audio (WAV)",   "uso": "El sonido final sin comprimir.",           "codec": "wav",  "lufs": null, "ext": "wav" },
  { "id": "mp3",      "n": "Solo audio (MP3)",   "uso": "El sonido final, liviano.",                "codec": "mp3",  "lufs": -14, "ext": "mp3" }
] }
```
- `corto` = medida del lado más corto en píxeles (sirve para 9:16, 16:9, 1:1 y 4:5 por igual).
- **Hecho cuando:** `python3 -c "import json;json.load(open('modules/talking-head/engine/presets_export.json'))"` no da error.

### 1.2 [S] Función `exportar.preset` en Python
Archivo: `engine/exportar.py` (al final). Firma: `def preset(proj, pid, custom=None)`.
- Lee `presets_export.json` (ruta junto al archivo: `Path(__file__).with_name(...)`). Busca `pid`. Si `pid == "custom"`,
  usa el dict `custom` con las mismas claves (validar: `codec` en `h264|hevc|prores`, `corto` en `720|1080|1440|2160`,
  `fps` en `None|24|25|30|60`, `mbps` entre 1 y 80). Cualquier otro valor → `RuntimeError("Ajuste no válido")`.
- Requiere `final.mp4` (mismo mensaje de error que `formato()`).
- Salida: `proj / "export" / f"{nombre_limpio}-{pid}.{ext}"` (crear la carpeta). `nombre_limpio` desde `meta.json`
  `nombre`, solo letras/números/guiones.
- Construir los argumentos de ffmpeg:
  - Escala: si hay `corto`, `-vf scale=` que deja el lado corto en `corto` y el largo proporcional y **par**:
    `scale='if(gt(iw,ih),-2,{c})':'if(gt(iw,ih),{c},-2)':flags=lanczos`. Si `corto` es mayor que el lado corto
    del final, no ampliar (usar el tamaño del final) y anotarlo en el estado: "No se amplía: el video se armó en 1080".
  - `fps`: si viene, agregar `fps={fps}` al mismo `-vf`.
  - `h264`: `h264_videotoolbox -b:v {mbps}M -maxrate {1.5*mbps}M`, `-pix_fmt yuv420p`, `-movflags +faststart`;
    si no hay videotoolbox, `libx264 -crf 18 -preset medium -maxrate ...` (copia el patrón de `common.encoder_args`).
  - `hevc`: `hevc_videotoolbox -b:v {mbps}M -tag:v hvc1`. Si el encoder no existe (comprobar una vez con
    `ffmpeg -hide_banner -encoders` y buscar el nombre), `RuntimeError("Esta Mac no tiene HEVC por hardware")`.
  - `prores`: `-c:v prores_ks -profile:v {perfil} -pix_fmt yuv422p10le -c:a pcm_s24le` (prores_ks siempre viene en ffmpeg).
  - `gif`: dos pasadas con paleta: `-vf "fps=15,scale=...,split[a][b];[a]palettegen[p];[b][p]paletteuse" -an`.
  - `wav`: `-vn -c:a pcm_s24le -ar 48000`. `mp3`: `-vn -c:a libmp3lame -b:a 256k` (si no existe libmp3lame, `aac` en `.m4a`).
  - Audio en h264/hevc: `-c:a aac -b:a 320k -ar 48000`.
  - `lufs` no nulo: agregar `-af loudnorm=I={lufs}:TP=-1:LRA=11` (una pasada basta).
- Avisar progreso con `status(proj, "formato", 20, "Exportando para ...")` y al final `status(proj, "listo", 100, out.name)`
  (igual que `formato()`).
- Devolver la ruta de salida.
- **Prueba (assert) obligatoria:** en `if __name__ == "__main__":` no; mejor una función `_args_de(cfg, w, h)` pura que
  arma la lista de argumentos, y 3 asserts al final del archivo dentro de `def _prueba():` que se corre con
  `.venv/bin/python -c "import exportar; exportar._prueba()"` desde `engine/`: (a) redes en 1080x1920 da `scale` y `loudnorm`;
  (b) gif no lleva `-c:a`; (c) custom con `corto: 999` lanza error.
- **Hecho cuando:** los asserts pasan y exportar `redes` del proyecto de prueba crea un mp4 que reproduce.

### 1.3 [H] CLI y rutas
- `engine/cli.py`: agregar `"exportar"` a `choices`, y `ap.add_argument("--preset", default="redes")`,
  `ap.add_argument("--custom", default="")` (JSON en texto). Rama: `exportar.preset(carpeta, a.preset, json.loads(a.custom) if a.custom else None)`.
  Copia el estilo de la rama de `formato`.
- `server.js`, junto a `/renderizar`:
  - `route.get('/presets-export', ...)` → lee y devuelve `engine/presets_export.json` (como `/combos`, línea ~73).
  - `route.post('/proyectos/:id/exportar', ({ params, body }) => lanzar(params.id, ['exportar', '--preset', <id validado contra la lista o 'custom'>, ...(custom ? ['--custom', JSON.stringify(custom)] : [])]))`.
  - `route.get('/proyectos/:id/exportados', ...)` → lista de `export/` con `{ nombre, mb }`.
  - `route.get('/proyectos/:id/exportados/:archivo', ...)` → `{ __file, type }` con `limpio(params.archivo)`; tipo por extensión
    (`mp4 → video/mp4`, `mov → video/quicktime`, `gif → image/gif`, `wav → audio/wav`, `mp3 → audio/mpeg`).
- **Hecho cuando:** `curl -s localhost:4177/api/talking-head/presets-export` devuelve la lista.

### 1.4 [S] Ventana "Exportar" en la interfaz
Archivo nuevo: `modules/talking-head/exportar-ui.js` con `export function hojaExportar({ h, api, A, S, toast, lanzar, etqSalida })`
que devuelve los nodos del panel. En `ui.js`:
- Agregar `exportar: ['Exportar', 'Elige para dónde es el video. Se arma una vez y sale en todos los formatos que quieras.', () => hojaExportar(...)]` a `HOJAS` (línea ~893).
- El botón dorado "Exportar video" (líneas ~777 y ~741) sigue igual (arma `final.mp4`). Debajo, un botón `ghost`
  "Más formatos" que abre `abrirHoja('exportar')`. **No quitar el flujo actual.**
- Contenido del panel:
  1. Tarjetas de preset (mismo estilo que las tarjetas `pz` de pausas: `h('button', {class: 'pz'})`) con `n` y `uso`.
     Se pueden marcar **varias**.
  2. Plegable "Personalizado": resolución (720p / 1080p), cuadros por segundo (Igual al original / 24 / 25 / 30 / 60),
     formato (MP4 H.264 / MP4 HEVC / MOV ProRes), calidad (Alta 16 / Media 10 / Liviana 4 Mbps), casilla "Sonido parejo para redes (−14 LUFS)".
     Usa `seg(...)` (control segmentado que ya existe en ui.js) para cada opción.
  3. Botón dorado "Exportar N archivos". Si no hay `final.mp4` (`S.p.tieneFinal` falso), primero
     `lanzar('renderizar', {calidad:'final'}, true)` y, al terminar, los presets uno tras otro (esperar estado `listo`
     con el mismo sondeo que usa `lanzar`; mira `iniciarPoll`, línea ~600).
  4. Lista "Ya exportados" (de `/exportados`) con enlace de descarga (`<a download>`) y peso en MB.
- Recordar los presets marcados en `S.aj` (ajustes del navegador, `guardarAjustes`).
- **Hecho cuando:** Pablo marca Redes + GIF + MP3, pulsa exportar y descarga los 3.

### 1.5 [S] Volumen medido en el resultado
- En `exportar.py`, función `medir(path)`: `ffmpeg -i path -af ebur128=peak=true -f null -` y leer de stderr las líneas
  finales `I:` (LUFS) y `Peak:` (dBFS). Devolver `{lufs, pico}`. Guardarlo en `export/medidas.json` por archivo.
- La lista "Ya exportados" muestra "−14,1 LUFS · pico −1,2 dB". Si LUFS < −16 o > −12, nota amable:
  "Para redes conviene cerca de −14".
- **Hecho cuando:** el preset Redes muestra un valor entre −15 y −13.

### Puerta de la Fase 1
Pablo exporta un video en 3 formatos. ¿Le sirve? Seguir.

---

## FASE 2 — Medidor de audio en vivo (½ día)

### 2.1 [S] Un solo "master" en la mezcla en vivo
Archivo: `live.js`.
- Hoy cada sonido va directo a `ac.destination` (líneas ~851 y ~859). Crear, junto a donde nace `ac` (línea ~887),
  `master = ac.createGain(); master.connect(ac.destination)` y cambiar esos `connect(ac.destination)` por `connect(master)`.
- La música (`musEl`) hoy suena por fuera del grafo. Conectarla una sola vez con `ac.createMediaElementSource(musEl)` → `master`
  (guardar el nodo: `createMediaElementSource` solo se puede llamar una vez por elemento).
- Exponer en el objeto devuelto (línea ~986): `medidor: () => master && ac ? { ac, master } : null`.
- **Hecho cuando:** se oye todo igual que antes (voz, música, sonidos) y no hay errores en consola.

### 2.2 [S] Componente `meter.js`
Archivo nuevo `modules/talking-head/meter.js`: `export function crearMedidor({ h, fuente })` → `{ el, destroy }`.
`fuente()` devuelve `{ ac, master }` o `null` (aún no suena nada).
- Al tener fuente: `split = ac.createChannelSplitter(2)`, `master.connect(split)`, un `AnalyserNode` por canal (`fftSize 2048`).
- Ponderación K para el volumen percibido (LUFS): `master → highshelf (1681 Hz, +4 dB) → highpass (38 Hz, Q 0.5) → analyser K`.
- Cada cuadro (`requestAnimationFrame`, pausar si `!el.isConnected`):
  - Pico por canal: `max(|x|)` del bloque → `dB = 20*log10(pico)`. Barra: sube al instante, baja a **20 dB/s**.
    Pico retenido 1,5 s (rayita). Escala −60 a 0 dB, marcas en −6, −12, −18, −24, −36, −48.
  - Colores: verde (`--ok`) bajo −12, amarillo (`--accent`) de −12 a −3, rojo (`--neg`) sobre −3.
    Si toca −0,1 dB, punto rojo "saturó" arriba que se apaga al tocarlo.
  - LUFS: media de `x²` de la señal K en ventana de 400 ms (momentáneo) y de 3 s (corto).
    `LUFS = −0.691 + 10*log10(suma de las medias de los 2 canales)` (si solo hay 1 analyser K mono, usar `2 × media`).
    Texto: "Ahora −13,8 LUFS · Promedio −14,6". Debajo, gris: "Para redes: cerca de −14".
- Dibujo en un `<canvas>` de 44×220 px (dos barras) + el texto en HTML. Respetar `devicePixelRatio`.
- Respetar `prefers-reduced-motion`: igual se mueve (es información), pero sin animación de brillo.
- **Prueba (assert):** función pura `dbDe(pico)` y `lufsDe(ms)` exportadas; en un comentario al final el comando
  `node -e "import('./meter.js').then(m=>{console.assert(Math.abs(m.dbDe(0.5)+6.02)<0.01);console.assert(Math.abs(m.lufsDe(1)+0.691)<0.01)})"`; correrlo.
- **Hecho cuando:** con el video sonando las barras se mueven y en silencio bajan a −60.

### 2.3 [H] Ponerlo en pantalla
- `ui.js`, en `columnaVideo()` (línea ~745), solo cuando `S.tab === 'live'`: crear el medidor con
  `fuente: () => live && live.medidor && live.medidor()` y ponerlo al lado derecho del `.phone`
  (envolver `phone` y medidor en un `div` con clase `pantalla-y-medidor`, `display:flex; gap:8px`).
- Botón en `.vtools` (ícono de ondas, `title: 'Medidor de sonido'`) para mostrar/ocultar; recordar en `localStorage` `estudio.medidor`.
- Llamar `medidor.destroy()` donde se hace `live.destroy()`.
- CSS en `ui.css`. En pantallas < 900 px, el medidor va oculto.
- **Hecho cuando:** se ve junto al video, se oculta con el botón, y en modo oscuro se lee.

---

## FASE 3 — Línea de tiempo con pistas (2-3 días, la más importante)

Hoy existe una barra simple (`pintarLinea`, `ui.js` ~782, CSS `.ltime`). La reemplazamos por un componente nuevo,
**sin cambiar el formato del plan**: la línea de tiempo solo lee y edita campos que ya existen.

### Diseño (lo que verá Pablo)
```
 [−] [+] [Ajustar] [Imán ●]                                     00:12.40 / 01:03.00
 ┌ regla ──|0:00────|0:05────|0:10────|0:15──────────────────────────────────────┐
 │ Textos     [VECES]        [TALENTO]          [Frase animada.......]           │
 │ Elementos          [Lista 1-2-3......]   [sticker]                            │
 │ Voz        ▁▃▅▇▅▃▁ hola chicos hoy ▁▂▅▇▆▃ ▒▒▒(cortado)▒▒▒ ▃▅▇▅▃                │
 │ Cámara        ◆ zoom        ◆        [cámara lenta]                           │
 │ Sonido        ♪whoosh   ♪click     ════════ música ═══════════════            │
 └────────────────────────────────|cabezal───────────────────────────────────────┘
```
- Ocupa todo el ancho, debajo del video y los ajustes (nueva fila de `.ed`, `grid-column: 1 / -1`), ~230 px de alto.
- Plegable con un botón "Línea de tiempo" (recordar en `localStorage` `estudio.timeline`). Plegada, se ve la barra
  simple de hoy. En pantallas < 900 px solo la barra simple.
- Tramos cortados (`cortes.rangos` si `cortes.on`, más `cortes.borradas`): banda rayada roja a lo alto de todas las pistas
  (mismo estilo que `.m-corte`/`.m-borrada`).

### 3.1 [S] Componente de solo lectura
Archivo nuevo `modules/talking-head/timeline.js`:
```js
export function crearTimeline({ h, getPlan, getWords, getEnv, getVideo, onCambio, onSeleccion, onIr }) { ...; return { el, pintar, seleccionar, destroy }; }
```
- `getEnv()` devuelve `{hop, db}` (pedirla una vez desde `ui.js` con la ruta `/envolvente` y guardarla en `S.env`;
  mira cómo la carga `panelPausas`, línea ~1482).
- Estado interno: `pxs` (píxeles por segundo, entre 10 y 400; arranca en "Ajustar" = ancho visible / duración), `scroll`, `sel`.
- Dibujo **con divs absolutos** (como `.ltime` hoy) para bloques y con **un `<canvas>`** solo para la onda de la voz
  (una barra vertical por píxel con el máximo de `db` en ese tramo; −60 dB = 0 alto, 0 dB = alto completo).
- Pistas y qué muestran:
  - **Textos**: `events` sin `kind` y con `kind === 'frase'`. Etiqueta = texto sin `*`.
  - **Elementos**: el resto de `events` con `kind`. Etiqueta = nombre del tipo (de `KINDS` si lo recibes, si no el `kind`).
  - **Voz**: onda + palabras (`getWords()`) escritas encima **solo si** `pxs >= 80` (si no, no caben).
  - **Cámara**: `zooms` como rombos en `t`; `lentos` como bloques verdes.
  - **Sonido**: un ♪ pequeño en `start` de cada evento con `sfx` distinto de `none`; la música como barra larga desde
    `audio.musica.inicio` hasta el final, si hay `audio.musica.archivo`.
- Regla con marcas cada 1, 5 o 10 s según `pxs` y texto `m:ss`.
- Cabezal: una línea que se mueve con `requestAnimationFrame` leyendo `getVideo().currentTime`
  (reemplaza el `setInterval` de 80 ms `tlTimer`). Si el cabezal sale de la vista mientras reproduce, desplazar la vista.
- Clic en la regla o en un espacio vacío → `onIr(t)`. Arrastrar en la regla → mover el cabezal en vivo.
- Rueda/trackpad horizontal = desplazar. **Cmd/Ctrl + rueda** = zoom centrado en el ratón. Botones − / + / Ajustar.
- `pintar()` redibuja todo (se llama desde `cambio()`); no redibujar en cada cuadro, solo el cabezal.
- En `ui.js`: crear el componente en `columnaVideo()`/`pintar()` cuando `S.tab === 'live'`, y en `cambio()` cambiar
  `pintarLinea()` por `timeline ? timeline.pintar() : pintarLinea()`. `onIr: (t) => live && live.ir(t)`.
- **Hecho cuando:** en el proyecto de prueba se ven las 5 pistas, el cabezal sigue al video, el zoom funciona y no hay
  errores. Captura en claro y oscuro (`resize_window colorScheme`) a `scale 0.5`.

### 3.2 [S] Seleccionar, mover y alargar/acortar
En `timeline.js`:
- Clic en un bloque → `sel = { tipo: 'evento'|'zoom'|'lento', ref: <el objeto del plan> }`, borde de 2 px `--ink`,
  `onSeleccion(sel)` y `onIr(ref.start ?? ref.t)`.
- Arrastrar el cuerpo → mueve `start` y `end` juntos (o `t` en un zoom). Bordes (6 px a cada lado) → cambia solo
  `start` o solo `end`. Duración mínima 0,2 s. Siempre dentro de `[0, duration]`. Redondear a 2 decimales.
- Mientras arrastras, solo se mueve el div (rápido). Al soltar: escribir en el objeto del plan y llamar `onCambio()`
  **una vez** (así Cmd+Z deshace el arrastre completo, no cada píxel).
- Cursor: `grab` / `ew-resize` en bordes. Tooltip con el tiempo mientras arrastras ("0:12.40 → 0:13.10").
- Teclado con un bloque seleccionado: ← / → mueven 1 cuadro (1/fps), Shift = 10 cuadros; Supr/Retroceso lo borra
  del plan (`events.splice`, `zooms.splice` o `lentos.splice`) y `onCambio()`. Esc deselecciona.
  **Ojo:** `ui.js` ya usa flechas y espacio para el video. Solo interceptar cuando el foco está en la línea de tiempo
  (`el.tabIndex = 0` y escuchar `keydown` en `el`, con `e.stopPropagation()`).
- **Hecho cuando:** mover un título en la línea de tiempo cambia cuándo aparece en la vista en vivo, y Cmd+Z lo devuelve.

### 3.3 [S] Imán (snapping)
- Puntos de imán: cabezal, inicio y fin de cada palabra, bordes de los demás bloques, inicio/fin de tramos cortados.
- Al mover o recortar, si un borde queda a menos de 8 px de un punto, se pega. Línea vertical amarilla fina mientras pega.
- Botón "Imán" (encendido por defecto) y tecla **S** con foco en la línea de tiempo (como FilmCraft). Alt mientras arrastras = sin imán.
- Buscar el punto más cercano con búsqueda binaria sobre una lista ordenada (se arma en `pintar()`).
- **Prueba (assert):** función pura exportada `imanar(t, puntos, tolSeg)`; correr con `node -e` 3 casos (pega, no pega, lista vacía).
- **Hecho cuando:** al acercar un título al inicio de una palabra, se pega.

### 3.4 [S] Borrar y restaurar tramos de video (lo que en FilmCraft es "cortar y cerrar el hueco")
- En la pista **Voz**: arrastrar selecciona un tramo `[a, b]` (resaltado azul claro), con imán a palabras.
- Con un tramo seleccionado: botón flotante "Quitar este tramo" y tecla Supr → agrega `[a, b]` a `cortes.borradas`
  (crear la lista si falta, unir solapes; hay `unirR` en `ui.js` para eso: pásala por parámetro) y `onCambio()`.
  El video en vivo ya salta esos tramos y los subtítulos ya quitan esas palabras: **no hay que tocar el motor**.
- Clic en una banda rayada de `borradas` → botón "Restaurar" que la quita de la lista.
  Las bandas de `cortes.rangos` (pausas automáticas) muestran "Esto es una pausa que se corta sola. Ajústala en Recortar"
  con un botón que llama `irPaso('recorte')`.
- **Hecho cuando:** quitar un tramo en la línea de tiempo hace que la vista en vivo lo salte y el video exportado no lo tenga.

### 3.5 [H] Estilos y accesibilidad
- Todo en `ui.css` bajo `.tl-*`. Colores de pista: reutilizar los de `.ltime` (`--accent` textos, `#b78cff` elementos,
  `#3cd7ff` cámara, `--ok` lento). Radios 6 px. Fuente 11 px para etiquetas.
- `role="application"` y `aria-label="Línea de tiempo"` en el contenedor; cada bloque `role="button"` con `aria-label`
  ("Título VECES, de 9,76 a 10,76 segundos").
- **Hecho cuando:** se ve ordenado en claro y oscuro y nada se sale del ancho.

### 3.6 [S] (Opcional, preguntar a Pablo) Vista "sin lo cortado"
Interruptor "Ocultar lo cortado": la línea de tiempo se dibuja en tiempo del video final, sin los tramos quitados.
Necesita dos funciones `aFinal(t)` y `aOriginal(t)` a partir de la lista de tramos conservados (misma lógica que
`cuts.Mapa.fuera` en `engine/cuts.py`; léela antes). Todo se sigue guardando en tiempo original. Solo si Pablo lo pide.

### Puerta de la Fase 3
Pablo edita un video real solo con la línea de tiempo. ¿Le resulta cómodo? Anotar qué le falta.

---

## FASE 4 — Panel de propiedades (1 día)

Idea: no inventar controles. **Cada tipo ya tiene su editor** en `ui.js`; el panel solo los junta al lado de la línea de tiempo.

### 4.1 [S] Panel "Propiedades"
Archivo nuevo `modules/talking-head/inspector.js`: `export function cuerpoPropiedades(sel, ctx)` que devuelve nodos.
`ctx` trae las funciones ya existentes de `ui.js` que necesita: `h, seg, refrescar, filaTitulo, cuerpoFrase, cuerpoSticker,
cuerpoEscena, cuerpoEspecial, plan`.
- En `ui.js`: nueva entrada `propiedades` en `HOJAS`. `onSeleccion` de la línea de tiempo guarda `S.selTL = sel` y
  llama `abrirHoja('propiedades')` (si la hoja ya está abierta, solo `pintarPanel()`).
- Contenido según `sel.tipo`:
  - **Siempre arriba, sección "Tiempo"**: Inicio, Fin y Duración en campos numéricos (paso 0,01; mostrar `m:ss,cc`).
    Cambiar Duración mueve Fin. Validar `0 ≤ inicio < fin ≤ duration`.
  - **evento**: según `kind`: sin kind → `filaTitulo(ev)`; `frase` → `cuerpoFrase(ev)`; `sticker` → `cuerpoSticker(ev)`;
    `escena` → `cuerpoEscena(ev)`; resto → `cuerpoEspecial(ev)`. Antes de llamarlas, mira qué devuelven (`grep -n "function cuerpoFrase" -A 10 ui.js`).
  - **zoom**: "Momento" (t) y "Cuánto acerca" (`level`, deslizador 1,00-1,30).
  - **lento**: inicio/fin (ya arriba) y los campos que tenga el objeto (mirar `seccionLenta`, línea ~2321).
  - **tramo borrado**: texto + botón Restaurar (misma acción que 3.4).
  - Nada seleccionado: "Toca algo en la línea de tiempo para ver sus ajustes."
- **Hecho cuando:** seleccionar un título en la línea de tiempo abre sus ajustes y cambiarlos se ve en vivo.

### 4.2 [S] Opacidad (único campo nuevo de esta fase)
- Campo opcional `ev.opacidad` (0-1, por defecto 1) para cualquier evento. Deslizador "Opacidad" en la sección Tiempo.
- `live.js`: donde se dibuja cada evento se usa `globalAlpha` (líneas ~448 y ~463): multiplicar por `(ev.opacidad ?? 1)`.
  Buscar todos los sitios con `grep -n "globalAlpha" live.js` que dibujan eventos.
- `render.py` `draw_event` (línea ~957) y `graficos.dibujar` (línea ~193): multiplicar el alfa (`amul` en `blit`) por
  `float(e.get("opacidad", 1))`.
- **Prueba:** exportar 3 s (`--desde/--hasta`) con un título al 50 % y comparar a ojo contra la vista en vivo.
- **Hecho cuando:** se ve igual de transparente en vivo y exportado.

> **No incluido a propósito:** fotogramas clave (keyframes) por propiedad. Es la parte más cara de FilmCraft y
> obliga a reescribir la animación en los dos motores. Si Pablo la pide después, se planifica aparte.

---

## FASE 5 — Filtros (1 día)

### 5.1 [H] Lista de filtros compartida
Crear `engine/filtros.json`. Cada filtro es una cadena de operaciones de **filtro CSS** (las mismas que entiende el
`ctx.filter` del navegador), así la vista en vivo es gratis y Python copia las fórmulas:
```json
{ "filtros": [
  { "id": "bn",       "n": "Blanco y negro", "ops": [["grayscale", 1], ["contrast", 1.1]] },
  { "id": "sepia",    "n": "Sepia",          "ops": [["sepia", 0.8]] },
  { "id": "calido",   "n": "Cálido",         "ops": [["sepia", 0.25], ["saturate", 1.15], ["hue-rotate", -8]] },
  { "id": "frio",     "n": "Frío",           "ops": [["hue-rotate", 12], ["saturate", 0.9], ["brightness", 1.03]] },
  { "id": "vivido",   "n": "Vívido",         "ops": [["contrast", 1.15], ["saturate", 1.35]] },
  { "id": "apagado",  "n": "Apagado",        "ops": [["contrast", 0.9], ["saturate", 0.6], ["brightness", 1.05]] },
  { "id": "noche",    "n": "Noche",          "ops": [["brightness", 0.75], ["contrast", 1.2], ["saturate", 0.7], ["hue-rotate", 15]] },
  { "id": "desenfoque","n": "Desenfoque",    "ops": [["blur", 8]] }
] }
```
- Ruta `GET /api/talking-head/filtros` que devuelve el archivo (copiar `/combos`).

### 5.2 [S] Datos y fórmula de intensidad
- Campo opcional `plan.filtros = [{ id, filtro: 'bn', k: 1, start: null, end: null }]`. `start/end` nulos = todo el video.
- Intensidad `k` (0-1): cada parámetro va del neutro a su valor: `v' = neutro + (v − neutro) · k`.
  Neutros: grayscale 0, sepia 0, saturate 1, contrast 1, brightness 1, hue-rotate 0, blur 0.
- `blur` está en px para un video de 1080 de ancho: usar `px · W / 1080` en los dos motores.
- Si se solapan dos filtros, se aplican en el orden de la lista.
- Bordes suaves: en los 0,25 s de entrada y salida de un filtro con `start/end`, `k` sube/baja linealmente.
  Función única `kEn(f, t)` igual en JS y Python.

### 5.3 [S] Vista en vivo
- `live.js` línea ~657-663: después de las `partes` del look, agregar las operaciones de los filtros activos en `t`
  como texto CSS: `grayscale(0.8) hue-rotate(-8deg) blur(3px)` (ojo: `hue-rotate` lleva `deg` y `blur` lleva `px`).
- La lista de filtros llega por parámetro a `crearLive` (`getFiltros`), cargada en `ui.js` desde `/filtros`.
- Si `filtroOk` es falso (Safari viejo), no se ven en vivo: está bien, ya pasa con el look.

### 5.4 [S] Exportación (Python)
Archivo nuevo `engine/filtros.py` con `def aplicar(frame_bgr, plan, t, W)` → frame. Lee `filtros.json` una sola vez.
- Trabajar en float32 0-1, **convirtiendo BGR → RGB** antes y RGB → BGR al final. **Recortar a [0,1] después de cada operación**
  (el navegador hace lo mismo).
- Fórmulas (especificación W3C *Filter Effects*, filas = R', G', B'):
  - `brightness(b)`: `x · b`. `contrast(c)`: `(x − 0.5) · c + 0.5`. `blur(px)`: `cv2.GaussianBlur(f, (0,0), sigmaX=px)`.
  - `grayscale(a)`, con `s = 1 − a`:
    `[[.2126+.7874s, .7152−.7152s, .0722−.0722s], [.2126−.2126s, .7152+.2848s, .0722−.0722s], [.2126−.2126s, .7152−.7152s, .0722+.9278s]]`
  - `sepia(a)`, con `s = 1 − a`:
    `[[.393+.607s, .769−.769s, .189−.189s], [.349−.349s, .686+.314s, .168−.168s], [.272−.272s, .534−.534s, .131+.869s]]`
  - `saturate(s)`:
    `[[.213+.787s, .715−.715s, .072−.072s], [.213−.213s, .715+.285s, .072−.072s], [.213−.213s, .715−.715s, .072+.928s]]`
  - `hue-rotate(θ)` con `c = cos θ`, `n = sin θ` (θ en radianes):
    `[[.213+.787c−.213n, .715−.715c−.715n, .072−.072c+.928n], [.213−.213c+.143n, .715+.285c+.140n, .072−.072c−.283n], [.213−.213c−.787n, .715−.715c+.715n, .072+.928c+.072n]]`
  - Matriz: `f = np.clip(f @ M.T, 0, 1)`.
- Atajo de velocidad: si no hay ningún filtro activo en `t`, devolver el cuadro sin tocar (lo normal).
- En `render.py`, en el bucle de cuadros, justo después de aplicar el look (busca dónde se llama la `apply` que devuelve
  `make_look`) y antes de dibujar textos: `frame = filtros.aplicar(frame, plan, t, W)`. Los textos no se filtran.
- **Prueba (assert):** `_prueba()` en `filtros.py`: `grayscale(1)` de un píxel rojo puro da R=G=B=0.2126; `saturate(1)` y
  `hue-rotate(0)` no cambian el píxel; correr con `.venv/bin/python -c "import filtros; filtros._prueba()"` desde `engine/`.
- **Hecho cuando:** un tramo en blanco y negro se ve igual en vivo y exportado (exportar 4 s con `--desde/--hasta`).

### 5.5 [S] Interfaz de filtros
- Nueva tarjeta `filtros` en `datosTarjetas()` y en el paso `imagen` de `PASOS` (junto a `look`), con su `HOJAS`:
  "Filtros: para todo el video o solo un tramo."
- Panel: cuadrícula de miniaturas (un cuadro del video actual dibujado en un canvas de 90×160 con ese `ctx.filter`),
  nombre debajo. Tocar una = agregar el filtro a todo el video. Deslizador "Intensidad". Botón "Solo desde aquí 3 s"
  que pone `start = t actual`, `end = t + 3`.
- Pista **Filtros** en la línea de tiempo (entre Cámara y Sonido), con los filtros que tienen `start/end`, editables
  igual que los demás bloques (`sel.tipo = 'filtro'`), y su caso en el panel de propiedades (filtro + intensidad).
- **Hecho cuando:** Pablo pone "Cálido" en todo el video y "Blanco y negro" en un tramo de 3 s y los mueve en la línea de tiempo.

---

## FASE 6 — Gráficos esenciales (2 días, uno por tarea)

Plantillas nuevas como **nuevos `kind` de elemento**, siguiendo exactamente el patrón de los que ya existen
(`lista`, `numero`, `barras`...). Antes de la primera, leer cómo está hecho uno completo y copiarlo:
`grep -n "numero" modules/talking-head/ui.js modules/talking-head/live.js modules/talking-head/engine/graficos.py`.

Cada plantilla tiene: campos de texto, color de acento (`--accent` por defecto), posición (`y`), animación de entrada y
salida (reusar `anim`/`salida` y `SALIDAS` que ya existen), y sonido por tipo (`TIPOS_SFX`, línea ~1207).
Tipografía: Poppins Bold/ExtraBold (ya en `engine/fonts/`).

| Orden | `kind` | Nombre en pantalla | Campos | Cómo se ve |
|---|---|---|---|---|
| 6.1 | `rotulo` | Nombre y cargo | `texto` (nombre), `texto2` (cargo) | Barra de acento de 6 px a la izquierda, nombre grande, cargo más chico debajo, caja oscura al 70 %. Entra deslizando desde la izquierda. Abajo a la izquierda (`y = 0.78`). |
| 6.2 | `llamada` | Llamada con flecha | `texto`, `x`, `y` del punto | Píldora con texto y una línea que apunta al punto. Útil para señalar algo. |
| 6.3 | `etiqueta` | Etiqueta | `texto` | Píldora de acento con texto oscuro (`--accent-ink`), tipo "NUEVO" o "TIP". Entra con rebote corto. |
| 6.4 | `seccion` | Título de sección | `texto`, `texto2` (número opcional, "01") | Número grande de acento + título, centrado, fondo oscurecido 40 %. Para separar partes de un video largo. |

Por cada plantilla (una tarea [S] cada una):
1. `ui.js` `KINDS`: entrada con nombre, ejemplo de texto y campos.
2. `live.js`: preparar y dibujar (mismo lugar donde se dibujan los otros kinds).
3. `graficos.py`: `preparar` y `dibujar` con las mismas medidas (todas relativas a `W` y `H`, nunca píxeles fijos).
4. Sección "Gráficos" en el panel `elementos` (`panelElementos`, línea ~2292) con una miniatura por plantilla.
5. Agregar el `kind` a `TIPOS_SFX`.
- **Hecho cuando** (cada una): se agrega desde el panel, se mueve en la línea de tiempo, se edita en propiedades y se
  ve igual en vivo y exportado (exportar 3 s y comparar a ojo).

---

## Qué NO se hace (y por qué)
- **Varias tomas / B-roll en pistas de video:** el motor hoy arma un solo video de origen. Agregar clips extra obliga a
  decodificar varios videos en `render.py`. Es el siguiente paso natural si Pablo lo pide; plan aparte.
- **4K real:** el video se arma a 1080. Exportar "4K" solo agrandaría la imagen sin más detalle. Se puede después
  subiendo `common.NOMINAL`, pero el armado tardaría ~4 veces más.
- **Fotogramas clave**, **cuchilla sobre clips**, **mezclador por pistas**: dependen de tener varios clips; mismo motivo.
- **Portar código Rust de FilmCraft:** no. Solo copiamos cómo se comporta.

---

## Cómo se prueba todo (copiar y pegar)
```bash
cd ~/Documents/Claude\ Code/marketographer-studio
node --check modules/talking-head/ui.js && node --check modules/talking-head/live.js
.venv/bin/python -m py_compile modules/talking-head/engine/render.py modules/talking-head/engine/exportar.py
# exportar solo 4 segundos para comparar con la vista en vivo:
cd modules/talking-head/engine && ../../../.venv/bin/python cli.py render ../../../data/th/mvfnhi3hjdw --calidad borrador --desde 10 --hasta 14
```
(El video corto queda en `data/th/mvfnhi3hjdw/preview.mp4`. Verifica antes con `grep -n "preview.mp4" render.py`.)

---

## Bitácora (anota aquí al terminar cada tarea)

| Fecha | Tarea | Resultado (números, problemas) |
|---|---|---|
| 2026-11-07 | 0.1 | Rama `filmcraft-funciones` creada. **No se hizo el commit de la Fase 1 vieja** (pendiente de Pablo): esos cambios siguen sin guardar en `render.py`, `cli.py`, `common.py`, `matte.py` y `exportar.py`. Por eso tampoco se hizo commit de la Fase 1 nueva (comparte `exportar.py` y `cli.py`). |
| 2026-11-07 | 1.1-1.5 | Exportación por presets hecha y probada en el navegador con el proyecto `2026-10-19-15-26-09` (carpeta `export/` creada ahí). Archivos: `engine/presets_export.json`, `exportar.py` (`preset`, `medir`, `_args_de`, `_prueba`), `exportar-ui.js`, rutas en `server.js`, acción `exportar` en `cli.py`, panel `exportar` + botón "Más formatos" en `ui.js`. Medido: Redes −15,0 LUFS (objetivo −14, una sola pasada de loudnorm queda ~1 LU abajo), MP3 −15,0. Cambios sobre el plan: GIF limitado a 15 s y 360 px a 12 fps (el completo pesaba 175 MB; ahora ~21 MB); el mensaje final de estado es `export/<archivo>` para que la interfaz no lo confunda con un render; la lista blanca de `/m/` en `server/index.js` ahora permite `exportar-ui.js`, `meter.js`, `timeline.js`, `inspector.js`. Límite: si no hay `final.mp4` el panel avisa y ofrece armarlo, pero no encadena solo. HEVC y ProRes no se probaron. |
| 2026-11-07 | 2.1-2.3 | Medidor hecho, **sin probar en pantalla** (no se pudo abrir la vista previa). `live.js`: nodo `master` (voz, sonidos y música pasan por él; la música entra con `createMediaElementSource`) y `medidor()` en el objeto devuelto. `meter.js` nuevo (`crearMedidor`, `dbDe`, `lufsDe`; assert de la fórmula pasó). `ui.js`: medidor junto al video en la pestaña en vivo + botón de ondas que lo oculta (`localStorage estudio.medidor`). CSS en `ui.css`, oculto bajo 900 px. Pendiente: abrir el estudio, dar play y ver que las barras se mueven y que el sonido suena igual que antes. |
| 2026-11-07 | 3.1-3.5 | Línea de tiempo hecha y probada en el navegador (proyecto `2026-10-19 15-26-09`, 0 errores en consola). `timeline.js` nuevo (`crearTimeline`, `imanar` con assert OK). 5 pistas, onda de voz, palabras al acercar (≥80 px/s), zoom con −/+/Ajustar y Cmd+rueda, cabezal que sigue al video. Mover/alargar bloques y rombos con imán (Alt = sin imán, tecla S), Supr borra, flechas mueven 1 cuadro, Cmd+Z deshace el arrastre completo. Pista Voz: arrastrar elige un tramo → "Quitar este tramo" lo agrega a `cortes.borradas`; clic en banda → Restaurar; pausas automáticas → "Ajustar en Recortar". Cambios: clases con prefijo `lt-` (`tl-` ya existía en el panel de pausas); la línea queda pegada abajo de la pantalla (sticky) y reemplaza la barra simple `.ltime` cuando está abierta; solo en pantallas ≥ 900 px. No probado: modo oscuro, el video exportado sin el tramo quitado (3.4 "Hecho cuando"), 3.6 (vista sin lo cortado, opcional). |
| 2026-11-07 | 4.1-4.2 | Panel Propiedades y opacidad hechos y probados (proyecto `2026-10-19 15-26-09` = `data/th/mvfnhi3hjdw`). `inspector.js` nuevo; hoja `propiedades` en `ui.js` que se abre sola al elegir algo en la línea de tiempo (no le roba el foco, así Supr/flechas siguen funcionando). Reutiliza `filaTitulo`, `cuerpoFrase`, `cuerpoSticker`, `cuerpoEscena`, `cuerpoEspecial`; zoom (momento + cuánto acerca), cámara lenta, tramo quitado (Restaurar), pausa automática. Sección Tiempo con Inicio/Fin/Duración. Opacidad: `ev.opacidad` (0-1) para todos menos stickers (ya tienen `op`). En vivo se multiplica `globalAlpha` interceptándolo (`conOp` en `live.js`); exportado con `con_opacidad` en `render.py` (mezcla antes/después). Prueba: título al 40 % se ve igual de transparente en vivo y en un render de 1 s. Efectos de prueba: se quitó la opacidad de `plan.json` al terminar; `preview.mp4` de ese proyecto fue reemplazado por el render de prueba de 1 s (se regenera). `conOp` no se usa en los elementos de tipo `punto` (no se dibujan con opacidad). |
| 2026-11-07 | 5.1-5.5 | Filtros hechos y probados (proyecto `mvfnhi3hjdw`). `engine/filtros.json` (8 filtros) + ruta `/filtros`; `engine/filtros.py` (`k_en`, `ops_activas`, `aplicar`, `_prueba()` OK) enganchado en `render.py` justo después del look y antes de zoom/textos; `live.js` agrega las mismas operaciones al `ctx.filter` (`filtrosCss`, parámetro `getFiltros`). UI: tarjeta "Filtros" en el paso 4 (cuadrícula de miniaturas con un cuadro del video, intensidad, "Solo desde aquí 3 s", quitar), pista "Filtros" en la línea de tiempo (naranja) y caso `filtro` en Propiedades. Prueba: Cálido en todo el video + Blanco y negro de 10 a 13 s; en vivo y en un render de 2 s (10-12 s) el cuadro del segundo 11 salió en blanco y negro con los textos sin filtrar. Limpieza: se quitaron los filtros de prueba de `plan.json`; `preview.mp4` de ese proyecto otra vez es un render de prueba corto. Límites: el desenfoque (`blur`) no se probó a mano; las miniaturas usan un cuadro del video actual (si aún no carga, salen grises); el paso "filtros" no sale en proyectos de solo voz salvo en 'imagen'. |
| 2026-11-07 | 6.1-6.4 | Gráficos esenciales hechos y probados (proyecto `mvfnhi3hjdw`): `rotulo` (Nombre y cargo), `llamada` (Llamada con flecha), `etiqueta`, `seccion` (Título de sección). Nuevos `kind` con el mismo patrón que `lista`/`numero`: `KINDS` en `ui.js` (aparecen solos en el selector "Tipo" de la tarjeta Elementos, **no hice la sección "Gráficos" con miniaturas aparte**), `dibujarNuevo` en `live.js`, `_preparar_nuevo`/`_dibujar_nuevo` en `graficos.py` con las mismas medidas relativas a W y H; se editan con el editor de elementos de siempre (texto por líneas: 1ª = título/nombre, 2ª = cargo/número) y la llamada suma un deslizador del punto "a lo ancho"; sonido por tipo en `TIPOS_SFX`; excluidos del anti-solape de títulos en los dos motores. Prueba: se agregaron los 4 desde la interfaz, se ven en la línea de tiempo y en un render de 15 s salen igual que en vivo (rótulo abajo-izq., píldoras, sección con fondo oscurecido). Detalle: el texto sale con el mismo formato de mayúsculas que los títulos del proyecto (`titulosCaso`). Además: `cli.py` ahora resuelve la ruta del proyecto a absoluta (con ruta relativa el render en paralelo fallaba al unir tramos). Limpieza: eventos de prueba quitados del `plan.json`. No probado: tamaños XL con textos largos (el ancho de las cajas se mide igual en ambos motores, pero solo vi texto corto), rótulo sin cargo, sección sin número. |
| 2026-11-07 | Revisión final | Todos los `.js` pasan `node --check`; asserts de `meter.js`, `timeline.js`, `filtros.py` y `exportar.py` OK; git limpio. Exportación HEVC (1080x1920, hvc1, AAC) y ProRes 422 HQ (yuv422p10, PCM 24 bit) probadas con el motor: salen bien (ProRes pesa ~1,5 GB para este video de 2 min 52 s; los archivos de prueba se borraron). Línea de tiempo: flechas (Shift = 10 cuadros), Supr y Cmd+Z probados; modo oscuro se lee bien. Sin probar a mano: Restaurar un tramo quitado, la tecla S del imán, el Desenfoque, textos largos en los gráficos, y el modo oscuro con el medidor en pantalla angosta. `export/medidas.json` del proyecto de prueba conserva anotaciones de los archivos borrados (inofensivo). Redes sigue midiendo −15 LUFS en vez de −14 (loudnorm de una pasada). |
| 2026-11-07 | Velocidad + pruebas de errores | **Exportar** (proyecto `mvfnhi3hjdw`, 62 s de video final, copia en scratchpad): **49 s → 34 s** (antes de todo: 85 s). Hallazgo con medición por etapas: en este proyecto el fondo de bordes (`fondoModo: bordes`) gastaba 47 ms por cuadro mezclando en float a pantalla completa; ahora usa `cv2.blendLinear` con pesos calculados una vez (8,3 s → 4,7 s para 90 cuadros en un proceso); además se salta la mezcla persona/fondo cuando no hay desenfoque ni textos detrás (`layer is f`) y la máscara del bloom se suaviza a media resolución. SSIM contra la versión anterior 0,995-0,997 (mismo nivel que re-codificar). Queda: bloom ≈ 19 ms/cuadro (~13 reescalados), y las ganancias por más procesos se acaban en ~4 (6 núcleos rápidos + 2 lentos). **Importar** (recorte de persona, clip de 30 s): **37 s → 20 s**: el modelo ahora corre en un cuadro de cada dos y el intermedio es el promedio de sus vecinos (SSIM 0,995 contra el recorte completo; mismos 902 cuadros; probado con 8 cortes de tramo, pares e impares, y con un solo proceso). Transcripción: 9,6 s por 30 s de video (0,3×, ya en modo rápido), proxy 2 s. **Pruebas de errores:** rutas del servidor (traversal, ids inválidos, preset falso, ajuste personalizado inválido → "Ajuste no válido") rechazan bien (devuelven 500/404, no 400: es solo estético); render con filtros inexistentes, intensidad 0/2/−1, tramos al revés, opacidad "abc"/0/5, gráficos nuevos sin texto, con texto larguísimo y con coordenadas fuera de pantalla → no se rompe; opacidad inválida ahora vale 1 en Python y JS. Línea de tiempo en un video de 7 min con 285 bloques: sin errores; corregido: el mínimo de zoom (10 px/s) impedía "Ajustar" en videos largos (ahora 1 px/s) y la regla marca cada 30 s si hace falta. Pendiente / ideas grandes: ver respuesta a Pablo. |
| 2026-11-07 | Revisión de capas, solapes y legibilidad | Se renderizó un caso difícil (título arriba + título abajo + subtítulos + rótulo + etiqueta + llamada a la vez). Problemas hallados y arreglados en los dos motores: (1) la etiqueta (y=0,20) se pintaba encima del título "arriba" (0,17); (2) rótulo y etiqueta no entraban al anti-solape y podían chocar con los subtítulos; (3) texto oscuro fijo sobre el acento: ilegible si el acento es oscuro (ahora el texto de píldoras es oscuro o blanco según la luminosidad del acento y un acento muy oscuro no se usa como texto del cargo/número); (4) el velo de una sección podía quedar sobre otros elementos según el orden (ahora se dibuja primero). Ahora rótulo y etiqueta se apartan de subtítulos, otros elementos, títulos "detrás/arriba" y de la píldora de una llamada (en el caso difícil la etiqueta pasó abajo del rótulo; en vivo se comprobó con título + etiqueta + rótulo). Sin cambiar: la llamada pone su píldora sobre la cara por defecto (depende de a qué punto apunte; se mueve con altura y posición), el rótulo (y=0,78) toca la zona de texto de TikTok abajo (usa la "Zona segura" para verlo), y las animaciones de salida de las plantillas nuevas son solo desvanecido. Proyecto de prueba: elementos agregados y deshechos (0 quedaron). |
| 2026-11-07 | Más velocidad (ronda 3) | Bloom a 1/8 de resolución (PSNR 60 dB, diferencia máxima 2 de 255 contra 1/4): 17,6 → 12,1 ms por cuadro. Exportar el video de 62 s: 34 s → **29,7 s** (2,1× tiempo real; el original tardaba 85 s). **Probado y descartado (sin ganancia):** decodificación por hardware (el decode ya cuesta 1,8 ms/cuadro), un solo hilo de OpenCV por proceso, 8 procesos en vez de 6, tabla de colores por canal (−1 ms), recorte con menos resolución (768/640: solo −1 s en 4 y SSIM baja a 0,97-0,98). OpenCL en la GPU de la Mac (M1 Pro) funciona en OpenCV y las operaciones de mezcla pasan de ~1,5 ms a ~0,1 ms, pero subir y bajar cada cuadro cuesta ~1,4 ms y el dibujo usa arreglos numpy en todo el código: llevar todo el dibujo a la GPU sería reescribir `render.py`/`graficos.py` (estimado 30 % más rápido, riesgo alto de diferencias entre vista en vivo y exportado). Conclusión: **convertir el Estudio en app instalable no lo acelera** (el cuello de botella es dibujar cuadros en la CPU, no el navegador); lo que acelera de verdad es dibujar en la GPU (reescribir el motor en Rust/Metal o mover el motor al fork de FilmCraft). El recorte (importar) con 6 procesos: 22 s por 30 s de video. |
| 2026-11-07 | Instalable en local + GitHub | El Estudio ya corre 100 % en la Mac (servidor en localhost, motor Python local); abrirlo en el navegador no frena nada: la vista en vivo va a 68 cuadros por segundo (peor cuadro 32 ms) en un video de 1080x1920. Se agregó `instalar.sh` (un comando: revisa git/node/python, baja el código, `npm install`, crea `.venv`, instala el motor, baja los modelos y crea `Estudio Marketographer.app` en Aplicaciones apuntando a `~/EstudioMarketographer`; volver a correrlo actualiza sin tocar `data/`). Probado: instalación completa desde GitHub (`main`) en una carpeta nueva, código de salida 0, motor importa bien, servidor responde. Se subió `main` a https://github.com/themarketographer/marketographer-studio (avance directo + fusión del PR #1 que ya estaba: quita dependencias npm sin uso y saca `rvm.onnx` de git; el modelo se descarga solo). README con el comando. Sin firmar ni notarizar la app (la primera vez macOS puede pedir "Abrir de todos modos"). |
| 2026-11-07 | Dibujo en la GPU (Metal vía MLX) | Nuevo `engine/gpu.py`: cuatro kernels Metal fusionados hacen en la GPU lo que antes hacía la CPU entre el look y la viñeta (zoom, contraste/saturación, filtros de color, brillo de película con su silueta, fondo desenfocado por bordes/siempre/títulos, mezcla contigo, corrección de película, grano y viñeta). El brillo pequeño (1/8) y el desenfoque pequeño siguen en CPU (cuestan ~1 ms); textos y subtítulos también. Los textos "detrás de ti" bajan la capa, se dibujan y vuelve a subir. **Respaldo por cuadro a la CPU** si hay estela de movimiento, zoom en blanco y negro, filtro de desenfoque, medidas no divisibles por 8 y 6, o si no hay MLX/Metal; `ESTUDIO_CPU=1` fuerza la CPU. Igualdad contra la CPU (PSNR, 4 s de video): 44,9-49,8 dB en 12 combinaciones de ajustes (fondos, película con/sin grano y halación, color, viñeta, filtros, zoom b/n); las que caen a CPU dan idéntico. **Velocidad:** video de 62 s: CPU 26-30 s → **GPU ~18 s** (85 s al inicio). Un cuadro en un proceso: ~25 ms; con varios procesos el tope ahora es el codificador de hardware de la Mac (~170-185 cuadros/s medidos con ffmpeg aparte; el Estudio llega a ~150). Probado y descartado: tramos más cortos que procesos con cola (más lento: cada proceso nuevo cuesta ~1 s). Además: el audio se arma mientras se dibujan los cuadros. `requirements.txt` incluye `mlx` solo para Mac con Apple Silicon. |
| 2026-11-07 | GPU ronda 2: estela, blanco y negro y cualquier medida | La GPU ahora también hace la estela de movimiento (solo fondo o todo, `zoom` o `siempre`) y el zoom en blanco y negro (kernel `estudio_m`), que usan casi todos los proyectos (movimiento 0,05-0,8). Todas las reducciones usan promedio por área exacto y las proporciones reales, así que ya no hace falta que el video mida múltiplo de 8 y 6: probados 4:5 (1080x1350), 1:1 y 16:9. Igualdad contra la CPU (PSNR): 46,9-48,9 dB en estela siempre / solo al zoom / sobre todo, zoom b/n y los tres formatos; el filtro Desenfoque sigue cayendo a CPU (idéntico). Con estela siempre + fondo siempre, 20 s de video: CPU 10,8 s → GPU 5,4 s (2×). **Importar, probado y descartado:** transcribir y recortar a la vez (32 s contra 26,6 s uno tras otro: se pelean por los núcleos), Whisper por lotes (sin ganancia: 4,1 s por 30 s), CoreML para el recorte (54 ms contra 53 ms en CPU: no corre en GPU), recorte con menor detalle `ratio` 0,3 (1,4× más rápido pero SSIM 0,98: se pierde pelo; no se aplicó). El recorte de persona (~15 s por 30 s de video) sigue siendo lo más lento al importar; para bajarlo hace falta portar el modelo a la GPU (MLX/Metal), trabajo aparte. |
| 2026-11-07 | Recorte de persona en la GPU (MLX): resultado | Se portó el modelo a MLX (`engine/matte_gpu.py`, intérprete del ONNX con tensores NHWC; 305 operaciones, pesos 3,7 M). **Correcto:** la máscara es igual a la de onnxruntime (diferencia media < 1e-5 en 30 cuadros seguidos, con los estados recurrentes). **Pero no es más rápido:** 34 ms por cuadro en la GPU (28 ms compilado) contra 56 ms de la CPU con 8 hilos en un solo proceso y ~19 ms efectivos con los 6 procesos paralelos que ya usa el Estudio. Probado: lotes de 1 a 12 cuadros (30 ms por cuadro siempre: el cálculo escala lineal, así que no es latencia de lanzar operaciones), fp16 (igual) y `mx.compile` (−17 %). No se conectó a `matte.py`; el recorte sigue en CPU. Quedaría un trabajo híbrido (5 procesos de CPU + 1 de GPU, estimado 1,4× más rápido, ~3 s menos en 30 s de video) que no vale la complejidad por ahora. |
| 2026-11-07 | B-roll (varias tomas) + tiempo restante | **Revisión de FilmCraft** (`filmcraft-fork`): no tiene recorte de persona ni IA de video (su "AI features" está en ~25 %), su Whisper corre en CPU (candle), y exporta con el mismo codificador de hardware de la Mac: medí que ese codificador tiene un tope de ~170-185 cuadros/s sin importar el formato de entrada (BGR, NV12 o I420 dan lo mismo), así que nuestra exportación (~150 cuadros/s) ya está cerca del techo que tendría FilmCraft. Ideas útiles que sí copié: (1) el **tiempo que falta** (`pace.rs`: velocidad de los últimos 15 s, no el promedio): ahora las barras de progreso dicen "faltan ~20 s" / "casi listo" (`tiempoRestante` en `ui.js`, probado con lecturas simuladas); (2) su aviso de que un solo renderizador de GPU compartido con candado hacía esperar a todos coincide con lo que medimos (por eso cada proceso nuestro tiene su propia GPU en cola). **B-roll** (lo que quedaba en "qué NO se hace"): nuevo `kind: clip` con videos o imágenes extra sobre el tuyo. Servidor: carpeta `data/broll` y rutas `/broll` (listar, subir, bajar con Range, borrar). Interfaz: tarjeta "B-roll" en Elementos (subir y agregar con un clic; el largo se toma del video, máx. 4 s), editor del clip (archivo, pantalla completa o ventana, segundo del clip donde empieza, tamaño y posición de la ventana) en Todas mis capas, Propiedades y bloque rosa en la línea de tiempo. En vivo: `live.js` usa un `<video>` oculto por clip, sincronizado con el tuyo (corrige si se desvía >0,3 s, pausa los que no se ven). Exportado: `graficos._dibujar_clip` lee el clip cuadro a cuadro con OpenCV (busca solo si hay salto), pantalla completa con recorte centrado o ventana con esquinas redondeadas, entrada y salida de 0,2 s; lo que cubre la pantalla se dibuja debajo de títulos y subtítulos. Prueba en el proyecto `mvfnhi3hjdw`: agregado desde la interfaz, visible en vivo (lo comprobé por color de un píxel antes, durante, después y reproduciendo) y en el render (GPU y CPU iguales, PSNR 50 dB), modo ventana también. Límites: el sonido del B-roll no se usa; si hay cortes de pausa dentro del clip, el tiempo del clip avanza en el video exportado por tiempo final y en vivo por tiempo original (difieren solo en esos casos); sin arrastrar la ventana sobre el video todavía. Limpieza: se quitó el clip de prueba del `plan.json` y el archivo de `data/broll`. |
| 2026-11-07 | B-roll: sonido y arrastrar | El clip tiene "Sonido del clip" (0-1, por defecto sin sonido). En vivo el `<video>` oculto se desmuta con ese volumen; al exportar `audio_final` saca el audio del clip con ffmpeg (desde el segundo `desde`, el largo del bloque), con entrada y salida de 0,15 s, y lo suma a la mezcla en el instante final del bloque. Probado con un clip de tono de 440 Hz: la energía en 440 Hz sube de ~0,02 a 0,04-0,07 en los 3 segundos del bloque. La ventana del B-roll se puede arrastrar sobre el video en vivo (como los stickers). Límite: el audio del clip no baja la voz (no hay "ducking"), y si hay cortes dentro del bloque el audio del clip corre continuo mientras la imagen salta cuadros. |
