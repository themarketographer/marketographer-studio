// Almacén simple en archivos JSON dentro de /data. Un archivo por colección.
import fs from 'node:fs';
import path from 'node:path';

export function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = (name) => path.join(dataDir, `${name}.json`);

  function read(name, fallback = []) {
    try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); }
    catch { return fallback; }
  }
  function write(name, value) {
    const tmp = file(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file(name)); // escritura atómica: nunca queda un archivo a medias
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return {
    read, write, uid,
    list: (name) => read(name, []),
    upsert(name, item) {
      const all = read(name, []);
      const i = all.findIndex((x) => x.id === item.id);
      const now = new Date().toISOString();
      if (i >= 0) all[i] = { ...all[i], ...item, actualizado: now };
      else all.push({ id: uid(), creado: now, actualizado: now, ...item });
      write(name, all);
      return i >= 0 ? all[i] : all[all.length - 1];
    },
    remove(name, id) { write(name, read(name, []).filter((x) => x.id !== id)); },
  };
}
