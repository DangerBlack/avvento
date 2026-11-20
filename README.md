# Avvento

Un calendario dell'avvento che vive a metà tra il sito e la casa.

Ogni porticina si apre **solo nel suo giorno** e mostra un indizio. L'indizio porta a un
cioccolatino nascosto, che ha sopra un QR: scansionandolo si apre il regalo vero — una lettera,
una foto, un buono, una playlist, un messaggio vocale. Il codice di quattro lettere stampato
sotto il QR serve se il QR si rovina o la fotocamera non collabora.

Il sito non contiene i regali: li consegna solo a data raggiunta **e** codice corretto. Chi apre
la pagina a novembre trova venticinque porticine chiuse e nient'altro.

---

## Come funziona

1. **La data sblocca la porticina.** Prima del suo giorno risponde solo "si apre il 5 dicembre".
2. **L'indizio porta al cioccolatino.** Il testo è una specie di indovinello sul posto in casa.
3. **Il QR sblocca il regalo.** Ogni biglietto contiene `https://…/t/CODICE`; il server verifica
   che sia il giorno giusto e restituisce il contenuto.

Lo stato di "quali porticine ho aperto" sta nel browser (`localStorage`), non sul server: nessun
account, nessun cookie di tracciamento. La chiave include un'impronta dei codici, così se li
cambi il progresso vecchio non vale più; se cambi solo un testo, resta tutto.

---

## Requisiti

- Node 18+ (nessun transpiler, nessun bundler)
- un dominio e HTTPS se lo vuoi raggiungibile da fuori (vedi *Deploy*)

---

## Avvio in due minuti

```bash
npm install
cp dati/calendario.example.json dati/calendario.json
node server.js
```

Poi apri `http://localhost:8080`. Le 25 porticine sono chiuse: è il comportamento corretto fuori
da dicembre.

Per lavorarci senza aspettare:

```bash
AVVENTO_PROVA=1 node server.js          # tutte aperte
AVVENTO_OGGI=2026-12-14 node server.js  # finge che sia il 14 dicembre
```

Con `AVVENTO_PROVA=1` compare anche un nastro giallo in cima: serve a non dimenticarsene acceso.

---

## Configurazione: `dati/calendario.json`

Un solo file contiene tutto. **Non va su GitHub** (è nel `.gitignore`): contiene gli indizi e i
regali. Nel repository c'è `dati/calendario.example.json` come modello, con 25 giorni già
numerati e i cinque tipi di regalo in ciclo.

```json
{
  "anno": 2026,
  "base": "https://avvento.example.it",
  "titolo": "Calendario dell'Avvento",
  "sottotitolo": "venticinque porticine, venticinque nascondigli",
  "destinataria": "Per te",
  "firma": "— il tuo nome",
  "giorni": [
    {
      "giorno": 1,
      "codice": "ALBA",
      "indizio": "Comincia da dove cominciano le mattine.",
      "svela": { "tipo": "lettera", "titolo": "Giorno uno", "testo": "…" }
    }
  ]
}
```

| campo | cosa è |
| --- | --- |
| `anno` | le porticine si aprono dal 1 al 25 dicembre di questo anno |
| `base` | indirizzo che finisce dentro i QR. Deve essere **quello che funziona dal telefono** in casa |
| `destinataria`, `titolo`, `sottotitolo`, `firma` | testi della pagina e delle lettere |
| `media` | *(opzionale)* prefisso per immagini e audio, es. un bucket S3 |
| `giorni` | esattamente 25 voci |
| `codice` | 4 lettere A–Z, uniche. È quello stampato sotto il QR |
| `indizio` | la frase che compare aprendo la porticina |

### I cinque tipi di `svela`

| `tipo` | campi | cosa appare |
| --- | --- | --- |
| `lettera` | `titolo`, `testo`, `ornamento`* | foglio con testo, firma, eventuale illustrazione |
| `foto` | `titolo`, `immagine`, `didascalia` | polaroid |
| `buono` | `titolo`, `testo`, `validita` | tagliando con linea da strappare |
| `playlist` | `titolo`, `testo`, `link`, `etichettaLink` | testo e bottone |
| `audio` | `file`, `etichetta`, `testo` | lettore con barra e tempo |

\* `ornamento` è un'immagine piccola in fondo alla lettera.

I percorsi di `immagine`, `ornamento` e `file` sono relativi alla radice del sito (`foto/06.jpg`)
oppure URL completi. Con `"media": "https://bucket.example/avvento"` i percorsi corti vengono
prefissati dal server: `foto/06.jpg` → `https://bucket.example/avvento/foto/06.jpg`.

I file locali stanno in `pubblico/foto/` e `pubblico/audio/`. Se una foto manca la card non si
rompe: mostra un riquadro "manca la foto".

Il server ricarica il file da solo quando lo salvi e, se c'è un errore, **tiene la versione
precedente** dicendoti in console quale giorno non va (`giorno #14: manca "svela.testo"`).

---

## Pagine di stampa

Non sono file: il server le costruisce a ogni richiesta leggendo il JSON, QR compresi. Quindi
si aggiornano da sole quando salvi.

