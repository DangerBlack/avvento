/* ============================================================================
   Le pagine di stampa, costruite a richiesta da dati/calendario.json.
   Nessun file generato: quello che vedi è sempre il contenuto attuale.
   ========================================================================== */

const esc = (t) =>
  String(t == null ? "" : t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dueCifre = (n) => String(n).padStart(2, "0");

const giornIOrdinati = (dati) => dati.giorni.slice().sort((a, b) => a.giorno - b.giorno);

const etichettaTipo = {
  lettera: "lettera",
  foto: "foto",
  buono: "buono",
  playlist: "playlist",
  audio: "audio",
};

const stile = `
  :root { --inchiostro:#3b3226; --tenue:#7d6b57; --oro:#a8804a; --carta:#f4e9d5; --foglio:#fffdf8; }
  * { box-sizing: border-box; }
  body { margin:0 auto; padding:12mm 10mm; background:var(--carta); color:var(--inchiostro);
         font-family:"EB Garamond", Georgia, serif; }
  h1 { margin:0; font-family:"Cormorant Garamond", Georgia, serif; font-weight:500; font-size:19pt; }
  .nota { max-width:186mm; margin:0 auto 6mm; font-family:system-ui, sans-serif; font-size:9pt; line-height:1.55; color:#6b5a52; }
  .nota strong { color:var(--inchiostro); }
  .nota code { font-size:8.6pt; }

  /* biglietti */
  .fogli { display:flex; flex-wrap:wrap; gap:4mm; max-width:186mm; margin:0 auto; }
  .biglietto { position:relative; width:50mm; height:50mm; padding:3.2mm;
               display:flex; flex-direction:column; align-items:center; justify-content:space-between;
               background:var(--foglio); border:0.3mm dashed #cbbcae;
               break-inside:avoid; page-break-inside:avoid; }
  .biglietto__giorno { font-size:11pt; line-height:1; text-align:center; }
  .biglietto__giorno small { display:block; font-family:system-ui, sans-serif; font-size:4.4pt;
               letter-spacing:0.28em; text-transform:uppercase; color:#a08a76; margin-top:1mm; }
  .biglietto__qr { width:var(--qr, 28mm); height:var(--qr, 28mm); }
  .biglietto__qr svg { width:100%; height:100%; display:block; }
  .biglietto__codice { font-family:system-ui, sans-serif; font-weight:700; font-size:7.6pt;
               letter-spacing:0.3em; text-indent:0.3em; }

  /* tabelle */
  table { width:100%; border-collapse:collapse; font-family:system-ui, sans-serif; font-size:8.6pt; }
  th, td { padding:2mm 1.8mm; border-bottom:0.25mm solid #e0d5ca; text-align:left; vertical-align:top; }
  th { font-size:6.4pt; letter-spacing:0.16em; text-transform:uppercase; color:#a08a76; }
  td.g { width:16mm; white-space:nowrap; }
  td.codice { width:16mm; font-weight:700; letter-spacing:0.2em; }
  td.indizio { font-family:"Cormorant Garamond", Georgia, serif; font-size:10.5pt; line-height:1.32; }
  td.indizio .svela { display:block; font-family:system-ui, sans-serif; font-size:6.2pt;
               letter-spacing:0.12em; text-transform:uppercase; color:#a08a76; margin-top:1.2mm; }
  td.dove { width:40mm; }
  td.fatto { width:9mm; text-align:center; }
  .riga-dove { display:block; height:6mm; border-bottom:0.25mm dotted #cfc0b4; }

  @page { size: A4; margin: 10mm; }
  @media print { body { background:#fff; padding:0; } .nota { display:none; } }
`;

const pagina = (titolo, corpo) => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(titolo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=EB+Garamond:wght@400&display=swap" rel="stylesheet" />
<style>${stile}</style>
</head>
<body>
${corpo}
</body>
</html>`;

/* ------------------------------------------------------------------ QR */

async function qrInline(indirizzo, opzioni) {
  const stile = opzioni && opzioni.stile === "quadro" ? "quadro" : "tondo";
  try {
    const { default: QRCode } = await import("qrcode");
    const qr = QRCode.create(indirizzo, { errorCorrectionLevel: "Q" });
    const n = qr.modules.size;
    const dati = qr.modules.data;
    const margine = 4;              // zona di silenzio: 4 moduli, come raccomandano tutti
    const lato = n + margine * 2;
    const buio = (x, y) => dati[y * n + x] === 1;

    // i tre occhi: 7x7 agli angoli, con il quadratino interno
    const inOcchio = (x, y) =>
      (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);

    let pezzi = "";

    // occhi arrotondati
    const occhi = [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ];
    for (const [ox, oy] of occhi) {
      const X = ox + margine;
      const Y = oy + margine;
      // 7x7 pieno, poi 5x5 di carta, poi 3x3 pieno: geometria esatta, solo gli angoli arrotondati
      pezzi += `<rect x="${X}" y="${Y}" width="7" height="7" rx="2" fill="#241b18"/>`;
      pezzi += `<rect x="${X + 1}" y="${Y + 1}" width="5" height="5" rx="1.4" fill="#fffdf8"/>`;
      pezzi += `<rect x="${X + 2}" y="${Y + 2}" width="3" height="3" rx="0.8" fill="#241b18"/>`;
    }

    // moduli: tondi (predefinito) o quadrati arrotondati
    const r = 0.47;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!buio(x, y) || inOcchio(x, y)) continue;
        if (stile === "quadro") {
          pezzi += `<rect x="${x + margine + 0.04}" y="${y + margine + 0.04}" width="0.92" height="0.92" rx="0.26" fill="#241b18"/>`;
        } else {
          pezzi += `<circle cx="${x + margine + 0.5}" cy="${y + margine + 0.5}" r="${r}" fill="#241b18"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}" shape-rendering="geometricPrecision">` +
      `<rect width="${lato}" height="${lato}" fill="#fffdf8"/>${pezzi}</svg>`;
  } catch (e) {
    return `<div style="font-size:7pt;line-height:1.2;text-align:center;padding:2mm">
      QR non disponibile<br /><span style="font-size:6pt">(${esc(e.message)})</span></div>`;
  }
}

