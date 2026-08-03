// scrape.mjs
// Robot diario. Lee la página "SOLO RESULTADOS" de la Quiniela de la Ciudad (ex-Nacional),
// que muestra los sorteos de HOY al minuto, y suma los que ya salieron a
// docs/data/resultados.json sin pisar lo que ya haya. Corre 5 veces por día.

import fs from "node:fs";
import path from "node:path";

const URL = "https://quinieladelaciudad.ruta1000.com.ar/";
const OUT = path.resolve(process.cwd(), "docs/data/resultados.json");
const SORTEOS = ["previa", "primera", "matutina", "vespertina", "nocturna"];

async function fetchText() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (quiniela-db bot)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // ISO-8859-1 -> texto; sacamos etiquetas HTML y normalizamos espacios
  return buf.toString("latin1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function parse(text) {
  // Aislar la sección de la Ciudad (Ex-Nacional), hasta que empieza Buenos Aires.
  const start = text.search(/ex-?nacional/i);
  const s = start >= 0 ? text.slice(start) : text;
  const end = s.search(/buenos\s+aires/i);
  const ciudad = end >= 0 ? s.slice(0, end) : s;

  const md =
    ciudad.match(/RESULTADOS DEL[^0-9]*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    text.match(/RESULTADOS DEL[^0-9]*(\d{2})\/(\d{2})\/(\d{4})/i);
  const iso = md ? `${md[3]}-${md[2]}-${md[1]}` : null;

  // Pares "posición valor" (valor = 4 dígitos o "----" si no salió).
  // La página muestra: bloque de arriba (pos 1-5 de los 5 turnos) y
  // bloque de abajo (pos 6-20 de los 5 turnos). Reconstruimos cada turno.
  const re = /(\d{1,2})[º°\u00ba\u00b0]\s*(\d{4}|-{2,4})/g;
  const vals = [];
  let m;
  while ((m = re.exec(ciudad)) !== null) vals.push(m[2]);

  const top = vals.slice(0, 25);
  const bottom = vals.slice(25, 100);
  const out = {};
  SORTEOS.forEach((so, i) => {
    const nums = [
      ...top.slice(i * 5, i * 5 + 5),
      ...bottom.slice(i * 15, i * 15 + 15),
    ];
    if (nums.length === 20 && nums.every((x) => /^\d{4}$/.test(x))) out[so] = nums;
  });
  return { iso, out };
}

function loadDb() {
  if (fs.existsSync(OUT)) {
    try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}
  }
  return {
    updated: null,
    fuente: "quinieladelaciudad.ruta1000.com.ar (Quiniela de la Ciudad, ex-Nacional)",
    sorteos: {},
  };
}

async function main() {
  const text = await fetchText();
  const { iso, out } = parse(text);
  if (!iso) throw new Error("No pude leer la fecha del sorteo (¿cambió la página?).");

  const db = loadDb();
  let agregados = 0;
  const listos = [];
  db.sorteos[iso] = db.sorteos[iso] || {};
  for (const [so, nums] of Object.entries(out)) {
    if (!db.sorteos[iso][so]) {
      db.sorteos[iso][so] = nums;
      agregados++;
      listos.push(so);
    }
  }

  // reordenar prolijo
  const ordered = {};
  Object.keys(db.sorteos).sort().forEach((f) => {
    const o = {};
    SORTEOS.forEach((so) => { if (db.sorteos[f][so]) o[so] = db.sorteos[f][so]; });
    ordered[f] = o;
  });
  db.sorteos = ordered;
  db.updated = new Date().toISOString();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(db, null, 2) + "\n");

  if (agregados) console.log(`✔ ${iso}: guardados -> ${listos.join(", ")}`);
  else console.log(`• ${iso}: sin sorteos nuevos todavía (nada para guardar).`);
}

main().catch((err) => {
  console.error("✘ Error en el scraper:", err.message);
  process.exit(1);
});
