# Diagnostico del Estudio en Windows: mide lo que suele frenar la app y deja un resumen en el escritorio (diagnostico-estudio.txt).
#   irm https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/diagnostico.ps1 | iex
# Solo ASCII a proposito, para que se lea igual al ejecutarlo desde internet.
$ErrorActionPreference = 'Continue'
$Dest = if ($env:ESTUDIO_DIR) { $env:ESTUDIO_DIR } else { Join-Path $env:USERPROFILE 'EstudioMarketographer' }
$out = New-Object System.Collections.Generic.List[string]
function L($t) { $out.Add($t); Write-Host $t }
function Tiempo($nombre, $bloque) { $t = Measure-Command { try { & $bloque } catch { L "   error: $_" } }; L ("{0,-34} {1,6:N1} s" -f $nombre, $t.TotalSeconds) }
L "== Equipo"
L ("Windows: " + [Environment]::OSVersion.VersionString + " | " + $env:PROCESSOR_ARCHITECTURE)
L ("Nucleos logicos: " + [Environment]::ProcessorCount)
try { $m = Get-CimInstance Win32_ComputerSystem; L ("Memoria: {0:N1} GB" -f ($m.TotalPhysicalMemory / 1GB)) } catch {}
try { $d = Get-PSDrive -Name ($Dest.Substring(0, 1)); L ("Disco libre: {0:N1} GB" -f ($d.Free / 1GB)) } catch {}
try { $av = Get-MpComputerStatus; L ("Antivirus de Windows activo: " + $av.RealTimeProtectionEnabled) } catch { L "Antivirus: no se pudo consultar" }
L ""; L "== Estudio"
if (-not (Test-Path "$Dest\server\index.js")) { L "No encuentro el Estudio en $Dest"; $out | Set-Content "$([Environment]::GetFolderPath('Desktop'))\diagnostico-estudio.txt"; return }
L ("Version: " + (Get-Content "$Dest\VERSION" -Raw).Trim())
L ("Listo: " + (Test-Path "$Dest\.runtime\listo") + " | modelos: " + (Test-Path "$Dest\.runtime\modelos2"))
$py = "$Dest\.venv\Scripts\python.exe"
L ""; L "== Tiempos (la primera vez Windows revisa cada archivo nuevo; repetirlo debe ser mas rapido)"
Tiempo 'Python arranca' { & $py -c "pass" }
Tiempo 'Importar numpy y opencv' { & $py -c "import numpy, cv2" }
Tiempo 'Importar onnxruntime' { & $py -c "import onnxruntime" }
Tiempo 'Importar faster-whisper' { & $py -c "import faster_whisper" }
Tiempo 'ffmpeg responde' { $f = (Get-ChildItem "$Dest\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-*.exe" | Select-Object -First 1).FullName; & $f -version | Out-Null }
L ""; L "== Servidor"
try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri 'http://localhost:4177/api/modules'; L ("Responde: " + $r.StatusCode) } catch { L "No responde en el puerto 4177 (abre primero el Estudio)" }
foreach ($f in @("$Dest\data\estudio-err.log", "$Dest\data\estudio.log")) { if (Test-Path $f) { L ""; L "== $([IO.Path]::GetFileName($f)) (ultimas lineas)"; Get-Content $f -Tail 15 | ForEach-Object { L $_ } } }
$ult = Get-ChildItem "$Dest\data\th" -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($ult) {
  L ""; L "== Ultimo proyecto: $($ult.Name)"
  Get-ChildItem $ult.FullName | Select-Object Name, Length | ForEach-Object { L ("{0,-22} {1,12:N0}" -f $_.Name, $_.Length) }
  if (Test-Path "$($ult.FullName)\status.json") { L ("status: " + (Get-Content "$($ult.FullName)\status.json" -Raw)) }
  if (Test-Path "$($ult.FullName)\motor.log") { L "== motor.log (ultimas lineas)"; Get-Content "$($ult.FullName)\motor.log" -Tail 25 | ForEach-Object { L $_ } }
}
$archivo = "$([Environment]::GetFolderPath('Desktop'))\diagnostico-estudio.txt"
$out | Set-Content $archivo -Encoding UTF8
Write-Host ""; Write-Host "Listo. Mandame el archivo $archivo" -ForegroundColor Green
