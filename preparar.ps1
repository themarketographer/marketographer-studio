# Prepara todo lo que el Estudio necesita en Windows, sin tener nada instalado de antes:
#   Node (servidor), uv + Python 3.12 (motor de video), las librerías y los modelos (recorte de fondo y voz).
# Se puede volver a correr cuando quieras: salta lo que ya está listo. Todo queda dentro de la carpeta del Estudio.
# Variable para pruebas: ESTUDIO_SALTAR_MODELOS=1 (no baja Whisper ni el recorte).
$ErrorActionPreference = 'Continue'  # con 'Stop', PowerShell 5 trata cualquier texto que uv escribe en stderr como error
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location $PSScriptRoot
$Root = $PSScriptRoot; $RT = Join-Path $Root '.runtime'; New-Item -ItemType Directory -Force -Path $RT | Out-Null
$Arm = ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64')
$NodeArq = if ($Arm) { 'arm64' } else { 'x64' }; $UvArq = if ($Arm) { 'aarch64' } else { 'x86_64' }
$Req = 'modules\talking-head\engine\requirements.txt'
$Huella = (Get-FileHash -Algorithm SHA256 $Req).Hash.Substring(0, 16).ToLower()
$Host.UI.RawUI.WindowTitle = 'Preparando el Estudio'
function Paso($t) { Write-Host ''; Write-Host $t -ForegroundColor Cyan }
function Falla($m) { Write-Host ''; Write-Host "⚠️  $m" -ForegroundColor Yellow; Set-Content "$RT\error" $m -Encoding UTF8; exit 1 }
function Verifica($archivo, $suma) {
  if ((Get-FileHash -Algorithm SHA256 $archivo).Hash.ToLower() -ne $suma.ToLower()) { Remove-Item $archivo -Force; Falla "El archivo bajado no coincide con su firma ($archivo). Revisa tu internet y vuelve a intentar." }
}
function Baja($url, $destino) {  # curl.exe viene con Windows 10 y 11 y muestra el avance
  & curl.exe -fL --retry 3 --progress-bar -o $destino $url
  if ($LASTEXITCODE -ne 0) { Falla "No pude bajar $url. Revisa tu internet." }
}
Remove-Item "$RT\error" -Force -ErrorAction SilentlyContinue

