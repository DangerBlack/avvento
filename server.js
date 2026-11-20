#!/usr/bin/env node
/* ============================================================================
   Server del calendario. Zero dipendenze: solo Node 18+.

     node server.js                     porta 8080
     PORT=3000 node server.js
     AVVENTO_OGGI=2026-12-14 node server.js   finge che sia un altro giorno
     AVVENTO_PROVA=1 node server.js           tutte le porticine aperte (test)

   Il file dati/calendario.json viene ricaricato da solo quando lo salvi.
   ========================================================================== */

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { watch } from "node:fs";
import { networkInterfaces } from "node:os";
import { createHash } from "node:crypto";
import * as Stampa from "./stampa.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = path.dirname(fileURLToPath(import.meta.url));
const FILE_DATI = path.join(RADICE, "dati", "calendario.json");
const CARTELLA = path.join(RADICE, "pubblico");
const CARTELLA_STAMPA = path.join(RADICE, "stampa");

const PORTA = Number(process.env.PORT || 8080);
const PROVA = process.env.AVVENTO_PROVA === "1";
const ABILITA_STAMPA = process.env.AVVENTO_STAMPA === "1";
const PAROLA_STAMPA = (process.env.AVVENTO_STAMPA_PAROLA || "").trim();
const CHIAVE = (process.env.AVVENTO_CHIAVE || "").trim();
const NOME_COOKIE_CHIAVE = "avvento_chiave";
const IMPRONTA_CHIAVE = CHIAVE
  ? createHash("sha256").update(CHIAVE).digest("hex").slice(0, 32)
  : "";
const NOME_COOKIE = "avvento_stampa";
const IMPRONTA = PAROLA_STAMPA
  ? createHash("sha256").update(PAROLA_STAMPA).digest("hex").slice(0, 32)
  : "";
const OGGI_FINTO = (process.env.AVVENTO_OGGI || "").trim();

const TIPI = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/* ------------------------------------------------------------------ dati */

let dati = null;

function valida(d) {
  const problemi = [];
  if (!d || typeof d !== "object") return ["il file non contiene un oggetto JSON"];
  if (!Number.isInteger(d.anno)) problemi.push('"anno" deve essere un numero, es. 2026');
  if (!Array.isArray(d.giorni)) return problemi.concat('"giorni" deve essere un elenco');

  if (d.media && !/^https?:\/\//i.test(String(d.media))) {
    problemi.push('"media" deve essere un indirizzo completo, es. https://bucket.s3.eu-west-1.amazonaws.com/avvento');
  }
  if (d.giorni.length !== 25) problemi.push(`ci sono ${d.giorni.length} giorni invece di 25`);

  const giorniVisti = new Set();
  const codiciVisti = new Map();

  d.giorni.forEach((g, i) => {
    const dove = `giorno #${i + 1}`;
    if (!Number.isInteger(g.giorno) || g.giorno < 1 || g.giorno > 25) {
      problemi.push(`${dove}: "giorno" deve essere un numero da 1 a 25`);
    } else if (giorniVisti.has(g.giorno)) {
      problemi.push(`giorno ${g.giorno} ripetuto`);
    } else {
      giorniVisti.add(g.giorno);
    }

    const codice = String(g.codice || "").toUpperCase();
    if (!/^[A-Z]{4}$/.test(codice)) {
      problemi.push(`${dove}: "codice" deve essere di 4 lettere (trovato: "${g.codice}")`);
    } else if (codiciVisti.has(codice)) {
      problemi.push(`codice "${codice}" usato due volte (giorni ${codiciVisti.get(codice)} e ${g.giorno})`);
    } else {
      codiciVisti.set(codice, g.giorno);
    }

    if (!String(g.indizio || "").trim()) problemi.push(`${dove}: manca l'"indizio"`);
    if (!g.svela || typeof g.svela !== "object") {
      problemi.push(`${dove}: manca "svela"`);
      return;
    }
    const tipo = g.svela.tipo;
    if (!["lettera", "foto", "buono", "playlist", "audio"].includes(tipo)) {
      problemi.push(`${dove}: "svela.tipo" deve essere lettera, foto, buono, playlist o audio`);
    }
    if (tipo === "foto" && !g.svela.immagine) problemi.push(`${dove}: una foto ha bisogno di "immagine"`);
    if (tipo === "audio" && !g.svela.file) problemi.push(`${dove}: un audio ha bisogno di "file"`);
    if ((tipo === "lettera" || tipo === "buono" || tipo === "playlist") && !g.svela.testo) {
      problemi.push(`${dove}: manca "svela.testo"`);
    }
  });

  for (let n = 1; n <= 25; n++) {
    if (!giorniVisti.has(n)) problemi.push(`manca il giorno ${n}`);
  }
  return problemi;
}

