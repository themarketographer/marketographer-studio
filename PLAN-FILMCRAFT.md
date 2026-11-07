# Plan: Estudio Marketographer + FilmCraft

Plan escrito por Opus (2026-11-05) para que lo ejecuten Sonnet o Haiku.
Cada tarea dice qué modelo usar, qué archivos tocar y cómo saber que terminó.
**Hazlas en orden. No empieces una fase sin cerrar la anterior y anotar el resultado al final de este archivo.**

---

## 0. Lo que ya sabemos (no lo vuelvas a investigar)

### Estudio (este repo)
- Node (`server/`, `web/`, `modules/<id>/`) + motor Python en `modules/talking-head/engine/`.
- El render (`engine/render.py`, ~1000 líneas) arma **cada cuadro en la CPU** con PIL + OpenCV, en un solo proceso,
  y lo manda crudo a ffmpeg, que codifica con **libx264 por software** (`render.py:678`, `exportar.py:109`, `matte.py:21`).
- El recorte de la persona (`matte.py`) corre ONNX cuadro a cuadro y guarda `alpha.mp4`.
- La Mac tiene 8 núcleos; hoy se usa ~1.
- Marca: tokens en `web/shell.css` líneas 10-23 (`--accent: #fddc5b`, `--accent-ink: #181818`, radios 8/16/28,
  curva `cubic-bezier(.22,1,.36,1)`), tipografías Poppins (400-800) y "Working" en `web/fonts/`. Modo oscuro ya definido.

### FilmCraft (`/Applications/FilmCraft.app`, v0.9.0, commit `4a69a038d32761f604b3c7e4845b21fb40b3cbe4`)
- Código: https://github.com/storytold/filmcraft — licencia **MIT OR Apache-2.0** (se puede modificar y vender).
- Rust puro. Interfaz egui (crate `crates/ui-egui`), dibujo en GPU con wgpu/Metal, decodificación por hardware
  (VideoToolbox). Ya trae `whisper` (transcripción) y motor de texto (harfrust/skrifa/vello).
- Proyecto `.fcproj` = JSON legible (`"format":"filmcraft.project","schema_version":15`).
  Ejemplo real: `~/Library/Application Support/FilmCraft/Auto-Save/*.fcproj`.
- Está en **alfa**. Cambia rápido; un fork se desactualiza.

### Por qué uno es rápido y el otro lento
FilmCraft usa la tarjeta gráfica y el codificador de hardware de la Mac. El Estudio usa Python cuadro a cuadro en un
núcleo y codifica por software. **No es un problema de diseño de funciones, es de cómo se dibuja y se codifica.**

---

## Decisión

**No reconstruir desde cero. No fusionar todo de golpe.** Tres fases, cada una con una puerta de salida:

| Fase | Qué | Costo | Riesgo | Si sale bien... |
|---|---|---|---|---|
| 1 | Acelerar el Estudio actual (hardware + núcleos) | bajo | bajo | quizá ya no hace falta nada más |
| 2 | Puente: el Estudio exporta un proyecto que se abre en FilmCraft | medio | medio | editas la línea de tiempo en FilmCraft con tus efectos ya hechos |
| 3 | Fork de FilmCraft con tu marca y tus efectos nativos en Rust | alto | alto | una sola app, rápida, tuya |

La fase 3 solo se hace si después de la 2 el flujo sigue siendo incómodo. Es trabajo de semanas, en Rust.

---

## Reglas para ahorrar créditos (para el modelo que ejecute)

1. Lee solo los archivos y líneas que la tarea nombra. Usa `grep -n` antes de abrir un archivo entero.
2. No reescribas funciones que funcionan. Cambios mínimos.
3. Una tarea por sesión. Al terminar, anota el resultado en la sección **Bitácora** de abajo (2-3 líneas).
4. Si algo falla 2 veces seguidas con el mismo error, para y anota el error en la Bitácora. No sigas probando a ciegas.
5. Haiku: tareas marcadas **[H]**. Sonnet: tareas marcadas **[S]**.
6. Antes de tocar `data/`, copia la carpeta a `data/respaldos/`. Nunca borres videos del usuario.
7. Explícale a Pablo en español simple, sin jerga (no es programador).

