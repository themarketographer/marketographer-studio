# Instalar el Estudio Marketographer con tu Claude

Funciona en **Mac** (Apple Silicon o Intel) y en **Windows 10 u 11**. No necesitas Homebrew, Node, Python ni Git: el instalador baja todo solo.
Necesitas internet, unos **3 GB libres** en el disco y unos 5 a 15 minutos la primera vez.

## Lo que tienes que hacer tú
Abre Claude Code (o Claude Cowork con acceso a tu computador) y pégale esto:

> Instala el Estudio Marketographer en mi computador siguiendo las instrucciones de https://github.com/themarketographer/marketographer-studio/blob/main/INSTALAR-CON-CLAUDE.md y avísame cuando esté abierto.

## Instrucciones para Claude (sigue esto al pie de la letra)
1. Detecta el sistema: en Mac `uname` dice `Darwin`; en Windows existe la variable `OS=Windows_NT`. Si es Linux, dile al alumno que por ahora solo funciona en Mac y Windows y detente.
2. Comprueba que hay al menos 3 GB libres (`df -h ~` en Mac; `Get-PSDrive C` en Windows). Si no, díselo.
3. Ejecuta el instalador. Tarda varios minutos y descarga ~1,5 GB: córrelo en segundo plano o con tiempo de espera largo y avisa al alumno de que es normal esperar. Puede repetirse cuando quieras: actualiza el código y no toca los videos del alumno. Si falla por internet, repite el comando: salta lo que ya bajó.

   **Mac** (Terminal):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.sh | bash
   ```
   Instala en `~/EstudioMarketographer` y crea la app **Estudio Marketographer** en Aplicaciones (o en `~/Applications` si no hay permiso).

   **Windows** (PowerShell; si solo tienes Git Bash o cmd, usa `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.ps1 | iex"`):
   ```powershell
   irm https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.ps1 | iex
   ```
   Instala en `%USERPROFILE%\EstudioMarketographer` y crea el acceso directo **Estudio Marketographer** en el escritorio y en el menú Inicio.
4. Verifica que quedó listo: debe existir `.runtime/listo` dentro de la carpeta `EstudioMarketographer` (en Windows, `.runtime\listo`).
5. Ábrelo. Se abre en su propia ventana.
   - Mac: `open "/Applications/Estudio Marketographer.app"` (o la de `~/Applications`).
   - Windows: `Start-Process "$([Environment]::GetFolderPath('Desktop'))\Estudio Marketographer.lnk"`.
   - Comprueba que responde: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4177` debe dar `200` (en Windows: `(Invoke-WebRequest -UseBasicParsing http://localhost:4177).StatusCode`).
6. Dile al alumno:
   - Para abrirlo otra vez: el icono de la app (Mac) o el acceso directo del escritorio o del menú Inicio (Windows).
   - Mac: para fijarlo en el Dock, clic derecho en el icono con la app abierta, Opciones, Mantener en el Dock. Si macOS pregunta por una app de un desarrollador no identificado: clic derecho sobre la app, Abrir, Abrir.
   - Windows: para fijarlo, clic derecho en el acceso directo, "Anclar a la barra de tareas".
   - Sus videos y proyectos viven en la carpeta `EstudioMarketographer\data`. No se borran al actualizar.
   - Cuando haya una versión nueva, la app avisa al abrirla: pulsar "Actualizar".
   - En Windows la vista previa y la exportación usan el procesador, así que tardan más que en una Mac con chip Apple.

## Si algo falla
| Pasa esto | Qué hacer |
|---|---|
| "No pude bajar…" o se corta | Es internet. Volver a ejecutar el mismo comando. |
| "El archivo bajado no coincide con su firma" | Se borró solo. Volver a ejecutar el comando. |
| Mac: dice que faltan herramientas de línea de comandos | `xcode-select --install`, aceptar, y volver a ejecutar el comando. |
| Mac: macOS bloquea la app | Clic derecho sobre la app, Abrir, Abrir. |
| Windows: el comando dice que la ejecución de scripts está deshabilitada | Usar la versión con `powershell -NoProfile -ExecutionPolicy Bypass -Command "…"` del paso 3. |
| Windows: falla una librería o falta una DLL ("Visual C++") | Instalar el "Microsoft Visual C++ Redistributable" (x64) desde microsoft.com y volver a ejecutar el comando. |
| Windows: el antivirus detiene la instalación | Permitir la carpeta `EstudioMarketographer` y volver a ejecutar el comando. |
| Windows: va lento o una función no carga | Ejecutar `irm https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/diagnostico.ps1 \| iex` y mandar el archivo `diagnostico-estudio.txt` del escritorio. |
| La app abre pero Talking Head dice "Falta instalar el motor" | Volver a ejecutar el comando de instalación del paso 3. |
| Puerto 4177 ocupado | Cerrar la otra ventana del Estudio y abrirlo de nuevo. |

Más datos técnicos: [README.md](README.md).
