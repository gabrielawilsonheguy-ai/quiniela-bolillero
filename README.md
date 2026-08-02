# Bolillero — Base de datos automática de la Quiniela de la Ciudad (ex-Nacional)

Un scraper que corre solo tras cada sorteo, guarda los **20 números de los 5 turnos**
(Previa, Primera, Matutina, Vespertina, Nocturna) en un archivo JSON, y una app web
que muestra la base de datos + análisis (frecuencias, atrasos, tablero 00–99 y ranking α).

Vos no cargás nada. El robot lo hace por vos.

```
quiniela-db/
├─ scraper/
│  ├─ scrape.mjs          ← el robot (trae y parsea los resultados)
│  └─ package.json
├─ docs/                  ← esto es lo que se publica en la web
│  ├─ index.html          ← la app
│  └─ data/resultados.json← la base de datos (la actualiza el robot)
├─ .github/workflows/
│  └─ scrape.yml          ← el reloj: corre el robot 5 veces por día
└─ README.md
```

---

## Puesta en marcha (una sola vez, ~10 min)

### 1) Subir el proyecto a GitHub
1. Creá un repositorio nuevo en https://github.com (puede ser privado).
2. Subí todos estos archivos manteniendo las carpetas tal cual están.
   - Si usás la web de GitHub: "Add file → Upload files" y arrastrá todo.

### 2) Encender el robot (GitHub Actions)
1. En el repo, andá a la pestaña **Actions** y aceptá activar los workflows.
2. Entrá a **"Scrape Quiniela" → Run workflow** para probarlo a mano una vez.
   - Si funciona, vas a ver un commit nuevo tipo "Resultados 2026-…".
3. Listo: de ahí en más corre solo tras cada sorteo (horarios ya configurados).

> Los horarios están en `scrape.yml`, en UTC. Argentina es UTC−3. Si algún día
> cambian los horarios de los sorteos, se ajustan ahí.

### 3) Publicar la app
**Opción A – Netlify (recomendada, la que ya usás):**
1. En Netlify: "Add new site → Import an existing project" y elegí el repo.
2. En configuración de build:
   - Build command: *(vacío)*
   - **Publish directory: `docs`**
3. Deploy. Cada vez que el robot guarde datos nuevos, Netlify vuelve a publicar solo.

**Opción B – GitHub Pages (gratis, sin salir de GitHub):**
1. Settings → Pages → Source: "Deploy from a branch".
2. Branch: `main`, carpeta: **`/docs`**. Guardá.
3. En un ratito queda online en `https://TU-USUARIO.github.io/TU-REPO/`.

---

## ¿Cómo sabe leer los resultados?
La fuente es `quinielanacional.ruta1000.com.ar`, que publica los 5 turnos con sus 20
posiciones. El scraper aísla la sección "Ex-Nacional" (descarta la de Buenos Aires),
toma los 100 valores en orden y reconstruye cada turno como
`posiciones 1–5 + posiciones 6–20`. Si un turno todavía no se sorteó (aparece "----"),
no lo guarda; lo completa cuando vuelve a correr.

Es **idempotente**: podés correrlo muchas veces sin duplicar nada.

---

## Datos precargados

La base ya viene con historial real cargado (22 fechas, aprox. del 08/06 al 30/07/2026).
Quedó un hueco en el medio de julio: eso se completa solo con el paso de backfill (abajo).

## Completar el historial reciente (rellenar julio) — una sola vez

Después de activar Actions, andá a **Actions → "Backfill historial" → Run workflow**.
Ese robot entra en vivo a la página de "últimas 100 jugadas" de ruta1000 y suma las
últimas ~20 fechas (tapa el hueco de julio). Se corre a mano; con una vez alcanza.

## ¿Cómo queda automatizado? (las dos piezas)

- **GitHub** guarda el proyecto y ahí vive el robot. El robot (workflow "Scrape Quiniela")
  corre 5 veces por día tras cada sorteo, entra a ruta1000, saca los 20 números y los
  guarda en `docs/data/resultados.json`.
- **Netlify** solo publica la página. Está enganchado al repo de GitHub, así que cuando el
  robot guarda datos nuevos, Netlify vuelve a publicar solo.

O sea: subís el proyecto a GitHub (ahí se enciende el robot) y conectás ese repo a Netlify
(ahí se ve). Hecho eso, no tocás más nada: se carga solo, todos los días.

## Personalizar

- **Cambiar horarios del robot:** editá los `cron` en `.github/workflows/scrape.yml`.
- **Cargar más historial viejo:** ruta1000 tiene páginas de "años anteriores" e incluso
  exportación a Excel. Si querés cargar meses o años de un saque, se puede ampliar el backfill.

---

*Jugar compulsivamente es perjudicial para la salud. Esta herramienta es para registro
y análisis estadístico; no predice resultados.*