/* ------------------------------------------------------------ le pagine */

export async function biglietti(dati, base, chiave, opzioni) {
  const stile = opzioni && opzioni.stile === "quadro" ? "quadro" : "tondo";
  const mm = Math.min(36, Math.max(20, Number(opzioni && opzioni.mm) || 28));
  const righe = [];
  for (const g of giornIOrdinati(dati)) {
    const codice = String(g.codice).toUpperCase();
    const indirizzo = `${base}/t/${codice}` + (chiave ? `?k=${encodeURIComponent(chiave)}` : "");
    const svg = await qrInline(indirizzo, { stile });
    righe.push(`  <div class="biglietto">
    <span class="biglietto__giorno">${g.giorno}<small>dicembre</small></span>
    <div class="biglietto__qr">${svg}</div>
    <span class="biglietto__codice">${esc(codice)}</span>
  </div>`);
  }
  return pagina(
    "Biglietti per i cioccolatini",
    `<p class="nota">
  <strong>Biglietti per i cioccolatini.</strong> Quadrati da 50 mm: si ritagliano sulla linea
  tratteggiata e si appoggiano sopra (o sotto) il cioccolatino, fermati con un pezzo di nastro.
  Stampa al 100%, senza "adatta alla pagina", su carta opaca: se è lucida il riflesso può
  impedire la lettura del QR.<br />
  <strong>Questi QR puntano a <code>${esc(base)}</code></strong> — se cambi porta o dominio
  (campo <code>base</code> in calendario.json), ristampali.<br />
  <strong>Stile:</strong> ${stile === "quadro" ? "quadrati arrotondati" : "puntini tondi"} · <strong>lato:</strong> ${mm} mm
  · per cambiare: <code>?qr=quadro</code>, <code>?mm=32</code> in fondo all'indirizzo.
</p>
<div class="fogli" style="--qr:${mm}mm">
${righe.join("\n")}
</div>`
  );
}

export function promemoria(dati) {
  const righe = giornIOrdinati(dati).map((g) => {
    const s = g.svela || {};
    return `    <tr>
      <td class="g">${g.giorno} dic</td>
      <td class="codice">${esc(String(g.codice).toUpperCase())}</td>
      <td class="indizio">${esc(g.indizio)}<span class="svela">${esc(etichettaTipo[s.tipo] || s.tipo || "")}${s.titolo ? " · " + esc(s.titolo) : ""}</span></td>
      <td class="dove"><span class="riga-dove"></span></td>
      <td class="fatto">☐</td>
    </tr>`;
  });
  return pagina(
    "Promemoria dei nascondigli",
    `<p class="nota">
  <strong>Promemoria per te.</strong> Per ogni giorno: l'indovinello che legge aprendo la porticina,
  il codice del biglietto e cosa sblocca. Segna dove l'hai nascosto — a dicembre non te lo ricorderai,
  e se un QR si rovina devi sapere quale codice dettare. Tienilo fuori casa o dove non guarda.
</p>
<table>
  <thead>
    <tr><th>Giorno</th><th>Codice</th><th>Indovinello</th><th>Dove l'ho nascosto</th><th>Fatto</th></tr>
  </thead>
  <tbody>
${righe.join("\n")}
  </tbody>
</table>`
  );
}