---

## FASE 1 — Acelerar el Estudio (1-2 días)

### 1.1 [H] Medir la línea base
- Elige un proyecto real de Talking Head de ~60 s. Exporta en calidad final y anota en la Bitácora:
  segundos de render, segundos de `matte`, duración del video.
- Guarda el comando o los pasos para repetir la medición igual en cada tarea.
- **Hecho cuando:** hay 3 números en la Bitácora.

### 1.2 [H] Codificar con el chip de la Mac
- En `engine/render.py:678-679`, `engine/exportar.py:109`, `engine/matte.py:20-21` y el render de proxy
  (`render.py:543`): cambiar `libx264` por `h264_videotoolbox`.
- `videotoolbox` no acepta `-crf` ni `-preset`. Sustituir por `-b:v` según calidad:
  borrador `6M`, medio `12M`, final `20M` (para 1080x1920). Mantener `-pix_fmt yuv420p`.
- Agregar en `engine/common.py` una función `encoder_args(calidad)` que devuelva la lista, y usarla en los 4 sitios.
  Si `ffmpeg -encoders` no lista `h264_videotoolbox`, que devuelva los argumentos actuales de libx264 (respaldo).
- `alpha.mp4` (matte) debe seguir viéndose limpio: para ese usa `-b:v 8M`.
- **Hecho cuando:** exporta, el video se ve igual a ojo, y la Bitácora tiene el nuevo tiempo.

### 1.3 [S] Render en paralelo por tramos
- En `engine/render.py`, la función que tiene el bucle `while True:` (línea ~687) dibuja todo el video en un proceso.
- Cambio: partir la duración en N tramos (N = núcleos − 1, máximo 6), renderizar cada tramo en un proceso aparte
  (`concurrent.futures.ProcessPoolExecutor`), cada uno a su propio `.mp4`, y unirlos con
  `ffmpeg -f concat -c copy`. El audio se agrega al final como hoy.
- Cuidado:
  - Cada proceso abre su propio `cv2.VideoCapture` y hace `seek` a su primer cuadro.
  - Las animaciones dependen del tiempo `t`, no del cuadro anterior → deben salir idénticas. Verifícalo
    comparando un cuadro en el borde entre tramos contra la versión de un solo proceso (`ffmpeg -ss X -frames:v 1`).
  - Si algo usa estado acumulado entre cuadros (buscar variables que se actualizan dentro del bucle), ese estado
    debe calcularse desde `t` o pasarse al inicio de cada tramo.
  - Cortes de tramo en un keyframe: usa `-g` y `-force_key_frames` para que `concat -c copy` no dé saltos.
- Opción `--hilos 1` para volver al modo anterior si algo sale mal.
- **Hecho cuando:** mismo video, sin saltos en las uniones, y tiempo anotado.

### 1.4 [S] Recorte (matte) más rápido
- `engine/matte.py`: activar el proveedor CoreML de onnxruntime
  (`providers=["CoreMLExecutionProvider","CPUExecutionProvider"]`). Si el modelo no es compatible, dejar CPU.
- Procesar a menor resolución si `long_side` > 960 y reescalar la máscara (ya existe el parámetro).
- **Hecho cuando:** tiempo de matte anotado y la silueta se ve igual.

### 1.5 [H] Cachear lo que no cambia
- Buscar en `render.py` dónde se crean los sprites de texto (`title_sprite`, `sub_sprite`). Si se llaman con los
  mismos argumentos en cuadros seguidos, envolver con `functools.lru_cache` usando una clave hasheable
  (texto, palabra activa, tamaño, estilo serializado).
- **Hecho cuando:** tiempo anotado. Si no mejora más de 10 %, revertir.

### Puerta de la Fase 1
Pablo exporta 3 videos reales. Si el tiempo total le parece aceptable → **parar aquí**. Si no → Fase 2.
Meta orientativa: un video de 60 s en menos de 60 s.

---

## FASE 2 — Puente Estudio → FilmCraft (3-5 días)

