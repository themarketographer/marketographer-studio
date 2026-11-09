# Instalar el Estudio Marketographer con tu Claude

Funciona en **Mac** (Apple Silicon o Intel). No necesitas Homebrew, Node ni Python: el instalador baja todo solo.
Necesitas internet, unos **3 GB libres** en el disco y unos 5 a 15 minutos la primera vez.

## Lo que tienes que hacer tú
Abre Claude Code (o Claude Cowork con acceso a tu Mac) y pégale esto:

> Instala el Estudio Marketographer en mi Mac siguiendo las instrucciones de https://github.com/themarketographer/marketographer-studio/blob/main/INSTALAR-CON-CLAUDE.md y avísame cuando esté abierto.

## Instrucciones para Claude (sigue esto al pie de la letra)
1. Comprueba que es una Mac: `uname` debe decir `Darwin`. Si no, dile al alumno que por ahora solo funciona en Mac y detente.
2. Comprueba que hay espacio: `df -h ~` debe mostrar al menos 3 GB libres. Si no, díselo.
3. Ejecuta el instalador (tarda varios minutos y descarga ~1,5 GB; corre el comando en segundo plano o con tiempo de espera largo y avisa al alumno de que es normal esperar):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.sh | bash
   ```
   - Instala todo en `~/EstudioMarketographer` y crea la app **Estudio Marketographer** en Aplicaciones (o en `~/Applications` si no hay permiso).
   - Puede volver a ejecutarse cuando quieras: actualiza el código y no toca los videos del alumno.
   - Si falla por internet, repite el comando: salta lo que ya bajó.
4. Verifica que quedó listo: debe existir `~/EstudioMarketographer/.runtime/listo` y la app en Aplicaciones.
5. Ábrelo: `open "/Applications/Estudio Marketographer.app"` (o la de `~/Applications`). Se abre en su propia ventana. Comprueba con `curl -s -o /dev/null -w "%{http_code}" http://localhost:4177` que responde `200`.
6. Dile al alumno:
   - Para abrirlo otra vez: el icono de la app. Para fijarlo en el Dock: clic derecho en el icono con la app abierta, Opciones, Mantener en el Dock.
   - La primera vez que macOS pregunte por permisos o por una app de un desarrollador no identificado: clic derecho sobre la app, Abrir, Abrir.
   - Sus videos y proyectos viven en `~/EstudioMarketographer/data`. No se borran al actualizar.
   - Cuando haya una versión nueva, la app avisa al abrirla: pulsar "Actualizar".

## Si algo falla
| Pasa esto | Qué hacer |
|---|---|
| "No pude bajar…" o se corta | Es internet. Volver a ejecutar el mismo comando. |
| "El archivo bajado no coincide con su firma" | Se borró solo. Volver a ejecutar el comando. |
| Dice que falta Xcode / herramientas de línea de comandos | Ejecutar `xcode-select --install`, aceptar, y volver a ejecutar el comando. |
| macOS bloquea la app | Clic derecho sobre la app, Abrir, Abrir. |
| La app abre pero Talking Head dice "Falta instalar el motor" | `bash ~/EstudioMarketographer/preparar.sh` y volver a abrir. |
| Puerto 4177 ocupado | Cerrar la otra ventana del Estudio y abrirlo de nuevo. |

Más datos técnicos: [README.md](README.md).
