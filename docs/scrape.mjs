// scrape.mjs
// Robot diario. Lee la página "al día" de ruta1000 (Quiniela de la Ciudad, ex-Nacional),
// que muestra los últimos sorteos apenas salen, y suma los nuevos a
// docs/data/resultados.json sin pisar lo que ya haya. Corre 5 veces por día.

import fs from "node:fs";
import path from "node:path";

const URL =
  "https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional";
const OUT = path.resolve(process.cwd(), "docs/data/resultados.json");

const MESES = {
  ENERO: "01", FEBRERO: "02", MARZO: "03", ABRIL: "04", MAYO: "05",
  JUNIO: "06", JULIO: "07", AGOSTO: "08", SEPTIEMBRE: "09", SETIEMBRE: "09",
  OCTUBRE: "10", NOVIEMBRE: "11", DICIEMBRE: "12",
};
const HORA2SORTEO = {
  "10:15": "previa", "12:00": "primera", "15:00": "matutina",
  "18:00": "vespertina", "21:00": "nocturna",
};

async function fetchText() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (quiniela-db bot)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // ISO-8859-1 -> texto; sacamos etiquetas HTML y normalizamos espacios
  return buf
    .toString("latin1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function parse(text) {
  // Cada bloque arranca con: "... DEL <día> DE <MES> DE <año> <hh:mm>"
  const headerRe =
    /DEL\s+(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚÑ]+)\s+DE\s+(\d{4})\s+(\d{2}):(\d{2})/gi;
  const heads = [];
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    heads.push({
      idx: m.index, end: headerRe.lastIndex,
      d: m[1], mes: m[2].toUpperCase(), y: m[3], hh: m[4], mm: m[5],
    });
  }

  const out = {};
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const stop = i + 1 < heads.length ? heads[i + 1].idx : text.length;
    let block = text.slice(h.end, stop);
    const cut = block.search(/Sorteo\s+de\s+Letras|Vencimiento/i);
    if (cut >= 0) block = block.slice(0, cut);

    const mesNum = MESES[h.mes];
    const sorteo = HORA2SORTEO[`${h.hh}:${h.mm}`];
    if (!mesNum || !sorteo) continue;
    const iso = `${h.y}-${mesNum}-${String(h.d).padStart(2, "0")}`;

    // Los números vienen como "1º 9150 6º 7717 ..." (posición + valor).
    // Uso la posición para ubicarlos, porque están impresos por columnas.
    const pairRe = /(\d{1,2})[º°\u00ba\u00b0]\s*(\d{4})/g;
    const arr = new Array(20).fill(null);
    let p;
    while ((p = pairRe.exec(block)) !== null) {
      const pos = +p[1];
      if (pos >= 1 && pos <= 20) arr[pos - 1] = p[2];
    }
    if (arr.every((x) => x && /^\d{4}$/.test(x))) {
      out[iso] = out[iso] || {};
      out[iso][sorteo] = arr;
    }
  }
  return out;
}

function loadDb() {
  if (fs.existsSync(OUT)) {
    try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}
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
  const nuevos = parse(text);

  const db = loadDb();
  let agregados = 0;
  const fechas = new Set();
  for (const [iso, sorteos] of Object.entries(nuevos)) {
    db.sorteos[iso] = db.sorteos[iso] || {};
    for (const [s, nums] of Object.entries(sorteos)) {
      if (!db.sorteos[iso][s]) {
        db.sorteos[iso][s] = nums;
        agregados++;
        fechas.add(iso);
      }
    }
  }

  // reordenar fechas ascendente
  const ordered = {};
  Object.keys(db.sorteos).sort().forEach((f) => {
    const o = {};
    ["previa", "primera", "matutina", "vespertina", "nocturna"].forEach((s) => {
      if (db.sorteos[f][s]) o[s] = db.sorteos[f][s];
    });
    ordered[f] = o;
  });
  db.sorteos = ordered;
  db.updated = new Date().toISOString();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(db, null, 2) + "\n");

  if (agregados) {
    console.log(`✔ ${agregados} sorteos nuevos en ${fechas.size} fechas: ${[...fechas].join(", ")}`);
  } else {
    console.log("• Sin sorteos nuevos por ahora (la fuente aún no publicó nada nuevo).");
  }
}

main().catch((err) => {
  console.error("✘ Error en el scraper:", err.message);
  process.exit(1);
});
