# Instala (o actualiza) el Estudio Marketographer en Windows 10 u 11. No hace falta tener Node, Python ni Git: todo se baja solo.
#   irm https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.ps1 | iex
# Variables opcionales: ESTUDIO_DIR (donde vive; por defecto %USERPROFILE%\EstudioMarketographer), ESTUDIO_REPO, ESTUDIO_RAMA,
# ESTUDIO_SIN_ATAJOS=1 (no crea accesos directos), ESTUDIO_SALTAR_MODELOS=1 (solo para pruebas).
# Este archivo es solo ASCII a proposito: asi se lee igual al ejecutarlo directo desde internet.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo = if ($env:ESTUDIO_REPO) { $env:ESTUDIO_REPO } else { 'themarketographer/marketographer-studio' }
$Rama = if ($env:ESTUDIO_RAMA) { $env:ESTUDIO_RAMA } else { 'main' }
$Dest = if ($env:ESTUDIO_DIR) { $env:ESTUDIO_DIR } else { Join-Path $env:USERPROFILE 'EstudioMarketographer' }
if ($env:OS -ne 'Windows_NT') { Write-Host 'Este instalador es solo para Windows. En Mac usa instalar.sh.'; return }

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('estudio_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
try {
  Write-Host ''; Write-Host "Bajando el codigo ($Rama)" -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$Repo/archive/refs/heads/$Rama.zip" -OutFile "$Tmp\codigo.zip"
  New-Item -ItemType Directory -Force -Path "$Tmp\src" | Out-Null
  tar -xf "$Tmp\codigo.zip" -C "$Tmp\src"
  $Src = (Get-ChildItem "$Tmp\src" -Directory | Select-Object -First 1).FullName
  if (-not (Test-Path "$Src\server\index.js")) { throw 'El archivo bajado no se ve bien.' }
  # Copia el codigo sin tocar tus videos (data), ni lo ya instalado (Python, modelos).
  robocopy $Src $Dest /E /XD data .venv .runtime node_modules models .git /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'No pude copiar el codigo.' }
} finally { Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue }

Set-Location $Dest
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Dest\preparar.ps1"
if ($LASTEXITCODE -ne 0) { throw 'No pude terminar de preparar el Estudio. Revisa tu internet y vuelve a pegar el mismo comando.' }

if (-not $env:ESTUDIO_SIN_ATAJOS) {
  $Ws = New-Object -ComObject WScript.Shell
  $Guarda = Join-Path $env:LOCALAPPDATA 'EstudioMarketographer'; New-Item -ItemType Directory -Force -Path $Guarda | Out-Null
  Set-Content -Path "$Guarda\ruta" -Value $Dest -Encoding ASCII
  foreach ($carpeta in @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))) {
    if (-not $carpeta -or -not (Test-Path $carpeta)) { continue }
    $a = $Ws.CreateShortcut((Join-Path $carpeta 'Estudio Marketographer.lnk'))
    $a.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $a.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dest\Estudio.ps1`""
    $a.WorkingDirectory = $Dest
    if (Test-Path "$Dest\web\logo.ico") { $a.IconLocation = "$Dest\web\logo.ico" }
    $a.Save()
  }
  Write-Host ''; Write-Host 'Listo. Abre "Estudio Marketographer" desde el escritorio o desde el menu Inicio.' -ForegroundColor Green
} else { Write-Host ''; Write-Host "Listo en $Dest." -ForegroundColor Green }
