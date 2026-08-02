// backfill.mjs
// Relleno de historial reciente (una sola vez, o cuando quieras).
// Lee EN VIVO la página de "últimas 100 jugadas" de ruta1000 (unas ~20 fechas)
// y las suma a docs/data/resultados.json sin pisar lo que ya haya.
//
// Correlo con:  node scraper/backfill.mjs

import fs from "node:fs";
import path from "node:path";

const URL =
  "https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores";
const HORA2SORTEO = {
  "10:15": "previa",
  "12:00": "primera",
  "15:00": "matutina",
  "18:00": "vespertina",
  "21:00": "nocturna",
};
const OUT = path.resolve(process.cwd(), "docs/data/resultados.json");

async function fetchText() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (quiniela-db bot)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // ISO-8859-1 -> texto; sacamos tags y normalizamos espacios
  return buf
    .toString("latin1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function loadDb() {
  if (fs.existsSync(OUT)) {
    try {
      return JSON.parse(fs.readFileSync(OUT, "utf8"));
    } catch {}
  }
  return {
    updated: null,
    fuente:
      "quinielanacional.ruta1000.com.ar (Quiniela de la Ciudad, ex-Nacional)",
    sorteos: {},
  };
}

async function main() {
  const text = await fetchText();
  // Cada jugada: DD/MM/YYYY  HH:MM  n1..n20
  const re =
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s+((?:\d{4}\s+){19}\d{4})/g;

  const db = loadDb();
  let nuevos = 0,
    fechas = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    const sorteo = HORA2SORTEO[`${m[4]}:${m[5]}`];
    if (!sorteo) continue;
    const nums = m[6].trim().split(/\s+/);
    if (nums.length !== 20) continue;
    db.sorteos[iso] = db.sorteos[iso] || {};
    if (!db.sorteos[iso][sorteo]) {
      db.sorteos[iso][sorteo] = nums;
      nuevos++;
      fechas.add(iso);
    }
  }

  // reordenar fechas ascendente
  const ordered = {};
  Object.keys(db.sorteos)
    .sort()
    .forEach((f) => {
      const o = {};
      ["previa", "primera", "matutina", "vespertina", "nocturna"].forEach(
        (s) => {
          if (db.sorteos[f][s]) o[s] = db.sorteos[f][s];
        }
      );
      ordered[f] = o;
    });
  db.sorteos = ordered;
  db.updated = new Date().toISOString();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(db, null, 2) + "\n");
  console.log(
    `✔ Backfill: ${nuevos} sorteos nuevos en ${fechas.size} fechas. Total ahora: ${Object.keys(
      db.sorteos
    ).length} fechas.`
  );
}

main().catch((err) => {
  console.error("✘ Error en backfill:", err.message);
  process.exit(1);
});