Idea: el Estudio hace lo que FilmCraft no sabe (analizar, cortar silencios, títulos, subtítulos animados, recorte,
bloom). FilmCraft hace lo que hace bien (línea de tiempo, vista fluida, exportación rápida).

### 2.1 [S] Prueba de concepto del formato (½ día, sin código del Estudio)
- Clonar el repo: `git clone https://github.com/storytold/filmcraft ~/Documents/Claude\ Code/filmcraft-src`
  y hacer `git checkout 4a69a038` (la versión instalada).
- Buscar en el código el tipo que serializa el proyecto (`grep -rn "filmcraft.project" crates/`) y documentar en
  `docs/fcproj.md` (en este repo) solo lo necesario: secuencia, pistas de video/audio, clip con entrada/salida,
  ruta de archivo, opacidad. Nada más.
- Responder por escrito en la Bitácora:
  1. ¿Importa video con transparencia (ProRes 4444 o secuencia PNG)? Probarlo a mano en la app.
  2. ¿Se puede poner un clip en una pista encima de otra con transparencia?
  3. ¿Su exportación respeta esa transparencia?
- **Si 1-3 no funcionan:** la Fase 2 cambia a "exportar el fondo ya compuesto + cortes", y anotarlo.

### 2.2 [S] Exportar capas desde el Estudio
- Nuevo modo en `engine/render.py` (`--capas`) que escribe por separado:
  - `base.mp4`: el video con look, bloom y zoom (lo que hoy sale sin textos).
  - `textos.mov`: títulos + subtítulos sobre fondo transparente, ProRes 4444 con `prores_videotoolbox` si existe,
    si no `prores_ks -profile:v 4444`.
  - `voz.wav` y `sfx.wav`.
- Reutilizar las funciones existentes de dibujo. No duplicar lógica: el modo normal = base + textos encima.

### 2.3 [S] Generar el `.fcproj`
- Nuevo archivo `engine/a_filmcraft.py` con una función `escribir(proj)` que arma el JSON con:
  - Una secuencia 1080x1920 al fps del video.
  - Pista V1: `base.mp4` partido en los cortes de `cuts.py` (un clip por tramo conservado).
  - Pista V2: `textos.mov` alineado con V1.
  - Pistas A1/A2: voz y sfx.
- Usar como plantilla el `.fcproj` de ejemplo; copiar solo los campos obligatorios.
- Prueba con un asert: el JSON se carga con `json.loads` y cada clip tiene inicio < fin.
- **Hecho cuando:** el archivo abre en FilmCraft y se ve igual que la exportación del Estudio.

### 2.4 [H] Botón "Abrir en FilmCraft"
- En `modules/talking-head/server.js`: ruta `POST /api/talking-head/filmcraft/:id` que corre el modo capas,
  luego `a_filmcraft.escribir`, luego `open -a FilmCraft <ruta>.fcproj`.
- En `modules/talking-head/ui.js`: un botón junto a Exportar que llama a esa ruta. Mismo estilo que los botones vecinos.
- Mismo botón en `modules/pro-vs-noob` (Pro vs Noob = dos clips en V1/V2 con recorte de pantalla dividida).

### Puerta de la Fase 2
Pablo edita 3 videos con el flujo nuevo. Preguntas: ¿le basta retocar en FilmCraft? ¿Le molesta tener dos apps?
Si le basta → **parar aquí**. Si quiere una sola app con todo en vivo → Fase 3.

---

## FASE 3 — Fork "Marketographer Studio" sobre FilmCraft (semanas, Sonnet)

Solo con aprobación explícita de Pablo. Requiere Rust ≥ 1.95 instalado (`rustup`).

### 3.0 [S] Preparar el fork
- Fork en GitHub de `storytold/filmcraft` a la cuenta de Pablo. Rama `marketographer`.
- Compilar sin cambios: `cargo run --release -p filmcraft`. Anotar tiempo de compilación.
- **Legal (obligatorio):** mantener los archivos `LICENSE-MIT`, `LICENSE-APACHE` y los avisos de copyright
  originales. Agregar un `NOTICE` diciendo que es una obra derivada de FilmCraft. **Cambiar el nombre y el ícono**:
  la licencia permite usar el código, no la marca "FilmCraft"/"ArtCraft". Mantener los `OFL-*.txt` de las fuentes.