export function indovinelli(dati) {
  const righe = giornIOrdinati(dati).map((g) => {
    const s = g.svela || {};
    return `    <li>
      <div class="testa">
        <span class="giorno">${g.giorno} dicembre</span>
        <span class="codice">${esc(String(g.codice).toUpperCase())}</span>
        <span class="tipo">${esc(etichettaTipo[s.tipo] || s.tipo || "")}${s.titolo ? " · " + esc(s.titolo) : ""}</span>
      </div>
      <p class="indizio">${esc(g.indizio)}</p>
    </li>`;
  });
  return pagina(
    "Indovinelli e codici",
    `<p class="nota">
  <strong>Da non lasciare in giro.</strong> La frase che legge aprendo la porticina, le quattro lettere
  del biglietto e cosa trova dopo.
</p>
<ol style="list-style:none;margin:0;padding:0">
${righe.join("\n")}
</ol>
<style>
  ol li { padding:3mm 0; border-bottom:0.25mm dotted rgba(168,128,74,.35); break-inside:avoid; }
  .testa { display:flex; align-items:baseline; gap:3mm; flex-wrap:wrap; }
  .giorno { font-family:"Cormorant Garamond", Georgia, serif; font-size:12.5pt; min-width:24mm; }
  .codice { font-family:system-ui, sans-serif; font-size:8.5pt; font-weight:700; letter-spacing:.26em;
            padding:1mm 2.4mm; border:0.3mm solid rgba(168,128,74,.5); color:#6b4b22; }
  .tipo { font-size:9pt; color:#7d6b57; font-style:italic; }
  p.indizio { margin:1.6mm 0 0 27mm; font-family:"Cormorant Garamond", Georgia, serif; font-size:13pt; line-height:1.4; }
</style>`
  );
}

export function indice(linkIngresso) {
  return pagina(
    "Roba da stampare",
    `<h1>Roba da stampare</h1>
<p class="nota">Questa pagina esiste solo con <code>AVVENTO_STAMPA=1</code>. Su un server pubblico non c'è.</p>
${linkIngresso ? `<div style="padding:12px 16px;margin:0 0 14px;border:1px solid rgba(168,128,74,.6);background:#f7ecd6">
  <strong style="font-family:system-ui,sans-serif;font-size:8pt;letter-spacing:.16em;text-transform:uppercase;color:#7d6b57">link d'ingresso da mandarle</strong>
  <div style="word-break:break-all;margin-top:6px;font-size:11pt">${esc(linkIngresso)}</div>
  <div style="font-family:system-ui,sans-serif;font-size:8pt;color:#7d6b57;margin-top:6px">contiene la chiave: si usa una volta e resta in un cookie per 60 giorni</div>
</div>` : ""}
<a href="/stampa/biglietti.html" style="display:block;padding:14px 18px;margin:0 0 10px;text-decoration:none;color:#3b3226;border:1px solid rgba(168,128,74,.35);background:#fbf3e2">Biglietti per i cioccolatini<span style="display:block;font-family:system-ui,sans-serif;font-size:.8em;color:#7d6b57">25 quadrati da 50 mm con QR, giorno e codice</span></a>
<div style="margin:-4px 0 12px;padding-left:18px;font-family:system-ui,sans-serif;font-size:.82em;color:#7d6b57">
  stile:
  <a href="/stampa/biglietti.html?qr=tondo&amp;mm=28" style="color:#6b4b22">puntini 28 mm</a> ·
  <a href="/stampa/biglietti.html?qr=quadro&amp;mm=28" style="color:#6b4b22">quadrati 28 mm</a> ·
  <a href="/stampa/biglietti.html?qr=tondo&amp;mm=32" style="color:#6b4b22">puntini 32 mm</a> ·
  <a href="/stampa/biglietti.html?qr=quadro&amp;mm=24" style="color:#6b4b22">quadrati 24 mm</a>
</div>
<a href="/stampa/promemoria.html" style="display:block;padding:14px 18px;margin:0 0 10px;text-decoration:none;color:#3b3226;border:1px solid rgba(168,128,74,.35);background:#fbf3e2">Promemoria dei nascondigli<span style="display:block;font-family:system-ui,sans-serif;font-size:.8em;color:#7d6b57">indovinello, codice e spazio per scrivere dove l'hai messo</span></a>
<a href="/stampa/indovinelli.html" style="display:block;padding:14px 18px;text-decoration:none;color:#3b3226;border:1px solid rgba(168,128,74,.35);background:#fbf3e2">Indovinelli e codici<span style="display:block;font-family:system-ui,sans-serif;font-size:.8em;color:#7d6b57">spoiler completo, il copione per te</span></a>
<a href="/stampa/calendario.json" style="display:block;padding:14px 18px;margin-top:10px;text-decoration:none;color:#3b3226;border:1px solid rgba(168,128,74,.35);background:#fbf3e2">calendario.json<span style="display:block;font-family:system-ui,sans-serif;font-size:.8em;color:#7d6b57">il file dei contenuti</span></a>`
  );
}
