# Plan: ruleta de palabras de verdad

## Qué hay hoy
La animación `ruleta` ya existe. Las palabras separadas por `|` parpadean una tras otra
(cambio de palabra cada 0,1 s, con un temblor vertical de 3,5 %) y se detienen en la última.
Es un parpadeo, no una ruleta: no hay desplazamiento vertical ni frenado.

Código actual, que debe seguir viéndose igual en vista en vivo y en el video exportado:
- `modules/talking-head/live.js` función `dibujarTitulo` (líneas ~163-167) y `altoEv` (~187)
- `modules/talking-head/engine/render.py` funciones `draw_event` (~902-912) y la preparación
  de sprites (~659-660)

## Resultado esperado (lo que verá Pablo)
Una ruleta tipo tragamonedas: las palabras suben como un rodillo dentro de una ventana,
**empiezan rápido, frenan suave y se detienen en la última palabra con un pequeño rebote**.
Mientras gira se ve un poco de desenfoque vertical. La última palabra queda fija, como hoy.

Reglas que no se rompen:
1. La sintaxis no cambia: `palabra1|palabra2|palabra3`, la última queda fija.
2. Si el texto no tiene `|`, el título se comporta exactamente como antes.
3. Vista en vivo y video exportado se ven iguales (mismas fórmulas y mismos tiempos).
4. Proyectos guardados con `ruleta` siguen funcionando sin tocarlos.
5. No se cambian otras animaciones, ni `data/`, ni `package.json`.

## Tareas

### T1. Especificación de la animación — claude (hecha en este documento)
Duración del giro: `gira = 0.14 * n + 0.25` s (se conserva). Dentro de ese tiempo el rodillo
recorre `n - 1` posiciones con curva de frenado (ease-out cúbico), no a velocidad constante.
Al terminar, rebote de 4 % de la altura de una línea que se asienta en 0,18 s.
La ventana recorta el texto para que solo se vea una palabra completa (arriba y abajo entran y
salen las vecinas). Desenfoque vertical proporcional a la velocidad, solo mientras gira.

### T2. Implementación — codex (GPT-5)
Archivos: `modules/talking-head/live.js` y `modules/talking-head/engine/render.py`.
- Reemplazar el parpadeo por el rodillo descrito en T1, en los dos archivos, con las mismas constantes.
- Poner las constantes (duración, rebote, desenfoque) juntas y con comentario, para poder ajustarlas.
- No tocar nada fuera de la rama de `ruleta`.
Comprobaciones al terminar:
- `node --check modules/talking-head/live.js`
- `python -m py_compile modules/talking-head/engine/render.py` (con `.venv/bin/python`)
- Con `n = 1`, `n = 2` y `n = 5` palabras no hay error ni división por cero.

### T3. Documentación — ollama (tarea barata)
Solo en `README.md`:
- Quitar "ruleta de palabras" de la lista "Pendientes pedidos".
- Añadir una entrada corta "v1.8" en "Novedades" que explique la ruleta nueva en lenguaje simple.
No tocar nada más.

### T4. Revisión — claude
Leer el diff completo, comprobar que las fórmulas coinciden entre `live.js` y `render.py`,
y correr las comprobaciones. Si hay un video de prueba, exportar 5 s y mirar la ruleta.

## Orden
T2 primero. T3 en paralelo (toca otro archivo). T4 al final.