async function caricaDati() {
  const grezzo = await readFile(FILE_DATI, "utf8");
  const letto = JSON.parse(grezzo);
  const problemi = valida(letto);
  if (problemi.length) {
    const errore = new Error(problemi.join("\n  - "));
    errore.problemi = problemi;
    throw errore;
  }
  dati = letto;
  if (PROVA) console.log("[dati] modalità prova: tutte le porticine sono aperte");
}

/* ------------------------------------------------------------------ tempo */

function adesso() {
  if (!OGGI_FINTO) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(OGGI_FINTO);
  if (!m) {
    console.warn(`[tempo] AVVENTO_OGGI="${OGGI_FINTO}" non è nel formato AAAA-MM-GG: lo ignoro`);
    return new Date();
  }
  // mezzogiorno, così i fusi orari non spostano il giorno
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function dataSblocco(giorno) {
  return new Date(dati.anno, 11, giorno, 0, 0, 0, 0);
}

function sbloccata(giorno) {
  if (PROVA) return true;
  return adesso().getTime() >= dataSblocco(giorno).getTime();
}

function risolviMedia(valore) {
  const v = String(valore || "").trim();
  if (!v) return v;
  // già assoluto (http, https, //host, /radice, data:) lo lascio stare
  if (/^(https?:)?\/\//i.test(v) || v.startsWith("/") || v.startsWith("data:")) return v;
  const base = String(dati.media || "").replace(/\/+$/, "");
  if (!base) return v;
  return base + "/" + v.replace(/^\/+/, "");
}

function svelaRisolta(svela) {
  const copia = Object.assign({}, svela);
  ["immagine", "ornamento", "file"].forEach((campo) => {
    if (copia[campo]) copia[campo] = risolviMedia(copia[campo]);
  });
  return copia;
}

// impronta dei codici: cambia solo se cambiano i codici, non se correggi un testo
function baseQr() {
  const daJson = String(dati.base || "").trim().replace(/\/+$/, "");
  return daJson || "http://localhost:" + PORTA;
}

function improntaCodici() {
  const testo = dati.giorni
    .slice()
    .sort((a, b) => a.giorno - b.giorno)
    .map((g) => g.giorno + ":" + String(g.codice).toUpperCase())
    .join("|");
  return createHash("sha256").update(testo).digest("hex").slice(0, 8);
}

function campoGiorno(giorno) {
  return dati.giorni.find((g) => g.giorno === giorno) || null;
}

/* --------------------------------------------------------------- risposte */

function rispondiJson(res, stato, corpo) {
  const testo = JSON.stringify(corpo);
  res.writeHead(stato, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(testo),
  });
  res.end(testo);
}

function biscottoSicuro(req, valore) {
  // Secure solo se la richiesta arriva in https (dietro Traefik, x-forwarded-proto)
  const https = (req.headers["x-forwarded-proto"] || "").includes("https");
  return `${valore}; Path=/; HttpOnly; SameSite=Lax` + (https ? "; Secure" : "");
}

// null = passa, altrimenti la risposta è già stata data
function controllaChiave(req, res, url, percorso) {
  if (!CHIAVE) return null;
  if (biscotto(req, NOME_COOKIE_CHIAVE) === IMPRONTA_CHIAVE) return null;

  const fornita = (url.searchParams.get("k") || "").trim();

  if (fornita !== CHIAVE) {
    // una pagina navigata mostra l'ingresso; API e file restano invisibili
    const navigazione =
      req.method === "GET" && (req.headers.accept || "").includes("text/html") && !percorso.startsWith("/api/");
    if (!navigazione) {
      return () => rispondiJson(res, 404, { errore: "non trovato" });
    }
    const messaggio = fornita ? "Questa chiave non apre niente." : "";
    return () => {
      const corpo = paginaIngresso(messaggio);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(corpo),
      });
      res.end(corpo);
    };
  }

  const scadenza = new Date(Date.now() + 60 * 86400000).toUTCString();
  const pulito = new URL(url);
  pulito.searchParams.delete("k");
  res.writeHead(302, {
    location: pulito.pathname + (pulito.search || ""),
    "set-cookie": biscottoSicuro(
      req,
      `${NOME_COOKIE_CHIAVE}=${IMPRONTA_CHIAVE}; Max-Age=${60 * 86400}; Expires=${scadenza}`
    ),
    "cache-control": "no-store",
  });
  res.end();
  return () => {};
}

