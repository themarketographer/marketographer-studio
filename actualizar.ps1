# Baja la última versión del Estudio desde GitHub y la pone encima del código. No toca tus videos (data), ni lo ya instalado (Python, modelos).
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location $PSScriptRoot
$Repo = if ($env:ESTUDIO_REPO) { $env:ESTUDIO_REPO } else { 'themarketographer/marketographer-studio' }
$Rama = if ($env:ESTUDIO_RAMA) { $env:ESTUDIO_RAMA } else { 'main' }
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('estudio_' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Force -Path "$Tmp\src" | Out-Null
try {
  Write-Host 'Bajando la última versión...'
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$Repo/archive/refs/heads/$Rama.zip" -OutFile "$Tmp\codigo.zip"
  tar -xf "$Tmp\codigo.zip" -C "$Tmp\src"
  $Src = (Get-ChildItem "$Tmp\src" -Directory | Select-Object -First 1).FullName
  if (-not (Test-Path "$Src\server\index.js")) { throw 'El archivo bajado no se ve bien.' }
  robocopy $Src $PSScriptRoot /E /XD data .venv .runtime node_modules models .git /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'No pude copiar el código.' }
  Write-Host "Listo: versión $((Get-Content "$PSScriptRoot\VERSION" -Raw).Trim())."
} finally { Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue }
