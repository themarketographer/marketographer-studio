# Plan para dejar terminado el Estudio (15 nov 2026)

Escrito para que cualquier modelo lo siga paso a paso. Antes de tocar nada lee `README.md` ("Dónde vive cada cosa") y la bitácora de `PLAN-FUNCIONES-FILMCRAFT.md`.

## Cómo está hoy (medido el 15 nov 2026 en la Mac de Pablo)

- Guiones, Talking Head y Pro vs Noob funcionan. La pantalla de inicio carga en 160 ms y Talking Head en menos de 100 ms, sin errores en consola.
- Las ramas `rendimiento`, `windows` y `mejoras-auditoria` ya están dentro de `main`: no queda nada por fusionar.
- La velocidad del motor ya se trabajó a fondo (ver bitácora): exportar 62 s de video tarda 29,7 s, la transcripción corre en la GPU y el recorte a 768 px.
- 9 proyectos ocupan 4,4 GB. Desde hoy cada tarjeta de proyecto muestra cuánto pesa y la lista dice el total.

## Hecho el 15 nov 2026, segunda tanda (versión 2026.11.15-2)

- Tareas 2, 3 y 4 de "Facilidad de uso": aviso de disco (se bloquea con menos de 2 GB libres, en `lanzar` de `server.js`), guía de primer uso, y errores del motor en simple (`modules/talking-head/errores.js`, con 8 comprobaciones).
- Pasos del editor con nombre e icono fijo, y "Exportar video" al final del paso Publicar.
- **Storytelling v1** (`modules/storytelling/`): narración más imágenes, sobre el motor de voz en off y el gráfico `escena` que ya existían. Reparto de escenas en `assets/reparto.js` (15 comprobaciones).
- `prueba-completa.sh`: prueba de punta a punta. Medido con un clip de 12 s: analizar 24 a 67 s, video final 6 a 8 s, exportar 4 s.

Lo que Storytelling v1 NO hace: parallax por capas (separar la imagen en fondo y figura y moverlas a distinta velocidad). Hoy cada imagen tiene un acercamiento lento. Eso sigue esperando la decisión de Pablo de abajo.
Tampoco genera las imágenes: se suben ya hechas.

## Lo único que no se puede terminar sin Pablo

**Storytelling** está marcado "próximamente" porque falta una decisión suya, escrita en `modules/storytelling/module.json`:
si el parallax hecho con código le convence frente a las capas de Canva. Sin esa respuesta no hay qué construir.

Paso para destrabarlo (medio día): generar UNA escena de prueba con parallax por código (una imagen separada en 3 capas con el recorte que ya existe en `engine/matte.py`,
movidas a distinta velocidad con `engine/render.py`), exportarla y mostrársela junto a una hecha en Canva. Si dice que sí, se arma el módulo con las tareas S1 a S4 de abajo.

## Tareas, en orden de valor contra esfuerzo

Cada tarea termina con: `node --check` en los `.js` tocados, los asserts de Python que ya existen, abrir el proyecto `mvfnhi3hjdw` en el navegador, 0 errores en consola, y una línea nueva en la bitácora.

### Facilidad de uso (hacer primero)

1. **HECHO el 15 nov 2026 (probado con un proyecto de prueba): Liberar espacio con un clic.** En el menú de cada proyecto (el de "Borrar", `ui.js` cerca de `menu-it peligro`) agregar "Liberar espacio".
   Borra solo `final.mp4` cuando existe al menos un archivo en `export/`, porque el final se puede volver a exportar y las exportaciones se conservan.
   Ruta nueva en `server.js`: `route.post('/proyectos/:id/liberar', ...)`. Mostrar cuánto se liberó con `toast`. Probar que el proyecto abre y exporta de nuevo.
2. **HECHO (15 nov): Aviso de disco lleno antes de exportar.** En `exportar-ui.js`, antes de lanzar, pedir al servidor el espacio libre (`fs.statfsSync`) y avisar si quedan menos de 2 GB.
3. **HECHO (15 nov): Primer uso guiado.** Si no hay proyectos, la pantalla de Talking Head muestra tres pasos (arrastra, revisa, exporta) en vez de la lista vacía. Solo texto y el botón que ya existe.
4. **HECHO (15 nov): Errores del motor en español simple.** En `server.js`, función `lanzar`: cuando el proceso de Python termina con error, leer las últimas 5 líneas de `motor.log`
   y traducir los tres casos conocidos de la bitácora (video que OpenCV no lee, falta el motor, sin espacio) a un mensaje con qué hacer.

### Pendientes pedidos por Pablo (lista del README, del más barato al más caro)

5. Color de contraste automático: elegir texto claro u oscuro según el fondo del cuadro. Función pura en `engine/graficos.py` con assert.
6. Lista de puntos que desenfoca el resto: nuevo `kind` de gráfico con el mismo patrón que `rotulo` o `etiqueta` (ver tarea 6.x de la bitácora).
7. Ralentizar frases con voz baja: en `engine/plan.py`, detectar tramos con volumen bajo en `envolvente.json` y proponer velocidad 0,9. Siempre como sugerencia que se puede quitar.
8. Conectar ideas con líneas y punto que hace transición: dos gráficos nuevos; el segundo es una transición más en la lista de transiciones.
9. Tipografía elástica y desenfoque de movimiento en bordes: requieren kernel nuevo en `engine/gpu.py`. Medir antes y después con el video de 62 s; si exportar sube de 31 s, no se incluye.
10. Sugerencias de B-roll: con las palabras de `words.json`, proponer en qué segundos cabe un clip de `data/broll`. Sin IA externa.

### Storytelling (solo si Pablo aprueba la prueba)

- S1. `modules/storytelling/server.js`: recibe guion con dos escenas y sus imágenes.
- S2. Separar cada imagen en capas con el recorte existente.
- S3. Render del parallax y una transición, reutilizando `render.py`.
- S4. Sincronizar la narración con `words.json` y exportar con los presets de `exportar.py`.

### Velocidad: solo con medición

No tocar el motor "por si acaso". Antes de cualquier cambio de velocidad, medir por etapas el proyecto `mvfnhi3hjdw` como en la bitácora del 7 nov.
Lo que queda por explorar según esa bitácora: el recorte de persona en GPU dio máscara correcta pero revisar si ya es más rápido que el de CPU, y Windows sin GPU.

## Reglas

- Nada de dependencias nuevas en Node: el servidor no tiene ninguna.
- Campos nuevos del plan siempre opcionales: los proyectos viejos deben abrir igual.
- Subir a `main` cambia la app de todos los que la tienen instalada (se actualizan solos). Subir `VERSION` en cada entrega.