Con `AVVENTO_STAMPA=1`:

| rotta | cosa |
| --- | --- |
| `/stampa` | indice |
| `/stampa/biglietti.html` | 25 biglietti quadrati da 50 mm, QR da 24 mm, giorno e codice |
| `/stampa/promemoria.html` | indovinello, codice, cosa sblocca, spazio per il nascondiglio |
| `/stampa/indovinelli.html` | il copione completo — spoiler |
| `/stampa/calendario.json` | il file stesso, da scaricare |

Si stampa al 100% (niente "adatta alla pagina"), su carta opaca: se è lucida il riflesso può
impedire la lettura del QR.

I QR sono disegnati a mano dai moduli (puntini, occhi arrotondati, inchiostro su crema) invece di
essere i quadratini standard: restano leggibili perché la geometria degli occhi e la zona di
silenzio sono esatte. Sono verificati con un decoder reale a 28 mm — la dimensione di stampa —
non a occhio. Se cambi la chiave o l'indirizzo, l'URL si allunga e i moduli si infittiscono:
rifai la prova prima di stampare.

Se aggiungi `AVVENTO_STAMPA_PAROLA`, tutto quanto sopra risponde solo dopo aver visitato
`/stampa?password=quella` una volta: lascia un cookie per 30 giorni e ripulisce l'indirizzo.
Senza password, o con quella sbagliata, risponde **404** — non 401, così non rivela che esiste.

---

## Variabili d'ambiente

| variabile | default | cosa fa |
| --- | --- | --- |
| `PORT` | `8080` | porta di ascolto |
| `AVVENTO_PROVA` | – | `1` = tutte le porticine aperte, con nastro di avviso |
| `AVVENTO_OGGI` | – | `AAAA-MM-GG`, finge che sia un altro giorno |
| `AVVENTO_STAMPA` | – | `1` = attiva le pagine di stampa |
| `AVVENTO_STAMPA_PAROLA` | – | password (via cookie) per le pagine di stampa |
| `AVVENTO_CHIAVE` | – | chiave d'accesso al sito (UUID). Senza, il sito è aperto a chiunque conosca l'indirizzo |

---

## Chiave d'accesso

Il codice a quattro lettere non è un segreto: sta scritto sul cioccolatino. Da solo non basta a
proteggere un sito pubblico, perché chiunque potrebbe provare i codici e sbloccare i giorni. Per
questo l'accesso al calendario è protetto da una chiave separata:

```bash
node -e "console.log(crypto.randomUUID())"
# → 81168a74-7d1e-46d2-8e63-07e67db4e0f6
AVVENTO_CHIAVE=quella-sopra
```

Come funziona:

- il link d'ingresso è `https://…/?k=LA-CHIAVE`; si usa **una volta**, poi resta in un cookie
  `HttpOnly` per 60 giorni (e l'indirizzo si ripulisce, la chiave non resta nella cronologia)
- **i QR la contengono**: ogni biglietto punta a `…/t/CODICE?k=LA-CHIAVE`, così scansionare un
  cioccolatino autentica anche il telefono
- senza chiave un browser vede solo una pagina con il campo "incolla la chiave"; API e file
  rispondono **404**
- la pagina `/stampa` mostra il link d'ingresso pronto da copiare

Cambiare la chiave invalida i cookie **e i QR già stampati**: se la cambi, ristampa i biglietti.

## Deploy

### Solo in casa (la versione più semplice)

Il computer resta acceso, `node server.js`, e i QR puntano al suo IP di rete
(`"base": "http://<ip-del-computer>:8080"`). Il calendario funziona solo dentro casa — che per molti
è parte del gioco. Fissa l'IP nel router *prima* di stampare.

### systemd (per non pensarci più)

`~/.config/systemd/user/avvento.service`:

```ini
[Unit]
Description=Calendario dell'Avvento
After=network.target

[Service]
WorkingDirectory=%h/avvento
# le variabili (compresa la password) stanno fuori dal file del servizio
EnvironmentFile=%h/.config/avvento.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
```

`~/.config/avvento.env` (permessi `600`):

```bash
PORT=8477
AVVENTO_STAMPA=1
AVVENTO_STAMPA_PAROLA=cambiami
```

```bash
chmod 600 ~/.config/avvento.env
systemctl --user daemon-reload
systemctl --user enable --now avvento
loginctl enable-linger "$USER"   # parte anche senza login
journalctl --user -u avvento -f  # log
```

Se Node è installato con nvm, `ExecStart` deve puntare al percorso esatto della versione
(`~/.nvm/versions/node/vXX/bin/node`): systemd non conosce il `PATH` della tua shell, e dopo un
aggiornamento di Node quel percorso va aggiornato a mano.

### Docker

```bash
docker compose up -d --build
```

`docker-compose.yml` monta `dati/`, `pubblico/foto/` e `pubblico/audio/` in sola lettura: i
contenuti e i media restano fuori dall'immagine (e fuori da Git). Il `.dockerignore` esclude
`dati/calendario.json`, quindi l'immagine **non** contiene i regali.

L'immagine non copia affatto `dati/`: se avvii il container senza quel volume, esce subito con
`Non riesco a partire: dati/calendario.json non va bene` — è voluto, meglio un errore chiaro che
un calendario che parte con contenuti sbagliati.

Per un deploy dietro Traefik togli `ports:` e decommenta la parte `networks`/`labels` nel compose.

### Traefik (file provider)

Se usi il provider dinamico, tre voci:

```yaml
# services.yaml
http:
  services:
    avvento:
      loadBalancer:
        servers:
          - url: "http://<ip-del-computer>:8477"
```

```yaml
# routers.yaml
http:
  routers:
    avvento_route:
      entryPoints: [websecure]
      service: avvento
      rule: Host(`avvento.example.it`)
      tls:
        certresolver: myresolver
```

Il certificato lo emette Traefik: basta che DNS e porta 443 arrivino a lui.

**Attenzione all'indirizzo dei QR.** Se da casa il dominio non si raggiunge (NAT che non fa
hairpin), i QR devono puntare all'indirizzo che *funziona in casa* — spesso un'altra porta
(`https://avvento.example.it:8080`) o l'IP locale. Provalo dal telefono, in wifi, prima di
stampare: un QR che non si apre davanti alla porticina è il modo più efficace di rovinare la
caccia.

