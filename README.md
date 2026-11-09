# Estudio Marketographer

Herramienta local (Mac y Windows) para convertir tus clases en guiones y, más adelante, editar tus videos con tu estilo.

## Instalar en tu Mac
**Lo más fácil: pídeselo a tu Claude.** Pégale esto:

> Instala el Estudio Marketographer en mi Mac siguiendo las instrucciones de https://github.com/themarketographer/marketographer-studio/blob/main/INSTALAR-CON-CLAUDE.md y avísame cuando esté abierto.

Las instrucciones completas (y qué hacer si algo falla) están en [INSTALAR-CON-CLAUDE.md](INSTALAR-CON-CLAUDE.md).

**Sin Claude, un comando.** Funciona en Mac y en Windows 10 u 11.

Mac (Terminal):
```bash
curl -fsSL https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.sh | bash
```
Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.ps1 | iex
```
No hace falta tener Homebrew, Node, Python ni Git: todo se baja solo (~1,5 GB la primera vez) y queda dentro de la carpeta `EstudioMarketographer` de tu usuario. En Mac crea la app en Aplicaciones; en Windows, un acceso directo en el escritorio y en el menú Inicio. Para actualizar, pega el mismo comando (o acepta el aviso al abrir la app). Tus videos viven en `EstudioMarketographer/data` y no se tocan.

**Solo Mac: el instalable (.dmg).** Descárgalo de la sección *Releases*, arrastra la app a Aplicaciones y ábrela (la primera vez: clic derecho > Abrir). Se prepara sola y después abre en segundos, sin internet. Avisa cuando hay una versión nueva.

**Para quien arma el instalable:** `bash empaquetar/construir.sh` crea el .dmg en `dist/`.

## Clonar el código (para programar)
```bash
git clone https://github.com/themarketographer/marketographer-studio.git
cd marketographer-studio
bash preparar.sh   # una vez (en Windows: powershell -ExecutionPolicy Bypass -File preparar.ps1)
bash Iniciar.command   # en Windows: Estudio.ps1
```
La carpeta `data/` se crea sola con tus propios guiones.

## Cómo abrirlo
Con la app instalada, el icono de *Estudio Marketographer*. En una copia clonada, `Iniciar.command`. Se abre en http://localhost:4177.

## Qué hay hoy
- **Guiones**: temas, formatos (Talking Head, Pro vs Noob, Storytelling), prompt listo para Claude, guion guardado y modo grabación.
- **Talking Head**: editor completo con vista en vivo, voz en off, frases animadas, stickers y transiciones.
- **Pro vs Noob**: dos tomas en la misma pantalla con etiquetas animadas.
- **Pronto**: pipeline de Storytelling.

## Dónde vive cada cosa
```
server/            servidor y utilidades (no se toca al agregar módulos)
web/               cascarón: menú lateral y carga de módulos
modules/<id>/      un módulo por carpeta
  module.json      nombre, ícono, estado ("listo" o "proximamente")
  server.js        (opcional) rutas de API bajo /api/<id>/...
  ui.js            (opcional) exporta mount(root, { api, toast, h, icon })
  ui.css           (opcional) estilos del módulo
data/              tus datos en JSON (clases, temas, guiones)
```

## Cómo agregar una función nueva
1. Crea `modules/mi-modulo/module.json` con nombre, ícono y estado.
2. Si necesita datos o procesos, agrega `server.js` con `export default ({ route, store, config }) => { ... }`.
3. Si tiene pantalla, agrega `ui.js` con `export async function mount(root, ctx) { ... }`.
4. Reinicia el estudio. Aparece solo en el menú.

## Cómo agregar un formato de guion
En `modules/guiones/prompts.js`, añade una entrada a `FORMATOS`. Aparece en la interfaz sin tocar nada más.

## Marcas de edición en los guiones
Las leerá el editor automático:
- `*palabra*` sale grande en pantalla.
- `[ZOOM]` marca un zoom de énfasis.
- `[SFX: click]` o `[SFX: whoosh]` marcan un sonido.
- `[CORTE]` marca un cambio de personaje en Pro vs Noob.

## Carpeta de Zoom
Por defecto busca en `~/Documents/Zoom`. Para otra ruta: `ZOOM_DIR=/ruta node server/index.js`.

## Motor de video (Talking Head)

1. El motor se prepara solo la primera vez (`preparar.sh`: entorno privado y modelos).
2. Abre el Estudio y entra en Talking Head.
3. Sube un video, pulsa Analizar, ajusta textos y estilo, genera la vista previa y exporta.

## Editor Talking Head: qué incluye

- Pestañas Estilo, Títulos, Subtítulos, Efectos y Guion.
- Títulos grandes con posición Detrás, Arriba, Centro o Abajo. Detrás de la cabeza solo entran palabras cortas que el motor comprueba que se lean (usa tu silueta promedio).
- Subtítulos con palabra activa resaltada, palabras clave con otra tipografía, interletrado, glow, contorno y caja.
- Zooms con intensidad, frecuencia, estilo, deriva lenta, blanco y negro durante el zoom y sonido propio.
- Imagen: contraste, saturación, brillo, bloom en luces, degradado oscuro arriba y abajo, viñeta.
- Guion editable con alineación de tiempos y vuelta a la transcripción original.
- Zona segura de TikTok y Reels sobre el video.
- Vista previa con copia ligera del video (proxy.mp4) y lectura en paralelo.

## Pendientes pedidos

Ralentizar frases con voz baja, tipografía elástica, lista de puntos que desenfoca el resto, conectar ideas con líneas, gráficos, punto que hace transición, desenfoque de movimiento en bordes, sugerencias de B-roll y color de contraste automático.


## Novedades de esta versión

### v1.8

- **Ruleta de títulos:** ahora las palabras giran como un rodillo de tragamonedas: suben, frenan suave, rebotan un poco y se detienen en la última, con un leve desenfoque mientras giran. Se escribe igual que antes, con las palabras separadas por | y la última queda fija. La vista en vivo y el video exportado se ven igual.

### v1.7

- Subtítulos: pulso al entrar la palabra grande. En el instante en que el título sube, esa palabra del subtítulo late y toma el acento (apagable en Subtítulos).
- Palabras grandes: tarjeta Estilos listos (Impacto, Limpio, Editorial, Neón, Cómic). Cambian letra, brillo, mayúsculas y animaciones sin tocar los subtítulos.
- Efectos de sonido: tarjeta Un sonido por tipo (uno por animación de título y uno por tipo de elemento, con actualización inmediata de lo ya puesto) y tarjeta Volumen de cada sonido. Valen en la vista previa y en el video exportado.
- Subtítulos: ahora salen siempre completos. Cuando una palabra sube en grande, la frase de abajo no pierde nada. El ajuste "Cuando una palabra sale en grande" tiene tres modos: Subtítulo completo (por defecto, también para proyectos viejos), Apagar esa palabra (queda en su sitio con menos brillo) y Quitarla (el comportamiento anterior).
- Palabras grandes: tarjeta Elegir palabras grandes. Seleccionas palabras en la transcripción (arrastrar, Mayús o doble clic) y se vuelven título. Las sugeridas llevan subrayado punteado, con botón para aceptarlas todas. Solo muestra las palabras que no borraste.

- Palabras grandes: "Dónde pueden aparecer" y "Animaciones que se alternan" ahora mueven al instante los títulos que ya no cumplen. Antes solo guardaban una preferencia y había que pulsar Repartir. Siempre queda al menos una opción marcada.
- Cantidad de títulos y frecuencia de zooms avisan que hay que volver a proponerlos o recalcularlos, con el botón al lado, porque eso reemplaza lo editado a mano.

- Línea de silencios con un solo manejador: arrastrar un borde, mover un corte entero y marcar uno nuevo ya no se confunden. Los bordes se agarran en una franja de 10 px y el cursor avisa qué vas a hacer. Antes el arrastre de un borde se cortaba a mitad.
- La caja del video ya no se aplasta contra los controles de abajo en ventanas de cierta altura.

- Paneles largos con secciones plegables: la primera abierta, el resto cerradas. Se recuerda lo que abres.
- Subtítulos: tarjeta Estilos listos (Clásico, Caja negra, Pop, Neón, Limpio, Cine) con vista previa. Un clic cambia varias cosas a la vez.
- Al cambiar un control ya no se repite la animación de entrada de todo el panel.
- Recortar y Corregir son dos pasos. Recortar es donde borras texto y pausas. Corregir solo muestra las palabras que se quedan en el video.
- Los cortes de silencio ahora siguen la transcripción: se queda lo que está dentro de una palabra, con un poco de aire alrededor. Respiraciones, golpes y ruido de calle se cortan sin importar su volumen, y una palabra dicha bajito no se recorta porque el umbral se mide contra tu propia voz.
- Cuatro tarjetas de ritmo (Sin cortes, Natural, Ágil, Seco) con la duración resultante. Luego afinas: arrastras sobre la línea para cortar en medio de una frase, tocas un corte para moverlo 0,1 s o conservarlo.
- Botones Video más grande y Ocultar ajustes. Exportar y Siguiente quedan fijos abajo.
- Subtítulos: un solo interruptor para las palabras clave. La tipografía especial solo se ofrece cuando ese interruptor está activo.
- Escuchar y Ir a este momento ya no lanzan error si el video aún no cargó.
- La vista previa conserva la silueta cuando el video de recorte tarda en llegar (halo, desenfoque y color ya no se apagan fuera de los zooms).

### v1.6
- **Recortar con la transcripción.** En el paso Texto seleccionas palabras (arrastrar, Mayús+clic o flechas con Mayús) y Supr las quita del video con su audio y sus subtítulos. Se ven tachadas, se devuelven con Supr otra vez y Cmd+Z deshace. Se guardan en `plan.cortes.borradas`, aparte de los silencios, así que no se pierden si recalculas los cortes automáticos. El motor las une con los silencios en `cuts.rangos_plan` (render, .srt y vista previa usan la misma lista).
- **Limpieza sugerida.** Detecta frases repetidas (se queda la última toma), palabras repetidas, muletillas (eh, mm, o sea con coma) y palabras sueltas entre pausas. Cada una tiene Escuchar, Quitar y Dejarla, y hay botones para quitar todas las de un tipo.
- **Transcripción más rápida.** Whisper small con búsqueda voraz y el prompt nuevo. Medido en un clip de 25 s con 2 núcleos: 5,4 s contra 10,8 s del ajuste anterior. En Ajustes se elige Rápida o Precisa (la precisa vuelve a la búsqueda de 5 opciones). `data/transcripcion.json` guarda la elección.
- **Mejor puntuación.** El prompt de Whisper incluye un texto de muestra con comas, preguntas y muletillas más tu vocabulario.
- **Subtítulos que siguen la idea.** `partir_grupo` (motor) y `partirGrupo` (vista previa) cuidan artículos, auxiliares, no, nombres propios, cifras, comas, y dejan ir solas palabras como Sí, No, Mira o una cifra con su signo. Los sonidos tipo eh y mm no se escriben en pantalla.

### v1.5
- **Copias de seguridad automáticas**: al abrir el Estudio se guarda una copia fechada de `data/*.json` en `data/respaldos/` (las últimas 15, solo si algo cambió). Botón "Copias de seguridad" en el menú para restaurar. Los paquetes de actualización ya no llevan la carpeta `data`, así que instalar una versión nueva nunca pisa tus guiones.
- **Todas mis capas**: panel único con títulos, escenas, frases, stickers y elementos en orden. Cada uno se edita después de crearlo y se ve en vivo (tiempos, texto, tamaño, altura, animación, salida, sonido). Mismo editor en todos los lugares.
- **Stickers y logo**: png con transparencia, arrastrables sobre el video, con animación de entrada y modo marca de agua.
- **Transiciones de escena**: desvanecido, cruzado largo, barrido y corte con zoom.
- **Voz en off**: plantillas de un clic (fondo, animaciones, estilo, música), frases que se rehacen solas al corregir el texto y guion de Guiones como texto exacto desde el paso Texto.
- **Publicar**: formatos 4:5 y 1:1, subtítulos .srt con los cortes aplicados y borrador de caption con hashtags.
- **Pro vs Noob**: módulo nuevo, vista en vivo y exportación 1080x1920.

### v1.4
- **Una sola vista**: ya no hay pestañas En vivo, Original, Vista previa y Final. Siempre ves el video con tus ajustes, y un botón "Mantén para ver el antes" (o la tecla B) muestra cómo se grabó mientras lo mantienes pulsado. Se quitó el botón de vista previa: solo queda Exportar video, y al terminar se abre el resultado en una ventana con descarga.
- **Escenas de texto**: en Texto en pantalla, Elementos. Texto con animación, emojis, fondo en degradado, color, imagen tuya o sin fondo. Se ve en vivo y se exporta igual. Incluye "Quiero una animación que no está en la lista": prepara el mensaje completo para pedírsela a Claude.
- **Voz en off**: en la pantalla de proyectos, "Crear un video con solo tu voz". Grabas con el micrófono o subes un audio, eliges el fondo y se transcribe como cualquier video (subtítulos, palabras grandes, escenas, música y sonidos).
- **Tamaño de la interfaz**: A- y A+ en el menú lateral (70% a 130%, por defecto 90%).
- **Tarjetas**: al cambiar de pestaña dentro de una tarjeta, la barra ya no vuelve al inicio.
- **Guiones**: indicador "Sin guardar", atajo Cmd+Enter para guardar, borrado en dos pasos sin ventanas del sistema, plantillas que no pisan tu texto sin avisar, y modo espejo en el teleprompter.

### v1.3
- **Restablecer**: doble clic sobre cualquier barra la devuelve a su valor de fábrica. Si un valor cambió, aparece una flecha junto al número para volver. Cada tarjeta tiene "Restablecer esta tarjeta" al final, y Cmd+Z lo deshace.

### v1.2
- **Efectos de sonido personalizables**: tarjeta nueva en el paso Sonido. Eliges qué suena en las palabras grandes, en cada zoom y en la tarjeta final, ajustas el volumen general y subes tus propios sonidos (MP3, WAV, M4A). Cada título también puede llevar el suyo.
- **Voz mejorada en vivo**: filtro de graves, compresor, nivelado y reducción de ruido se oyen al instante en la vista En vivo.
- **Barra de trabajo**: cualquier cambio que tarde un poco muestra una barra arriba con lo que está pasando.
- **Dock**: un segundo clic en Estudio trae la ventana al frente en vez de abrir otra.

### v1.1
- **Bloom nuevo**: niebla de luz ámbar alrededor de las luces del fondo, en tres radios y con un velo que suaviza el fondo. La cara no se toca. Funciona igual en En vivo y en el video generado.
- **Estela de movimiento del fondo**: ahora puede notarse siempre, con un vaivén suave, o solo al hacer zoom. Solo afecta al fondo.
- **Sonido en En vivo**: se oyen los efectos de los títulos y zooms, y la música con bajada automática cuando hablas (aproximada, la mezcla exacta está en la vista previa generada).
- **Música**: subir MP3, WAV, M4A, AAC, FLAC u OGG con botón o arrastrando, con mensajes de error claros.

### v1.0
- **Seis pasos**: Texto, Silencios, Texto en pantalla, Imagen y cámara, Sonido y Publicar. Cada paso explica qué modificas y se ve al instante en la vista En vivo.
- **Texto**: guion lado a lado con el video para corregir cada palabra antes de tocar subtítulos.
- **Silencios**: línea de tiempo con los tramos cortados en rojo, qué subtítulos caen, bordes arrastrables, cortes manuales y atajos.
- **Look de película**: halación y brillo sobre las luces del fondo, no sobre la cara. Grano, viñeta y presets.
- **Fondo**: el desenfoque y el movimiento se aplican a todo el fondo, solo detrás de palabras o en bordes. Tú eliges.
- **Ajustes** (guardados en el navegador): vocabulario, reemplazos, calidad de vista previa y avisos.
- **Portada**: mejores momentos automáticos, vista previa en vivo, cuadrícula de Instagram 4:5, plantillas y tres variantes.
- Deshacer y rehacer (Cmd+Z), atajos de teclado, línea de tiempo bajo el video, miniaturas y duplicar proyectos.
- **Guiones**: estructuras de partida por tipo de video y tiempo de lectura.

### Anteriores

- **Vocabulario propio** (tarjeta Guion): lista de palabras que Whisper debe respetar y reemplazos fijos. Corrige variantes como "membrecías" o "marketógrafos" y se puede aplicar a un video ya transcrito.
- **Subtítulos por ideas**: los bloques se cortan en puntos, comas y pausas. Si una idea es larga, se parte donde suena natural y nunca después de un artículo o una preposición.

- **Estudio.app**: doble clic y se abre como una app, en su propia ventana. Al cerrar la ventana, el Estudio se apaga solo. Arrástralo al Dock si quieres.
- **Tarjetas**: las nueve pestañas pasaron a tarjetas. Letras reúne la tipografía, las mayúsculas, el interletrado, el color y el brillo de títulos y subtítulos.
- **Sin solapes**: los títulos con altura automática se apartan de los subtítulos y de otros títulos. Los que tú posicionas a mano se respetan.
- **Mover en el video**: arrastra un texto en la vista En vivo para cambiar su altura.

- **Vista En vivo**: la primera pestaña del video dibuja títulos, subtítulos, zooms, looks y cortes al instante mientras mueves los controles. La vista previa generada sigue siendo la versión exacta (la música, la tarjeta final y la voz grave de la cámara lenta solo se oyen ahí).
- Pestaña Cortes: detecta silencios como DaVinci (umbral, mínimo, márgenes, fundido) y deja revisar cada corte.
- Pestaña Audio: mejora de voz (-16 LUFS) y biblioteca de música con baja automática cuando hablas.
- Estilo: Mis looks (guarda y reutiliza tu estilo).
- Guion: aplica un guion del módulo Guiones como verdad del video (marcas *palabra*, [ZOOM], [SFX: click], [CORTE]).
- Pestaña Elementos: lista que enfoca puntos, conectar ideas, número que sube, barras, punto de transición y cámara lenta con voz grave.
- Animaciones nuevas de título: Elástico y Ruleta (escribe las palabras separadas por | y la última queda fija).
- Efectos: desenfoque de movimiento en bordes, contraste automático con tu fondo y tomas de apoyo sugeridas.
- Publicar: tarjeta de cierre, portada (PNG 1080x1920) y pedido de caption con hashtags.
- Inicio: arrastra varios videos y se procesan uno tras otro con los ajustes elegidos.

## Pendiente
- Tipografía Izmir: falta el archivo. Copia el .otf o .ttf en modules/talking-head/engine/fonts y aparece sola en los selectores.

## Probar la instalación (para quien mantiene el proyecto)
En GitHub, pestaña *Actions* → *Probar instalación (Mac y Windows)* → *Run workflow*. Instala desde cero en una Mac y en un Windows limpios, sube un video de prueba, lo analiza y genera la vista previa. Para probar a mano en Windows: `empaquetar/probar_instalacion.py`.
