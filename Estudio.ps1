# Estudio Marketographer en Windows: se prepara solo la primera vez, avisa si hay una versión nueva y abre una ventana propia.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
$Root = $PSScriptRoot; Set-Location $Root
$RT = "$Root\.runtime"; $Port = 4177; $Url = "http://localhost:$Port"
$Guarda = Join-Path $env:LOCALAPPDATA 'EstudioMarketographer'; New-Item -ItemType Directory -Force -Path $Guarda | Out-Null
$Perfil = "$Guarda\ventana"
$Repo = 'themarketographer/marketographer-studio'
function Dialogo($texto, $botones = 'OK') { [System.Windows.Forms.MessageBox]::Show($texto, 'Estudio Marketographer', $botones) }
function Mas-Nueva($a, $b) {  # ¿versión $a más nueva que $b? (formato 2026.11.09-4)
  $x = [int[]](($a -replace '-', '.') -split '\.'); $y = [int[]](($b -replace '-', '.') -split '\.')
  for ($i = 0; $i -lt [Math]::Max($x.Count, $y.Count); $i++) { $p = if ($i -lt $x.Count) { $x[$i] } else { 0 }; $q = if ($i -lt $y.Count) { $y[$i] } else { 0 }; if ($p -ne $q) { return $p -gt $q } }
  return $false
}
function Ventana-Abierta { [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Perfil) }) }

# Un clic en el icono con el Estudio ya abierto solo trae su ventana al frente.
if (Ventana-Abierta) {
  $p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Perfil) } | Select-Object -First 1
  try { (New-Object -ComObject WScript.Shell).AppActivate([int]$p.ProcessId) | Out-Null } catch {}
  return
}

# ¿Falta preparar algo? (Node, Python y librerías, modelos)
$Huella = (Get-FileHash -Algorithm SHA256 'modules\talking-head\engine\requirements.txt').Hash.Substring(0, 16).ToLower()
$hecha = if (Test-Path "$RT\requisitos") { (Get-Content "$RT\requisitos" -Raw).Trim() } else { '' }
$nodeListo = (Test-Path "$RT\node\node.exe") -or [bool](Get-Command node -ErrorAction SilentlyContinue)
$listo = $nodeListo -and (Test-Path "$Root\.venv\Scripts\python.exe") -and ($hecha -eq $Huella) -and (Test-Path "$RT\modelos2")
if (-not $listo) {
  $r = Dialogo "Voy a preparar el Estudio por primera vez. Baja unos 1,5 GB y tarda unos minutos. Necesita internet solo esta vez." 'OKCancel'
  if ($r -ne 'OK') { return }
  Remove-Item "$RT\listo", "$RT\error" -Force -ErrorAction SilentlyContinue
  Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$Root\preparar.ps1`"" -Wait
  if (-not (Test-Path "$RT\listo")) { Dialogo "No pude terminar de preparar el Estudio.`n`n$(if (Test-Path "$RT\error") { Get-Content "$RT\error" -Raw })`nRevisa tu internet y vuelve a abrirlo." | Out-Null; return }
}

# ¿Hay una versión nueva en GitHub? (solo si hay internet; no estorba si no)
if (-not $env:ESTUDIO_SIN_ACTUALIZAR) {
  try {
    $remota = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "https://raw.githubusercontent.com/$Repo/main/VERSION").Content.Trim()
    $local = (Get-Content "$Root\VERSION" -Raw).Trim()
    $omitida = if (Test-Path "$Guarda\no-actualizar") { (Get-Content "$Guarda\no-actualizar" -Raw).Trim() } else { '' }
    if ($remota -and (Mas-Nueva $remota $local) -and $omitida -ne $remota) {
      $r = Dialogo "Hay una versión nueva del Estudio ($remota). Tus videos no se tocan.`n`n¿Actualizar ahora?" 'YesNoCancel'
      if ($r -eq 'Yes') { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Root\actualizar.ps1"; Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$Root\preparar.ps1`"" -Wait }
      elseif ($r -eq 'No') { Set-Content "$Guarda\no-actualizar" $remota }
    }
  } catch {}
}

# Servidor y ventana
$Node = if (Test-Path "$RT\node\node.exe") { "$RT\node\node.exe" } else { (Get-Command node).Source }
New-Item -ItemType Directory -Force -Path "$Root\data" | Out-Null
$server = $null
function Responde { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $Url).StatusCode -eq 200 } catch { $false } }
if (-not (Responde)) {
  $server = Start-Process -FilePath $Node -ArgumentList 'server\index.js' -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root\data\estudio.log" -RedirectStandardError "$Root\data\estudio-err.log"
  for ($i = 0; $i -lt 60 -and -not (Responde); $i++) { Start-Sleep -Milliseconds 250 }
}
if ($env:ESTUDIO_AUTO) { Write-Output "Servidor listo en $Url"; if ($server) { Stop-Process -Id $server.Id -Force }; return }  # modo de pruebas: sin ventana

$nav = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($nav) {
  # Ventana propia, sin barra de direcciones ni pestañas. Al cerrarla, se apaga el servidor.
  Start-Process -FilePath $nav -ArgumentList "--app=$Url", "--user-data-dir=`"$Perfil`"", '--window-size=1440,920', '--no-first-run', '--no-default-browser-check' | Out-Null
  Start-Sleep -Seconds 3
  while (Ventana-Abierta) { Start-Sleep -Seconds 2 }
} else {
  Start-Process $Url
  Dialogo "No encontré Edge, Chrome ni Brave, así que abrí el Estudio en tu navegador. Cuando termines, pulsa Aceptar para apagarlo." | Out-Null
}
if ($server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
