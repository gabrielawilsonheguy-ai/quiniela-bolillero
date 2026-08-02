// scrape.mjs
// Trae los resultados de la Quiniela de la Ciudad (ex-Nacional) desde ruta1000
// y actualiza docs/data/resultados.json sin pisar lo ya guardado.
//
// Cómo funciona la fuente (quinielanacional.ruta1000.com.ar):
//  - La página muestra primero la sección "Ex-Nacional" (5 sorteos) y después
//    la de "Buenos Aires". Nos quedamos SOLO con la primera.
//  - Los números salen en celdas <td>. Cada sorteo aporta 20 valores (4 dígitos
//    o "----" si todavía no se sorteó), en este orden:
//      bloque de arriba: posiciones 1-5 de los 5 sorteos (25 valores)
//      bloque de abajo:  posiciones 6-20 de los 5 sorteos (75 valores)
//  - Reconstruimos cada sorteo como top[1-5] + bottom[6-20] = 20 números.
//
// Si algún día cambian el HTML y se rompe, avisá: se ajustan los "anclas" de abajo.

import { load } from "cheerio";
import fs from "node:fs";
import path from "node:path";

const URL = "http://quinielanacional.ruta1000.com.ar/";
const SORTEOS = ["previa", "primera", "matutina", "vespertina", "nocturna"];
const OUT = path.resolve(process.cwd(), "docs/data/resultados.json");

const isValue = (s) => /^\d{4}$/.test(s) || /^-{2,4}$/.test(s);
const isDrawn = (n) => /^\d{4}$/.test(n);

async function fetchHtml() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (quiniela-db bot)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${URL}`);
  // La página está en ISO-8859-1 (latin1)
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("latin1");
}

function parseFecha(html) {
  // El primer "RESULTADOS DEL <día> DD/MM/YYYY" es el de la sección Nacional.
  const m = html.match(/RESULTADOS DEL[^0-9]*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Fallback: fecha de hoy en horario Argentina (UTC-3)
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function parseSorteos(html) {
  const $ = load(html);
  const cells = [];
  $("td").each((_, el) =>
    cells.push($(el).text().replace(/\s+/g, " ").trim())
  );

  // Aislar la sección Nacional: desde el primer "Ex-Nacional" hasta el primer
  // "Buenos Aires" que aparezca después.
  let start = cells.findIndex((c) => /ex-?nacional/i.test(c));
  if (start === -1) start = 0;
  let end = cells.findIndex((c, i) => i > start && /buenos\s+aires/i.test(c));
  if (end === -1) end = cells.length;

  const values = cells.slice(start, end).filter(isValue).slice(0, 100);
  if (values.length < 25) {
    throw new Error(
      `Solo encontré ${values.length} valores en la sección Nacional; el HTML puede haber cambiado.`
    );
  }

  const top = values.slice(0, 25); // posiciones 1-5 x 5 sorteos
  const bottom = values.slice(25, 100); // posiciones 6-20 x 5 sorteos

  const out = {};
  SORTEOS.forEach((s, i) => {
    const nums = [
      ...top.slice(i * 5, i * 5 + 5),
      ...bottom.slice(i * 15, i * 15 + 15),
    ];
    if (nums.length === 20 && nums.every(isDrawn)) out[s] = nums;
  });
  return out;
}

function loadDb() {
  if (fs.existsSync(OUT)) {
    try {
      return JSON.parse(fs.readFileSync(OUT, "utf8"));
    } catch {
      /* si está corrupto, arrancamos limpio */
    }
  }
  return {
    updated: null,
    fuente: "quinielanacional.ruta1000.com.ar (Quiniela de la Ciudad, ex-Nacional)",
    sorteos: {},
  };
}

async function main() {
  const html = await fetchHtml();
  const fecha = parseFecha(html);
  const nuevos = parseSorteos(html);

  const db = loadDb();
  db.sorteos[fecha] = { ...(db.sorteos[fecha] || {}), ...nuevos };
  db.updated = new Date().toISOString();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(db, null, 2) + "\n");

  const listos = Object.keys(nuevos);
  if (listos.length) {
    console.log(`✔ ${fecha}: guardados -> ${listos.join(", ")}`);
  } else {
    console.log(`• ${fecha}: todavía no hay sorteos completos (sin cambios nuevos)`);
  }
}

main().catch((err) => {
  console.error("✘ Error en el scraper:", err.message);
  process.exit(1);
});