---

## Cosa è pubblico e cosa no

| | |
| --- | --- |
| tutto il sito | 404 senza chiave (o pagina d'ingresso, se navighi con un browser) |
| `/` | la pagina: 25 porticine, nessun contenuto |
| `/api/calendario` | solo `giorno` e `sbloccata` |
| `/api/giorno/N` | l'indizio, e solo dal giorno N |
| `POST /api/sblocca` | il regalo, solo con codice giusto **e** giorno giusto |
| `/stampa*` | solo con `AVVENTO_STAMPA=1`, meglio con password |

Il JSON non è mai servito come file statico. Resta però sul disco del server: chi ha accesso
alla macchina (o al repository, se lo commetti per sbaglio) vede tutto. Contro la curiosità di
chi apre l'ispettore va benissimo; contro chi apre un terminale, no.

---

## Struttura

```
server.js                 HTTP, zero framework
stampa.mjs                le pagine di stampa costruite dal JSON
dati/calendario.json      contenuti (ignorato da git)
dati/calendario.example.json
pubblico/index.html       pagina + disegno della porticina (un SVG riusato 25 volte)
pubblico/css/style.css
pubblico/js/app.js
pubblico/illustrazioni/   frontespizio, fregio, i due topi
pubblico/foto/            le vostre foto
pubblico/audio/           i messaggi vocali
```

---

## Su GitHub

```bash
git remote add origin git@github.com:<utente>/avvento.git
git push -u origin main
```

Prima di pubblicare, tre cose:

- **`dati/calendario.json` non è nel repository** (è nel `.gitignore`). Sul server deve
  comunque esistere: copialo a mano, o tienilo in un volume, o scaricalo da una tua copia.
  Un `git pull` non lo sovrascrive mai — ed è esattamente il motivo per cui è escluso.
- **i codici di esempio sono diversi da quelli veri** (ALBA, ARCO, CANE…): il repository non
  deve contenere i codici che finiranno sui cioccolatini.
- l'autore dei commit in questo repository è impostato a un valore neutro
  (`avvento <avvento@example.com>`) per non pubblicare la tua email. Se vuoi che i commit siano
  tuoi, cambialo con `git config user.email` (meglio la mail `noreply` di GitHub).

Se il repository è **pubblico**, chiunque legga il codice sa come funziona il calendario: non è
un problema, perché indizi e regali non sono lì. Se preferisci non far sapere nemmeno che esiste,
tienilo privato.

## Sostituire le illustrazioni

Le quattro immagini in `pubblico/illustrazioni/` sono state generate per questo progetto e non
sono indispensabili: il calendario funziona anche senza.

| file | dove si usa | larghezza consigliata |
| --- | --- | --- |
| `frontespizio.webp` | sopra il titolo, in `pubblico/index.html` | ~520 px |
| `fregio.webp` | sotto il sottotitolo, in `pubblico/index.html` | ~1100 px |
| `topina.webp` | accanto alla porticina aperta, in `pubblico/js/app.js` | ~460 px |
| `topino.webp` | in fondo alla lettera del 25 (`ornamento` nel JSON) | ~460 px |

Per sostituirle: tieni gli stessi nomi e gli stessi percorsi, oppure cambia i riferimenti nei due
punti indicati. Servono immagini **con sfondo trasparente** (WebP o PNG): vengono appoggiate sulla
carta color tè, quindi un fondo bianco si vedrebbe come un rettangolo.

Se cambi le proporzioni, il layout regge: le larghezze sono in `clamp()` e le immagini scalano in
altezza. La favicon invece è un SVG inline dentro `index.html`: si cambia lì.

## Licenza

MIT. Le illustrazioni in `pubblico/illustrazioni/` sono generate per questo progetto: se riusi
il codice, sostituiscile con le tue.
