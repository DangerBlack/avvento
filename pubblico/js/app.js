/* ============================================================================
   Il client non conosce né gli indizi né i regali: li chiede al server.
   Qui c'è solo la scenografia, la memoria locale e le animazioni.
   ========================================================================== */
(function () {
  "use strict";

  var CHIAVE_BASE = "avvento.v2";
  var chiave = CHIAVE_BASE;

  var elGriglia = document.getElementById("griglia");
  var elVelato = document.getElementById("velo");
  var elTeatro = document.getElementById("teatro");
  var elAvviso = document.getElementById("avviso");
  var elConteggio = document.getElementById("conteggio");
  var elNastro = document.getElementById("nastro");

  var stato = { codici: {} };
  var modello = null;
  var giornoAperto = null;
  var audioCorrente = null;
  var ultimoFocus = null;

  /* ---------------------------------------------------------------- stato */

  function leggiStato() {
    try {
      var grezzo = localStorage.getItem(chiave);
      var letto = grezzo ? JSON.parse(grezzo) : {};
      var codici = letto && letto.codici && typeof letto.codici === "object" ? letto.codici : {};
      var puliti = {};
      Object.keys(codici).forEach(function (n) {
        if (/^[A-Z]{4}$/.test(String(codici[n]))) puliti[n] = String(codici[n]);
      });
      return { codici: puliti };
    } catch (e) {
      return { codici: {} };
    }
  }

  function salvaStato() {
    try {
      localStorage.setItem(chiave, JSON.stringify(stato));
    } catch (e) {
      /* niente memoria, ma si gioca lo stesso */
    }
  }

  function quantiTrovati() {
    return Object.keys(stato.codici).length;
  }

  /* ------------------------------------------------------------------ rete */

  function api(percorso, opzioni) {
    var conf = { headers: { "content-type": "application/json" } };
    if (opzioni) {
      if (opzioni.method) conf.method = opzioni.method;
      if (opzioni.body) conf.body = JSON.stringify(opzioni.body);
    }
    return fetch(percorso, conf).then(function (risposta) {
      return risposta
        .json()
        .catch(function () {
          return {};
        })
        .then(function (dati) {
          if (!risposta.ok) {
            var errore = new Error(dati.errore || "il server ha risposto " + risposta.status);
            errore.stato = risposta.status;
            errore.dati = dati;
            throw errore;
          }
          return dati;
        });
    });
  }

  /* --------------------------------------------------------------- utilità */

  function perGiorno(n) {
    if (!modello) return null;
    for (var i = 0; i < modello.giorni.length; i++) {
      if (modello.giorni[i].giorno === n) return modello.giorni[i];
    }
    return null;
  }

  function dataItaliana(iso) {
    try {
      return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(new Date(iso));
    } catch (e) {
      return "quel giorno";
    }
  }

  function giorniA(iso) {
    var diff = new Date(iso).getTime() - Date.now();
    return Math.max(1, Math.ceil(diff / 86400000));
  }

  function avviso(testo) {
    elAvviso.textContent = testo;
    elAvviso.className = "avviso is-visibile";
    clearTimeout(avviso._t);
    avviso._t = setTimeout(function () {
      elAvviso.className = "avviso";
    }, 3400);
  }

  function scuoti(el) {
    if (!el) return;
    el.classList.remove("scuoti");
    void el.offsetWidth;
    el.classList.add("scuoti");
    setTimeout(function () {
      el.classList.remove("scuoti");
    }, 560);
  }

  function ridottoMovimento() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function proteggi(testo) {
    return String(testo == null ? "" : testo)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function proteggiAttr(testo) {
    return proteggi(testo).replace(/'/g, "&#39;");
  }

  /* --------------------------------------------------------------- griglia */

  var TINTE = [
    ["--rosa", "--rosa-scura"],
    ["--salvia", "--salvia-scura"],
    ["--ocra", "--ocra-scura"],
    ["--lavanda", "--lavanda-scura"],
    ["--blu", "--blu-scura"],
  ];

  // ordine sparso: se ripetessi 0,1,2,3,4 la griglia farebbe strisce diagonali
  var ORDINE = [0, 1, 2, 3, 4, 1, 2, 0, 4, 3, 2, 3, 4, 0, 1, 3, 4, 1, 2, 0, 4, 0, 3, 1, 2];

  function stileTinta(giorno) {
    var tinta = TINTE[ORDINE[(giorno - 1) % ORDINE.length]];
    return "--tinta:var(" + tinta[0] + ");--tinta-fondo:var(" + tinta[1] + ")";
  }

  function arteCornice() {
    return (
      '<svg class="arte" viewBox="0 0 300 400" aria-hidden="true" focusable="false">' +
      '<use href="#cornice-porta" /></svg>'
    );
  }

  // il battente: stesso disegno, cambiano colore, numero e motivo
  function artePorta(giorno) {
    var simbolo = giorno === 25 ? "anta-ramo" : "anta-oblo";
    return (
      '<svg class="arte" viewBox="0 0 300 400" aria-hidden="true" focusable="false">' +
      '<use href="#' + simbolo + '" />' +
      '<text x="150" y="296" text-anchor="middle" class="arte__numero" ' +
      'style="font-variant-numeric: lining-nums">' + giorno + "</text>" +
      "</svg>"
    );
  }

  function disegnaGriglia() {
    elGriglia.innerHTML = "";

    modello.giorni.forEach(function (g, indice) {
      var trovata = !!stato.codici[g.giorno];
      var porta = document.createElement("button");
      porta.type = "button";
      porta.className = "porta";
      porta.dataset.giorno = String(g.giorno);
      porta.style.cssText = stileTinta(g.giorno);

      if (!g.sbloccata) porta.classList.add("is-bloccata");
      if (trovata) porta.classList.add("is-trovata");
      if (g.oggi && g.sbloccata) porta.classList.add("is-oggi");

      porta.setAttribute(
        "aria-label",
        g.sbloccata
          ? "Porticina del " + g.giorno + " dicembre" + (trovata ? ", già trovata" : "")
          : "Porticina del " + g.giorno + " dicembre, si apre il " + g.giorno + " dicembre"
      );

      porta.innerHTML =
        '<span class="porta__nicchia" aria-hidden="true"></span>' +
        '<span class="porta__telaio" aria-hidden="true">' + arteCornice() + "</span>" +
        '<span class="porta__anta" aria-hidden="true">' + artePorta(g.giorno) + "</span>" +
        '<span class="porta__segnale" aria-hidden="true"></span>';

      porta.addEventListener("click", function () {
        apri(g.giorno);
      });

      elGriglia.appendChild(porta);
    });

    aggiornaConteggio();
  }

  function aggiornaConteggio() {
    var fatti = quantiTrovati();
    var tot = modello ? modello.giorni.length : 25;
    if (!fatti) {
      elConteggio.textContent = "nessun nascondiglio trovato, per ora";
    } else if (fatti === 1) {
      elConteggio.textContent = "1 nascondiglio trovato su " + tot;
    } else {
      elConteggio.textContent = fatti + " nascondigli trovati su " + tot;
    }
  }

  function portaNelDom(n) {
    return elGriglia.querySelector('.porta[data-giorno="' + n + '"]');
  }

  /* ---------------------------------------------------------------- portica */

  function apri(n) {
    var g = perGiorno(n);
    if (!g) return;

    if (!g.sbloccata) {
      avviso("Questa porticina si apre il " + g.giorno + " dicembre.");
      scuoti(portaNelDom(n));
      return;
    }

    ultimoFocus = document.activeElement;
    giornoAperto = n;
    elVelato.hidden = false;
    document.body.classList.add("bloccato");

    costruisciGuscio(g, false);

    if (stato.codici[n]) {
      // gia' sbloccata una volta: il codice salvato basta per riaprirla
      apriConCodice(stato.codici[n], { silenzioso: true });
    } else {
      caricaIndizio(g);
    }
  }

  function chiudi() {
    fermaAudio();
    elVelato.hidden = true;
    elTeatro.innerHTML = "";
    document.body.classList.remove("bloccato");
    giornoAperto = null;
    if (ultimoFocus && ultimoFocus.focus) ultimoFocus.focus();
    if (modello) disegnaGriglia();
  }

  function costruisciGuscio(g, sigillata) {
    elTeatro.innerHTML =
      '<div class="teatro__coppia">' +
        '<div class="teatro__scena">' +
          '<div class="porta-grande' + (sigillata ? " is-sigillata" : "") + '" style="' + stileTinta(g.giorno) + '">' +
            '<div class="porta-grande__nicchia"></div>' +
            '<div class="porta-grande__telaio" aria-hidden="true">' + arteCornice() + "</div>" +
            '<div class="porta-grande__anta" aria-hidden="true">' + artePorta(g.giorno) + "</div>" +
          "</div>" +
        "</div>" +
        '<img class="teatro__topina" src="/illustrazioni/topina.webp" width="460" height="766" alt="" aria-hidden="true" />' +
      "</div>" +
      '<div class="teatro__dida">' +
        '<span class="teatro__giorno">' + g.giorno + " dicembre</span>" +
        '<span class="teatro__stato"></span>' +
      "</div>" +
      '<div class="reperto" id="reperto" aria-live="polite"></div>' +
      '<button type="button" class="teatro__chiudi" id="chiudi">chiudi</button>';

    elTeatro.querySelector("#chiudi").addEventListener("click", chiudi);
    elTeatro.setAttribute("aria-label", "Porticina del " + g.giorno + " dicembre");

    if (!sigillata && !ridottoMovimento()) {
      setTimeout(spalanca, 340);
    } else if (!sigillata) {
      spalanca();
    }
  }

  function spalanca() {
    var porta = elTeatro.querySelector(".porta-grande");
    if (porta) porta.classList.add("is-aperta");
  }

  function etichettaStato(testo) {
    var el = elTeatro.querySelector(".teatro__stato");
    if (el) el.textContent = testo;
  }

  function mettiReperto(html) {
    var reperto = elTeatro.querySelector("#reperto");
    if (!reperto) return null;
    fermaAudio();
    reperto.innerHTML = html;
    return reperto;
  }

  /* ---------------------------------------------------------------- indizio */

  function caricaIndizio(g) {
    etichettaStato("in attesa del nascondiglio");
    mettiReperto('<p class="pergamena__testo" style="text-align:center">la porticina sta scricchiolando…</p>');

    api("/api/giorno/" + g.giorno)
      .then(function (risposta) {
        if (giornoAperto !== g.giorno) return;
        mostraIndizio(g, risposta.indizio);
      })
      .catch(function (errore) {
        if (giornoAperto !== g.giorno) return;
        if (errore.stato === 423) {
          mostraSigillo(g, errore.dati.sblocco);
        } else {
          mostraErrore("Non riesco a leggere questa porticina. Riprova.", function () {
            caricaIndizio(g);
          });
        }
      });
  }

  function mostraIndizio(g, indizio) {
    mettiReperto(
      '<div class="pergamena">' +
        '<p class="pergamena__etichetta">indizio</p>' +
        '<p class="pergamena__testo">' + proteggi(indizio) + "</p>" +
      "</div>" +
      '<form class="cerca" autocomplete="off">' +
        '<label class="cerca__etichetta" for="codice">Trovato il cioccolatino? Scrivi le quattro lettere.</label>' +
        '<div class="cerca__riga">' +
          '<input class="codice" id="codice" name="codice" type="text" maxlength="4" ' +
            'inputmode="text" autocapitalize="characters" spellcheck="false" ' +
            'placeholder="····" aria-describedby="cerca-aiuto" />' +
          '<button type="submit" class="cerca__bottone">apri</button>' +
        "</div>" +
        '<p class="cerca__aiuto" id="cerca-aiuto">Le lettere sono stampate sotto il QR.</p>' +
      "</form>"
    );

    var form = elTeatro.querySelector(".cerca");
    var campo = elTeatro.querySelector(".codice");

    campo.addEventListener("input", function () {
      campo.value = campo.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    });

    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var valore = campo.value.trim().toUpperCase();
      if (valore.length < 4) {
        avviso("Servono tutte e quattro le lettere.");
        scuoti(campo);
        return;
      }
      apriConCodice(valore);
    });

    // niente autofocus: sul telefono la tastiera che salta su è fastidiosa
  }

  /* ---------------------------------------------------------------- sigillo */

  function mostraSigillo(g, sbloccoIso) {
    var quando = dataItaliana(sbloccoIso);
    var mancano = giorniA(sbloccoIso);
    mettiReperto(
      '<div class="sigillo">' +
        '<span class="sigillo__luna" aria-hidden="true">☾</span>' +
        '<p class="sigillo__testo">Questo cioccolatino l\'hai trovato in anticipo.</p>' +
        '<p class="sigillo__grande">' +
          (mancano === 1 ? "Manca un giorno" : "Mancano " + mancano + " giorni") +
        "</p>" +
        '<p class="sigillo__nota">La porticina si apre il ' + quando + ". Torna qui, il codice è già tuo.</p>" +
      "</div>"
    );
    etichettaStato("sigillata");
  }

  function mostraErrore(messaggio, riprova) {
    mettiReperto(
      '<div class="sigillo">' +
        '<span class="sigillo__luna" aria-hidden="true">✧</span>' +
        '<p class="sigillo__testo">' + proteggi(messaggio) + "</p>" +
        (riprova ? '<button type="button" class="cerca__bottone" id="riprova" style="margin-top:14px">riprova</button>' : "") +
      "</div>"
    );
    if (riprova) {
      var bottone = elTeatro.querySelector("#riprova");
      if (bottone) bottone.addEventListener("click", riprova);
    }
  }

  /* --------------------------------------------------------------- sblocco */

  function apriConCodice(codice, opzioni) {
    opzioni = opzioni || {};
    var pulito = String(codice || "").trim().toUpperCase();

    if (!opzioni.silenzioso) {
      etichettaStato("il lucchetto cede…");
    }

    api("/api/sblocca", { method: "POST", body: { codice: pulito } })
      .then(function (risposta) {
        stato.codici[risposta.giorno] = pulito;
        salvaStato();
        aggiornaConteggio();

        if (giornoAperto !== risposta.giorno) {
          // arrivati da un QR: bisogna aprire il teatro
          var g = perGiorno(risposta.giorno);
          if (!g) return;
          ultimoFocus = document.activeElement;
          giornoAperto = risposta.giorno;
          elVelato.hidden = false;
          document.body.classList.add("bloccato");
          costruisciGuscio(g, false);
        }
        mostraSvelato(risposta.svela);
        spalanca();
        suona();
        if (!opzioni.silenzioso) disegnaGriglia();
      })
      .catch(function (errore) {
        if (errore.stato === 423) {
          var g2 = perGiorno(errore.dati.giorno || giornoAperto);
          if (g2) {
            if (elVelato.hidden) {
              ultimoFocus = document.activeElement;
              giornoAperto = g2.giorno;
              elVelato.hidden = false;
              document.body.classList.add("bloccato");
              costruisciGuscio(g2, true);
            }
            mostraSigillo(g2, errore.dati.sblocco);
          }
          return;
        }
        if (errore.stato === 401) {
          if (opzioni.silenzioso && giornoAperto) {
            // il codice salvato non vale più (il JSON è cambiato): riparti dall'indizio
            delete stato.codici[giornoAperto];
            salvaStato();
            aggiornaConteggio();
            var gg = perGiorno(giornoAperto);
            if (gg) caricaIndizio(gg);
            return;
          }
          avviso("Queste lettere non aprono niente. Guarda meglio il cioccolatino.");
          scuoti(elTeatro.querySelector(".codice"));
          return;
        }
        avviso("Il calendario non risponde. Riprova tra un attimo.");
      });
  }

  /* --------------------------------------------------------------- svelato */

  function mostraSvelato(svela) {
    etichettaStato("aperta");
    var reperto = mettiReperto(pezzoSvelato(svela));
    if (!reperto) return;

    montaLettori(reperto);

    Array.prototype.forEach.call(reperto.querySelectorAll(".foto img"), function (img) {
      function fallisci() {
        if (!img.parentNode) return;
        img.parentNode.classList.add("senza-foto");
      }
      img.addEventListener("error", fallisci);
      if (img.complete && img.naturalWidth === 0) fallisci();
    });

    Array.prototype.forEach.call(reperto.querySelectorAll("[data-vuoto]"), function (el) {
      el.addEventListener("click", function (evento) {
        evento.preventDefault();
        avviso("Questo link va ancora riempito nel file calendario.json");
      });
    });

    Array.prototype.forEach.call(reperto.querySelectorAll(".foto"), function (foto) {
      if (!ridottoMovimento()) {
        foto.style.transform = "rotate(" + (Math.random() * 2 - 1).toFixed(2) + "deg)";
      }
    });

    scintille(reperto);

    var chiudiBtn = elTeatro.querySelector(".teatro__chiudi");
    if (chiudiBtn) chiudiBtn.focus();
  }

  function pezzoSvelato(svela) {
    if (!svela) return '<p class="pergamena__testo">vuoto.</p>';
    var tipo = svela.tipo || "lettera";

    if (tipo === "foto") {
      return (
        '<figure class="foto">' +
          '<img src="' + proteggiAttr(svela.immagine || "") + '" alt="' + proteggiAttr(svela.titolo || "") + '" />' +
          '<span class="foto__vuota" aria-hidden="true">' + proteggi(svela.titolo || "la foto") + "</span>" +
          "<figcaption>" + proteggi(svela.didascalia || "") + "</figcaption>" +
        "</figure>"
      );
    }

    if (tipo === "buono") {
      return (
        '<div class="buono">' +
          '<p class="buono__etichetta">buono</p>' +
          '<h3 class="buono__titolo">' + proteggi(svela.titolo || "") + "</h3>" +
          '<p class="buono__testo">' + proteggi(svela.testo || "") + "</p>" +
          '<div class="buono__strappo" aria-hidden="true"></div>' +
          '<p class="buono__validita">' + proteggi(svela.validita || "") + "</p>" +
        "</div>"
      );
    }

    if (tipo === "playlist") {
      var link = svela.link || "";
      return (
        '<div class="lettera">' +
          '<h3 class="lettera__titolo">' + proteggi(svela.titolo || "") + "</h3>" +
          '<p class="lettera__testo">' + proteggi(svela.testo || "") + "</p>" +
          (link
            ? '<a class="lettera__bottone" href="' + proteggiAttr(link) + '" target="_blank" rel="noopener">' +
                proteggi(svela.etichettaLink || "apri") + "</a>"
            : '<span class="lettera__bottone is-vuoto" data-vuoto="1" role="link" tabindex="0">' +
                proteggi(svela.etichettaLink || "apri") + "</span>") +
        "</div>"
      );
    }

    if (tipo === "audio") {
      return (
        '<div class="voce">' +
          '<p class="voce__etichetta">' + proteggi(svela.etichetta || "una voce") + "</p>" +
          '<div class="lettore" data-file="' + proteggiAttr(svela.file || "") + '">' +
            '<button type="button" class="lettore__pulsante" aria-label="riproduci">' + ICONA.play + "</button>" +
            '<div class="lettore__barra"><span class="lettore__solco"></span>' +
              '<span class="lettore__riempimento"></span></div>' +
            '<span class="lettore__tempo">0:00</span>' +
          "</div>" +
          (svela.testo ? '<p class="voce__testo">' + proteggi(svela.testo) + "</p>" : "") +
        "</div>"
      );
    }

    return (
      '<article class="lettera">' +
        '<h3 class="lettera__titolo">' + proteggi(svela.titolo || "") + "</h3>" +
        '<p class="lettera__testo">' + proteggi(svela.testo || "") + "</p>" +
        (modello && modello.firma ? '<p class="lettera__firma">' + proteggi(modello.firma) + "</p>" : "") +
        (svela.ornamento
          ? '<img class="lettera__ornamento" src="' + proteggiAttr(svela.ornamento) + '" alt="" aria-hidden="true" />'
          : "") +
      "</article>"
    );
  }

  /* ---------------------------------------------------------------- lettore */

  var ICONA = {
    play: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.2 10.5 6 2.5 10.8Z"/></svg>',
    pausa: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.4" y="1.4" width="2.8" height="9.2"/><rect x="6.8" y="1.4" width="2.8" height="9.2"/></svg>',
  };

  function orologio(secondi) {
    if (!isFinite(secondi) || secondi < 0) secondi = 0;
    var m = Math.floor(secondi / 60);
    var s = Math.floor(secondi % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function fermaAudio() {
    if (!audioCorrente) return;
    try {
      audioCorrente.pause();
      audioCorrente.currentTime = 0;
    } catch (e) {}
    audioCorrente = null;
  }

  function montaLettori(reperto) {
    Array.prototype.forEach.call(reperto.querySelectorAll(".lettore"), function (lettore) {
      var file = lettore.dataset.file;
      var pulsante = lettore.querySelector(".lettore__pulsante");
      var barra = lettore.querySelector(".lettore__barra");
      var riempimento = lettore.querySelector(".lettore__riempimento");
      var tempo = lettore.querySelector(".lettore__tempo");

      var audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.src = file;
      audio.hidden = true;
      lettore.appendChild(audio);

      function aggiorna() {
        var durata = audio.duration || 0;
        var pos = audio.currentTime || 0;
        riempimento.style.width = durata ? (pos / durata) * 100 + "%" : "0%";
        tempo.textContent = orologio(pos) + " / " + orologio(durata);
      }

      pulsante.addEventListener("click", function () {
        if (audio.paused) {
          if (audioCorrente && audioCorrente !== audio) audioCorrente.pause();
          audioCorrente = audio;
          audio.play().catch(function () {
            lettore.dataset.stato = "errore";
            tempo.textContent = "non si apre";
          });
        } else {
          audio.pause();
        }
      });

      audio.addEventListener("play", function () {
        pulsante.innerHTML = ICONA.pausa;
        pulsante.setAttribute("aria-label", "metti in pausa");
      });
      audio.addEventListener("pause", function () {
        pulsante.innerHTML = ICONA.play;
        pulsante.setAttribute("aria-label", "riproduci");
      });
      audio.addEventListener("timeupdate", aggiorna);
      audio.addEventListener("loadedmetadata", aggiorna);
      audio.addEventListener("ended", function () {
        aggiorna();
      });
      audio.addEventListener("error", function () {
        lettore.dataset.stato = "errore";
        tempo.textContent = "file non trovato";
        pulsante.disabled = true;
      });

      barra.addEventListener("click", function (evento) {
        if (!audio.duration) return;
        var riquadro = barra.getBoundingClientRect();
        var frazione = Math.min(1, Math.max(0, (evento.clientX - riquadro.left) / riquadro.width));
        audio.currentTime = frazione * audio.duration;
        aggiorna();
      });
    });
  }

  /* ---------------------------------------------------------------- effetti */

  function scintille(contenitore) {
    if (ridottoMovimento()) return;
    for (var i = 0; i < 16; i++) {
      var s = document.createElement("span");
      s.className = "scintilla";
      s.setAttribute("aria-hidden", "true");
      s.style.setProperty("--dx", (Math.random() * 150 - 75).toFixed(0) + "px");
      s.style.setProperty("--dy", (-30 - Math.random() * 80).toFixed(0) + "px");
      s.style.setProperty("--ritardo", (Math.random() * 240).toFixed(0) + "ms");
      s.style.left = 40 + Math.random() * 20 + "%";
      s.style.top = 34 + Math.random() * 26 + "%";
      contenitore.appendChild(s);
      (function (nodo) {
        setTimeout(function () {
          if (nodo.parentNode) nodo.parentNode.removeChild(nodo);
        }, 2100);
      })(s);
    }
  }

  function suona() {
    if (ridottoMovimento()) return;
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      [659.25, 987.77].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var guadagno = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        var inizio = ctx.currentTime + i * 0.11;
        guadagno.gain.setValueAtTime(0, inizio);
        guadagno.gain.linearRampToValueAtTime(0.05, inizio + 0.02);
        guadagno.gain.exponentialRampToValueAtTime(0.0001, inizio + 1.05);
        osc.connect(guadagno).connect(ctx.destination);
        osc.start(inizio);
        osc.stop(inizio + 1.15);
      });
      setTimeout(function () {
        ctx.close();
      }, 1900);
    } catch (e) {
      /* pazienza */
    }
  }

  /* ---------------------------------------------------------------- evento */

  function collegaEventi() {
    elVelato.addEventListener("click", function (evento) {
      if (evento.target === elVelato) chiudi();
    });

    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape" && !elVelato.hidden) chiudi();
    });

    var azzera = document.getElementById("azzera");
    if (azzera) {
      azzera.addEventListener("click", function () {
        if (!window.confirm("Azzerare tutto e ricominciare la caccia?")) return;
        try {
          localStorage.removeItem(chiave);
        } catch (e) {}
        location.href = "/";
      });
    }
  }

  function scriviIntestazione() {
    document.title = modello.titolo;
    var coppie = [
      ["occhiello", modello.destinataria],
      ["titolo", modello.titolo],
      ["sottotitolo", modello.sottotitolo],
    ];
    coppie.forEach(function (coppia) {
      var el = document.getElementById(coppia[0]);
      if (el && coppia[1]) el.textContent = coppia[1];
    });
    if (modello.prova && elNastro) elNastro.hidden = false;
  }

  /* ------------------------------------------------------------------ avvio */

  function codiceDaIndirizzo() {
    var trovato = /^\/t\/([A-Za-z]{4})\/?$/.exec(location.pathname);
    if (trovato) return trovato[1].toUpperCase();
    var parametro = new URLSearchParams(location.search).get("t");
    if (parametro && /^[A-Za-z]{4}$/.test(parametro.trim())) return parametro.trim().toUpperCase();
    return null;
  }

  function pulisciIndirizzo() {
    if (!window.history || !history.replaceState) return;
    try {
      history.replaceState({}, "", "/");
    } catch (e) {}
  }

  function avvia() {
    collegaEventi();

    api("/api/calendario")
      .then(function (risposta) {
        modello = risposta;
        // la memoria è legata ai codici: se cambiano, il progresso vecchio non vale più
        chiave = CHIAVE_BASE + (modello.impronta ? "." + modello.impronta : "");
        stato = leggiStato();
        scriviIntestazione();
        disegnaGriglia();

        var codice = codiceDaIndirizzo();
        if (codice) {
          pulisciIndirizzo();
          apriConCodice(codice, { silenzioso: true });
        }
      })
      .catch(function () {
        elGriglia.innerHTML =
          '<p class="vuoto">Il calendario non risponde.<br />Controlla che il server sia acceso e ricarica.</p>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", avvia);
  } else {
    avvia();
  }
})();