Paso '1/5 Servidor (Node)'
$NodeExe = "$RT\node\node.exe"
$nodeOk = $false
if (Test-Path $NodeExe) { $nodeOk = $true }
else {
  $v = Get-Command node -ErrorAction SilentlyContinue
  if ($v) { try { if ([int]((& node -p 'process.versions.node.split(".")[0]')) -ge 18) { $nodeOk = $true; Write-Host 'Ya hay Node en este equipo.' } } catch {} }
}
if ($nodeOk) { if (Test-Path $NodeExe) { Write-Host 'Listo.' } }
else {
  try { $sumas = (Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt').Content } catch { Falla 'No pude consultar nodejs.org. Revisa tu internet.' }
  $linea = ($sumas -split "`n" | Where-Object { $_ -match "win-$NodeArq\.zip" } | Select-Object -First 1)
  if (-not $linea) { Falla 'No encontré Node para este equipo.' }
  $parts = $linea.Trim() -split '\s+'; $suma = $parts[0]; $archivo = $parts[1]
  Write-Host "Bajando $archivo ..."
  Baja "https://nodejs.org/dist/latest-v22.x/$archivo" "$RT\node.zip"
  Verifica "$RT\node.zip" $suma
  Remove-Item "$RT\node" -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path "$RT\nodetmp" | Out-Null
  tar -xf "$RT\node.zip" -C "$RT\nodetmp"
  Move-Item (Get-ChildItem "$RT\nodetmp" -Directory | Select-Object -First 1).FullName "$RT\node"
  Remove-Item "$RT\nodetmp", "$RT\node.zip" -Recurse -Force
}

Paso '2/5 Instalador de Python (uv)'
$Uv = "$RT\uv.exe"
if (Test-Path $Uv) { Write-Host 'Listo.' }
else {
  $u = "uv-$UvArq-pc-windows-msvc.zip"; $base = 'https://github.com/astral-sh/uv/releases/latest/download'
  Baja "$base/$u" "$RT\$u"
  try { $suma = ((Invoke-WebRequest -UseBasicParsing -Uri "$base/$u.sha256").Content -split '\s+')[0] } catch { $suma = '' }
  if ($suma) { Verifica "$RT\$u" $suma }
  Remove-Item "$RT\uvtmp" -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force -Path "$RT\uvtmp" | Out-Null
  tar -xf "$RT\$u" -C "$RT\uvtmp"
  Move-Item (Get-ChildItem "$RT\uvtmp" -Recurse -Filter uv.exe | Select-Object -First 1).FullName $Uv
  Remove-Item "$RT\uvtmp", "$RT\$u" -Recurse -Force
}
$env:UV_PYTHON_INSTALL_DIR = "$RT\python"; $env:UV_CACHE_DIR = "$RT\cache"
$Py = "$Root\.venv\Scripts\python.exe"

Paso '3/5 Python 3.12 y librerías de video, voz y recorte (la primera vez tarda unos minutos)'
$venvOk = $false
if (Test-Path $Py) { & $Py -c 'import sys; assert sys.version_info[:2] == (3, 12)' 2>$null; if ($LASTEXITCODE -eq 0) { $venvOk = $true } }
if (-not $venvOk) {
  Remove-Item "$Root\.venv" -Recurse -Force -ErrorAction SilentlyContinue
  & $Uv venv --python 3.12 "$Root\.venv"
  if ($LASTEXITCODE -ne 0) { Falla 'No pude preparar Python.' }
}
$hecha = if (Test-Path "$RT\requisitos") { (Get-Content "$RT\requisitos" -Raw).Trim() } else { '' }
if ($hecha -ne $Huella) {
  & $Uv pip install --python $Py -r $Req
  if ($LASTEXITCODE -ne 0) { Falla 'Falló la instalación de las librerías. Si dice que falta "Microsoft Visual C++", instala el "Visual C++ Redistributable" de Microsoft y vuelve a pegar el comando.' }
  Set-Content "$RT\requisitos" $Huella -Encoding ASCII
} else { Write-Host 'Listo.' }

Paso '4/5 Modelos (recorte de fondo y reconocimiento de voz)'
if ($env:ESTUDIO_SALTAR_MODELOS) { Write-Host 'Omitido.' }
elseif (Test-Path "$RT\modelos2") { Write-Host 'Listo.' }
else {
  $env:PYTHONUTF8 = '1'
  $codigo = @'
import sys
sys.path.insert(0, "modules/talking-head/engine")
import common
common.ensure_model()
from faster_whisper import WhisperModel
WhisperModel("small", device="cpu", compute_type="int8")
print("Modelos listos.")
'@
  $codigo | & $Py -
  if ($LASTEXITCODE -ne 0) { Falla 'No pude bajar los modelos. Revisa tu internet y vuelve a abrir el Estudio.' }
  Set-Content "$RT\modelos2" 'ok' -Encoding ASCII
}
Remove-Item "$RT\cache" -Recurse -Force -ErrorAction SilentlyContinue  # la caché de instalación ya no hace falta

Paso '5/5 Revisión final'
& $Py -c "import cv2, numpy, onnxruntime, faster_whisper, PIL; print('Motor de video: ok')"
if ($LASTEXITCODE -ne 0) { Falla 'El motor no arrancó. Si dice que falta una DLL, instala el "Visual C++ Redistributable" de Microsoft.' }
New-Item -ItemType Directory -Force -Path "$Root\data" | Out-Null
Copy-Item "$Root\VERSION" "$RT\listo" -Force
Write-Host ''; Write-Host '✅ Todo listo.' -ForegroundColor Green