function paginaIngresso(errore) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Calendario</title>
<style>
  :root { --carta:#f4e9d5; --inchiostro:#3b3226; --oro:#a8804a; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center; padding:24px;
         background:var(--carta); color:var(--inchiostro);
         font-family:"EB Garamond", Georgia, serif; }
  form { width:min(340px,100%); text-align:center; }
  h1 { margin:0 0 6px; font-family:"Cormorant Garamond", Georgia, serif; font-weight:500; font-size:1.9rem; }
  p { margin:0 0 22px; color:#7d6b57; font-size:.95rem; line-height:1.5; }
  input { width:100%; padding:12px 14px; font-family:ui-monospace, monospace; font-size:.86rem;
          text-align:center; color:var(--inchiostro); background:#fffdf6;
          border:1px solid rgba(168,128,74,.45); border-radius:2px; }
  input:focus { outline:none; border-color:var(--oro); }
  button { margin-top:12px; width:100%; padding:11px; font-family:inherit; font-size:.8rem;
           letter-spacing:.18em; text-transform:uppercase; color:#fdf6e6; background:var(--oro);
           border:0; border-radius:2px; cursor:pointer; }
  .errore { color:#8a3a33; font-size:.86rem; margin:0 0 16px; }
  .nota { margin-top:18px; font-size:.78rem; color:#7d6b57; opacity:.8; }
</style>
</head>
<body>
  <form method="get" action="/" autocomplete="off">
    <h1>Calendario</h1>
    <p>Questa porta ha bisogno della sua chiave.</p>
    ${errore ? '<p class="errore">' + esc(errore) + "</p>" : ""}
    <input name="k" aria-label="chiave d'accesso" placeholder="incolla la chiave" spellcheck="false" />
    <button type="submit">entra</button>
    <p class="nota">La chiave è dentro il QR del primo cioccolatino.</p>
  </form>
</body>
</html>`;
}

function biscotto(req, nome) {
  const grezzo = req.headers.cookie || "";
  for (const pezzo of grezzo.split(";")) {
    const [k, ...resto] = pezzo.trim().split("=");
    if (k === nome) return resto.join("=");
  }
  return null;
}

// null = passa, altrimenti la risposta da dare
function controllaStampa(req, res, url) {
  if (!ABILITA_STAMPA) return () => rispondiJson(res, 404, { errore: "non trovato" });
  if (!PAROLA_STAMPA) return null;
  if (biscotto(req, NOME_COOKIE) === IMPRONTA) return null;

  const data = (url.searchParams.get("password") || url.searchParams.get("p") || "").trim();
  if (data !== PAROLA_STAMPA) {
    // 404 e non 401: chi prova a caso non deve nemmeno sapere che esiste
    return () => rispondiJson(res, 404, { errore: "non trovato" });
  }

  const scadenza = new Date(Date.now() + 30 * 86400000).toUTCString();
  res.writeHead(302, {
    location: url.pathname,
    "set-cookie": biscottoSicuro(
      req,
      `${NOME_COOKIE}=${IMPRONTA}; Max-Age=${30 * 86400}; Expires=${scadenza}`
    ),
    "cache-control": "no-store",
  });
  res.end();
  return () => {};
}

function esc(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlTesto(res, stato, testo) {
  res.writeHead(stato, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(testo),
  });
  res.end(testo);
}

function leggiCorpo(req, limite = 2048) {
  return new Promise((risolvi, rifiuta) => {
    let testo = "";
    req.on("data", (pezzo) => {
      testo += pezzo;
      if (testo.length > limite) {
        rifiuta(new Error("richiesta troppo grande"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!testo) return risolvi({});
      try {
        risolvi(JSON.parse(testo));
      } catch {
        rifiuta(new Error("JSON non valido"));
      }
    });
    req.on("error", rifiuta);
  });
}

/* ------------------------------------------------------- file statici */

async function serviFile(res, percorso, req, radice) {
  const base = radice || CARTELLA;
  let reale;
  try {
    reale = path.resolve(base, "." + percorso);
  } catch {
    return rispondiJson(res, 400, { errore: "percorso non valido" });
  }
  if (!reale.startsWith(base + path.sep) && reale !== base) {
    return rispondiJson(res, 403, { errore: "fuori casa" });
  }

  let info;
  try {
    info = await stat(reale);
  } catch {
    return rispondiJson(res, 404, { errore: "non trovato" });
  }
  if (info.isDirectory()) return serviFile(res, path.posix.join(percorso, "index.html"), req, base);

  const estensione = path.extname(reale).toLowerCase();
  const tipo = TIPI[estensione] || "application/octet-stream";
  const massa = [".html", ".css", ".js"].includes(estensione) ? "no-cache" : "public, max-age=3600";

  res.writeHead(200, {
    "content-type": tipo,
    "content-length": info.size,
    "cache-control": massa,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(reale).pipe(res);
}

/* ------------------------------------------------------------------ rotte */

async function gestisci(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let percorso = decodeURIComponent(url.pathname);

  const chiaveMancante = controllaChiave(req, res, url, percorso);
  if (chiaveMancante) return chiaveMancante();

  if (percorso.startsWith("/api/")) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST" });
      return res.end();
    }

    if (percorso === "/api/calendario" && req.method === "GET") {
      return rispondiJson(res, 200, {
        anno: dati.anno,
        titolo: dati.titolo || "Calendario dell'Avvento",
        sottotitolo: dati.sottotitolo || "",
        destinataria: dati.destinataria || "",
        firma: dati.firma || "",
        adesso: adesso().toISOString(),
        impronta: improntaCodici(),
        prova: PROVA,
        giorni: dati.giorni.map((g) => ({
          giorno: g.giorno,
          sbloccata: sbloccata(g.giorno),
          sblocco: dataSblocco(g.giorno).toISOString(),
        })),
      });
    }

    const mGiorno = /^\/api\/giorno\/(\d{1,2})$/.exec(percorso);
    if (mGiorno && req.method === "GET") {
      const g = campoGiorno(Number(mGiorno[1]));
      if (!g) return rispondiJson(res, 404, { errore: "questo giorno non esiste" });
      if (!sbloccata(g.giorno)) {
        return rispondiJson(res, 423, {
          errore: "sigillata",
          sblocco: dataSblocco(g.giorno).toISOString(),
        });
      }
      // l'indizio sì, il contenuto svelato no
      return rispondiJson(res, 200, { giorno: g.giorno, indizio: g.indizio });
    }

    if (percorso === "/api/sblocca" && req.method === "POST") {
      let corpo;
      try {
        corpo = await leggiCorpo(req);
      } catch (e) {
        return rispondiJson(res, 400, { errore: e.message });
      }

      const codice = String(corpo.codice || "").trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(codice)) {
        return rispondiJson(res, 400, { errore: "il codice è di quattro lettere" });
      }

      const g = dati.giorni.find((x) => x.codice.toUpperCase() === codice);
      if (!g) return rispondiJson(res, 401, { errore: "questo codice non esiste" });

      if (!sbloccata(g.giorno)) {
        return rispondiJson(res, 423, {
          errore: "sigillata",
          giorno: g.giorno,
          sblocco: dataSblocco(g.giorno).toISOString(),
        });
      }

      console.log(`[sblocca] giorno ${g.giorno} aperto con "${codice}"`);
      return rispondiJson(res, 200, { giorno: g.giorno, svela: svelaRisolta(g.svela) });
    }

    return rispondiJson(res, 404, { errore: "rotta sconosciuta" });
  }

  // stampa: solo con AVVENTO_STAMPA=1, e costruita a richiesta dal JSON
  if (percorso === "/stampa" || percorso === "/stampa/") {
    const rifiuto = controllaStampa(req, res, url);
    if (rifiuto) return rifiuto();
    return htmlTesto(res, 200, Stampa.indice(CHIAVE ? baseQr() + "/?k=" + encodeURIComponent(CHIAVE) : ""));
  }

  if (percorso === "/stampa/calendario.json") {
    const rifiuto = controllaStampa(req, res, url);
    if (rifiuto) return rifiuto();
    const testo = await readFile(FILE_DATI, "utf8");
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="calendario.json"',
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(testo),
    });
    return res.end(testo);
  }

  if (percorso === "/stampa/fascette.html") {
    const rifiuto = controllaStampa(req, res, url);
    if (rifiuto) return rifiuto();
    res.writeHead(302, { location: "/stampa/biglietti.html" });
    return res.end();
  }

  const pagine = {
    "/stampa/biglietti.html": () =>
      Stampa.biglietti(dati, baseQr(), CHIAVE, {
        stile: url.searchParams.get("qr"),
        mm: url.searchParams.get("mm"),
      }),
    "/stampa/promemoria.html": () => Stampa.promemoria(dati),
    "/stampa/indovinelli.html": () => Stampa.indovinelli(dati),
  };

  if (pagine[percorso]) {
    const rifiuto = controllaStampa(req, res, url);
    if (rifiuto) return rifiuto();
    return htmlTesto(res, 200, await pagine[percorso]());
  }

  if (percorso.startsWith("/stampa/")) {
    const rifiuto = controllaStampa(req, res, url);
    if (rifiuto) return rifiuto();
    return rispondiJson(res, 404, { errore: "non trovato" });
  }

  // /t/LUCE  ->  la pagina, che poi chiede al server di sbloccare
  if (/^\/t\/[A-Za-z]{4}\/?$/.test(percorso)) {
    return serviFile(res, "/index.html", req);
  }

  if (percorso.endsWith("/")) percorso = percorso + "index.html";

  return serviFile(res, percorso, req);
}

/* ------------------------------------------------------------- avvio */

const server = http.createServer((req, res) => {
  gestisci(req, res).catch((e) => {
    console.error("[errore]", e);
    if (!res.headersSent) rispondiJson(res, 500, { errore: "errore interno" });
    else res.end();
  });
});

try {
  await caricaDati();
} catch (e) {
  console.error("\nNon riesco a partire: dati/calendario.json non va bene.\n  - " + e.message + "\n");
  process.exit(1);
}

// ricarica automatica: guardo la CARTELLA, non il file.
// Gli editor salvano sostituendo il file: per un istante il percorso non esiste,
// e un watcher agganciato al file morirebbe o leggerebbe a vuoto.
let attesa = null;
watch(path.dirname(FILE_DATI), (evento, nome) => {
  if (nome && !String(nome).startsWith("calendario")) return;
  clearTimeout(attesa);
  attesa = setTimeout(async () => {
    for (let tentativo = 0; tentativo < 6; tentativo++) {
      try {
        await caricaDati();
        console.log("[dati] ricaricati — giorni " + dati.giorni.length + ", impronta " + improntaCodici());
        console.log("       i fogli di stampa non si aggiornano da soli: node strumenti/genera-qr.mjs --base … && node strumenti/indovinelli.mjs");
        return;
      } catch (e) {
        if (e.code === "ENOENT") {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }
        console.error("[dati] il file salvato non è valido, tengo la versione precedente:\n  - " + e.message);
        return;
      }
    }
    console.error("[dati] il file non è tornato al suo posto dopo il salvataggio");
  }, 150);
});

// ricarica a mano: kill -HUP <pid>
process.on("SIGHUP", async () => {
  try {
    await caricaDati();
    console.log("[dati] ricaricati a mano — impronta " + improntaCodici());
  } catch (e) {
    console.error("[dati] ricarica a mano fallita, tengo la versione precedente:\n  - " + e.message);
  }
});

server.listen(PORTA, () => {
  const locale = `http://localhost:${PORTA}`;
  console.log("\nCalendario dell'Avvento in ascolto:");
  console.log("  computer   " + locale);
  for (const [nome, indirizzi] of Object.entries(networkInterfaces())) {
    for (const i of indirizzi || []) {
      if (i.family === "IPv4" && !i.internal && !i.address.startsWith("172.")) {
        console.log("  telefono   http://" + i.address + ":" + PORTA + "   (" + nome + ")");
      }
    }
  }
  console.log("\n  anno:  " + dati.anno);
  if (OGGI_FINTO) console.log("  oggi:  " + OGGI_FINTO + " (simulato)");
  if (PROVA) console.log("  prova: tutte le porticine aperte");
  console.log("  chiave: " + (CHIAVE ? "attiva (ingresso ?k=…)" : "NESSUNA — il sito è aperto a chiunque"));
  if (ABILITA_STAMPA) {
    console.log("  stampa: http://localhost:" + PORTA + "/stampa" + (PAROLA_STAMPA ? "?password=…" : ""));
    if (!PAROLA_STAMPA) console.log("          (senza AVVENTO_STAMPA_PAROLA la pagina è aperta a chiunque la raggiunga)");
  }
  console.log("  QR:    " + baseQr() + "  (campo \"base\" in dati/calendario.json)\n");
});
