// Traduce el final de motor.log a un mensaje que diga qué pasó y qué hacer, sin jerga.
// Prueba:  node modules/talking-head/errores.js
const CASOS = [
  [/No space left|ENOSPC|Errno 28/i, 'Tu disco está lleno. Abre un proyecto que ya publicaste, toca los tres puntos y elige "Liberar espacio". Después vuelve a intentar.'],
  [/MemoryError|out of memory|Cannot allocate|std::bad_alloc|Killed: 9/i, 'La computadora se quedó sin memoria. Cierra otros programas (sobre todo el navegador con muchas pestañas) y vuelve a intentar.'],
  [/moov atom not found|Invalid data found|could not find codec|cv2\.error|Could not open|can't open|Cannot read properties of undefined/i, 'No pude leer este video. Ábrelo en QuickTime, usa Archivo, Exportar como, 1080p, y sube ese archivo nuevo.'],
  [/ModuleNotFoundError|No module named|ImportError/i, 'Al motor le falta una pieza. Cierra el Estudio y vuelve a abrirlo: se repara solo (necesita internet).'],
  [/URLError|HTTPError|ConnectionError|getaddrinfo|Temporary failure in name resolution|Max retries exceeded/i, 'El motor necesita internet para bajar un modelo la primera vez. Conéctate y vuelve a intentar.'],
  [/No such file or directory.*(source|proxy|alpha)\.mp4/i, 'Falta el video original de este proyecto. Si liberaste espacio a mano, vuelve a subir el video.'],
];

export function explicarError(log) {
  const lineas = String(log || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const cola = lineas.slice(-40).join('\n');
  const hit = CASOS.find(([re]) => re.test(cola));
  return {
    error: hit ? hit[1] : 'El motor se detuvo por un error que no reconozco. Vuelve a intentar. Si se repite, toca "Copiar detalle" y pásaselo a tu Claude.',
    detalle: lineas.slice(-6).join('\n').slice(0, 900),
  };
}

if (process.argv[1] && process.argv[1].endsWith('errores.js')) {
  const { strict: a } = await import('node:assert');
  a.match(explicarError('Traceback...\nOSError: [Errno 28] No space left on device').error, /disco está lleno/);
  a.match(explicarError('[mov,mp4] moov atom not found\nError opening input').error, /No pude leer este video/);
  a.match(explicarError('ModuleNotFoundError: No module named mlx').error, /falta una pieza/);
  a.match(explicarError('urllib.error.URLError: <urlopen error>').error, /internet/);
  a.match(explicarError('MemoryError').error, /sin memoria/);
  const raro = explicarError('linea 1\nValueError: algo raro');
  a.match(raro.error, /no reconozco/); a.equal(raro.detalle, 'linea 1\nValueError: algo raro');
  a.match(explicarError('').error, /no reconozco/);
  console.log('errores: 8 comprobaciones pasan');
}