### 3.1 [S] Marca
- Buscar dónde se arma el tema de egui (`grep -rn "Visuals\|Style\|set_fonts" crates/ui-egui/src`).
- Aplicar: acento `#fddc5b`, tinta `#181818`, radios 8/16/28, modo claro y oscuro con los valores de
  `web/shell.css:10-23`. Cargar Poppins y Working desde `web/fonts/` con `FontDefinitions`.
- Nombre de la app, ícono `.icns`, `CFBundleIdentifier` propio, menú "Acerca de".
- **Hecho cuando:** captura de pantalla en claro y oscuro aprobada por Pablo.

### 3.2 [S] Efectos nativos, uno por tarea, en este orden (del más fácil al más difícil)
Cada uno como un "efecto" o "generador" del sistema de efectos que ya tenga FilmCraft
(buscar primero cómo están hechos los efectos existentes y copiar el patrón exacto).

1. **Look**: contraste, saturación, brillo, viñeta, degradado arriba/abajo → un shader WGSL. Referencia: `make_look` en `render.py:399`.
2. **Bloom** en luces → shader de dos pasadas (umbral + desenfoque). Referencia: `_suave` y la clase en `render.py:435-500`.
3. **Zooms** con deriva y blanco y negro → keyframes de escala/posición. Referencia: `zoom_scale` (`render.py:385`).
4. **Subtítulos animados** con palabra activa, glow, contorno, caja → generador de texto que lee un `.srt`/JSON de
   palabras con tiempos. Referencia: `sub_sprite`, `build_chunks`, `partir_grupo` (`render.py:198-330`).
5. **Títulos grandes** (Detrás/Arriba/Centro/Abajo) y animaciones `anim_state` (`render.py:348`).
6. **Recorte de persona (matte)** con el crate `ort` y el mismo modelo ONNX de `matte.py`, cacheado a disco. Necesario para "Detrás".
7. **Análisis**: transcripción (FilmCraft ya trae whisper), cortes de silencios (`cuts.py`), plan (`plan.py`).
8. **Plantilla Pro vs Noob**: secuencia con dos clips en pantalla dividida y etiquetas animadas (`provsnoob.py`).

Para cada efecto: probarlo contra un cuadro exportado por el Estudio (mismo `t`) y comparar a ojo.

### 3.3 [S] Guiones dentro de la app
Decidir con Pablo si el módulo de guiones se queda en el Estudio web (más simple) o se porta. Recomendado: se queda.

---

## Bitácora (anota aquí al terminar cada tarea)

| Fecha | Tarea | Resultado (números, problemas) |
|---|---|---|
| 2026-11-05 | 1.1 | Línea base: render de 60 s (proyecto mvfnhi3hjdw, calidad final, libx264 veryfast crf 17) = **85 s** de reloj, CPU al 184 % (de 800 %). Salida: preview.mp4 de 33 MB. Medido en copia en scratchpad, sin tocar el original. |
| 2026-11-05 | 1.2 | Con h264_videotoolbox (20 Mbps): **79 s** (antes 85 s, solo ~7 % más rápido). CPU sigue en 151 %: el cuello de botella es el dibujo de cuadros en Python, no el codificador. El archivo pasó de 33 MB a 97 MB. |
| 2026-11-05 | 1.2 decisión (Opus) | Cambiado de tasa fija a **calidad constante** `-q:v`: final 75, medio 65, borrador 55, alpha 85. Prueba SSIM sobre el mismo clip: q75 = 0.9926 / 29 MB vs libx264 crf17 = 0.9926 / 33 MB. Misma calidad, 12 % menos peso. Ganancia real de velocidad viene de 1.3 (el chip libera CPU para los procesos paralelos). |
| 2026-11-05 | 1.3 | Render en paralelo hecho (`render.py`: `paralelo`, `_trozo`, `_acc_previo`, `_fotograma`; `cli.py`: `--hilos`, `--tramo`). Mismo clip de 60 s: **76.7 s en serie → 25.9 s con 6 procesos (3× más rápido)**. 1163 cuadros en ambos, misma duración. SSIM paralelo vs serie 0.9947; cuadros en las uniones 0.992-0.994, peor cuadro 0.9916 → sin saltos. Cada tramo reconstruye su estado (contador de grano, zoom previo, resto de cámara lenta). Automático (CPU−1, máx. 6, solo si ≥300 cuadros); `--hilos 1` o variable `HILOS=1` vuelve al modo anterior. Límite conocido: si un tramo arranca justo en un cuadro de cámara lenta, ese primer cuadro no se mezcla con el anterior. |
| 2026-11-05 | 1.5 | Ya estaba hecho antes de este plan: los títulos se dibujan una vez antes del bucle (`render.py` líneas 719-723) y los subtítulos tienen caché por clave (`sub_cache`, línea 862). No se cambió nada. |
| 2026-11-05 | 3.0 (fork) | Fork creado: https://github.com/themarketographer/filmcraft, clonado en `Documents/Claude Code/filmcraft-fork`, en el commit 4a69a038 (el instalado). Licencia MIT OR Apache-2.0 + NOTICE + ATTRIBUTION.md. **Marca:** ArtCraft tiene marca registrada (`docs/brand/LICENSE-brand.txt`): en una versión modificada hay que quitar logos y nombre ArtCraft, y solo se puede decir en texto plano que está basada en FilmCraft. Hay ~400 menciones de ArtCraft en 61 archivos y ~320 de FilmCraft. Rust no estaba instalado; se instaló con brew/rustup (en curso). Falta compilar la versión original. |
| 2026-11-06 | 3 (fork, macOS/Linux/Windows) | Hecho y subido a `marketographer`: identificador de macOS `com.themarketographer.estudio` y nombre "Estudio Marketographer" (`2eddec71`); ícono de la marca de The Marketographer (`4b3d8b13`, con licencia de marca, no MIT); fondo y disposición del DMG propios (`75c226c3`); identificador Linux/FreeBSD/Flatpak `com.themarketographer.estudio`, menú macOS sin Discord de ArtCraft y demo renombrada (`dbd6f8cc`); instalador Windows con nombre propio y UpgradeCode nuevo (`a3be994a`). Pendiente: decidir si la carpeta de datos (%APPDATA%\FilmCraft, Application Support\FilmCraft) cambia de nombre; pruebas de instalación Linux en Linux. |
| 2026-11-05 | 3.1-3.2 (fork) | Fases 1 y 2 hechas y subidas: rama `marketographer` en https://github.com/themarketographer/filmcraft, commit `f594fdd8`. Sin marca ArtCraft; nombre visible "Estudio Marketographer". Pruebas: fmt, assets, layers y workspace completo en verde. Pendiente: fase 3 (identificador `bundle id` y empaquetado) y fase 4 (ícono propio). |
| 2026-11-05 | 1.4 | Recorte (matte) en paralelo (`matte.py`: `CALENTAR = 60`, `correr_tramos` en `common.py`, acción `matte` en `cli.py`). Clip de 40 s: **83 s en serie → 41 s con 6 procesos (2×)**, 1202 cuadros en ambos. Con 20 cuadros de calentamiento la máscara en las uniones bajaba a SSIM ~0.98; con 60 baja a ~0.989 (medio 0.9970 contra 0.9961 antes). Costo: 44 s en vez de 41 s. **Pendiente:** revisar a ojo las uniones de la máscara en un video real. CoreML se probó y no mejoró (58 ms por cuadro contra 55 en CPU), así que se queda en CPU. |
| 2026-11-06 | Carpeta de datos (decisión Opus/Sonnet por encargo de Pablo) | **Se queda como está** (`FilmCraft` en Application Support / %APPDATA%). Motivo: renombrarla sin migración haría que la app no vea los datos de quien ya usa FilmCraft; con migración es más código y riesgo. Se revisa si algún día hay que convivir con FilmCraft instalado. |
| 2026-11-06 | 3.2.1 Look (fork) | Ya existe en FilmCraft (Lumetri: contraste, saturación, viñeta). No se escribió un shader nuevo: se agregó la carpeta **Lumetri ▸ Marketographer** con 3 presets (Clean/Punchy Talking Head, Dark Frame for Titles), traducidos es/ja/zh-cn (`c18133a2`). Falta: degradado a negro arriba/abajo (`degradado` del Studio). |
| 2026-11-06 | 3.2.3 Zooms (fork) | Presets de Movimiento **Zoom Punch In** (100→115 % en 0,25 s) y **Zoom Slow Push** (100→104 %), traducidos (`646c35a9`). Falta: zoom con blanco y negro y la lógica automática de niveles del Studio. |
| 2026-11-06 | 3.2.4 Subtítulos (fork) | **Palabra activa**: nuevo campo `active_color` en el estilo de pista de subtítulos (compatible con proyectos viejos), comando `captions.setStyle {activeColor}` y casilla + color en el panel Texto. El tiempo del subtítulo se reparte entre sus palabras según su largo (sin cambiar el formato). Prueba: la palabra en color se mueve de izquierda a derecha. Falta: tiempos reales por palabra desde la transcripción (whisper), glow/caja por palabra y animaciones de entrada del Studio. |
| 2026-11-06 | 3.2.2 Bloom + degradado (fork) | Sin código de shader nuevo: presets **Soft Bloom** (Wonder Glow de FilmCraft, umbral 70, radio 120, intensidad 60, modo Screen) y **Dark Top and Bottom** (dos máscaras difuminadas con brillo -55 abajo y -35 arriba). Prueba: solo se oscurecen los bordes. Falta compararlos a ojo contra un cuadro del Studio y afinar valores. |
| 2026-11-06 | 3.2.5 Títulos (fork) | 3 plantillas de gráficos integradas **Marketographer ▸ Title – Top / Center / Bottom** (Inter Bold blanco, línea amarilla, sombra; Poppins no se puede incluir porque las fuentes viven en otro repo). Traducidas es/ja/zh-cn (`4653784d`). Falta: animaciones `anim_state` y la posición "Detrás" (necesita el recorte de persona, 3.2.6). |
| 2026-11-06 | 3.2.4 Subtítulos, tiempos reales (fork) | Los subtítulos hechos desde la transcripción guardan `word_times` por palabra (compatible con proyectos viejos); la palabra activa usa esos tiempos y, si no coinciden con el texto, vuelve al reparto por largo. Workspace completo en verde (310 suites). **Pendiente / decisión:** recorte de persona (3.2.6) choca con la regla "solo Rust": o se llama al motor Python, o se acepta `ort` como excepción; análisis de silencios (3.2.7) y Pro vs Noob (3.2.8). |
| 2026-11-06 | 3.2.7 Silencios (fork) | No hizo falta código: FilmCraft ya trae **Remove Pauses** (`transcript.removePauses`, pausas mínimas y cuánto silencio se deja) y quitar muletillas, basados en la transcripción y el VAD. Se usa tal cual. Falta solo comparar los valores por defecto con los de `cuts.py`. |
| 2026-11-06 | 3.2.8 Pro vs Noob (fork) | Plantilla de gráficos **Marketographer ▸ Pro vs Noob**: etiqueta PRO (amarilla) a la izquierda, NOOB (blanca) a la derecha y línea amarilla divisoria; textos y colores editables. Traducida es/ja/zh-cn. Falta: animación de entrada de las etiquetas y armar la pantalla dividida con dos clips automáticamente. |
| 2026-11-06 | Fusión upstream (fork) | Se fusionaron los 1571 cambios nuevos de FilmCraft (`7c913dc9`): 33 conflictos resueltos conservando la marca (nombre, íconos, empaquetados, sin logo ArtCraft) y las funciones del Studio. Gates en verde. "Check for Updates" ahora busca en `themarketographer/filmcraft`. `marketographer` es la rama principal del fork en GitHub. Pendiente: Actions del fork sin activar (no se puede generar instalador), firmas Apple/Windows. |
