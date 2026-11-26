'use strict';
/* Beleg oder Banking-Screenshot scannen: Foto -> Texterkennung (Tesseract, läuft auf dem Gerät) -> Ausgaben */

const OCR = {
  script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
};
const MAX_AMOUNT = 1000; // höhere Beträge gibt es nicht -> ignorieren (meist Lesefehler, Gehalt o. Ä.)

/* ---------- Text auswerten (ohne DOM, testbar) ---------- */
const ReceiptParser = (() => {
  const AMOUNT = /(?<![\d,.])(\d{1,3}(?:[.\s]\d{3})+|\d{1,5})\s?[,.]\s?(\d{2})(?![\d])/g;
  const TOTAL = /(zu\s*zahlen|gesamt|summe|total|endbetrag|zahlbetrag|rechnungsbetrag|betrag\s*eur|brutto)/i;
  const PAID = /(\bbar\b|\bec\b|girocard|karte|kartenzahlung|visa|mastercard|maestro|apple\s*pay|gegeben)/i;
  const SKIP = /(mwst|ust\b|ust\.|steuer|netto|r[uü]ckgeld|wechselgeld|zwischensumme|rabatt|pfand\s*r|%)/i;

  const toNum = (int, dec) => parseFloat(int.replace(/[.\s]/g, '') + '.' + dec);
  const amountsIn = line => [...line.matchAll(AMOUNT)].map(m => toNum(m[1], m[2])).filter(n => n > 0 && n <= MAX_AMOUNT);

  function total(lines){
    // 1) Zeile mit "Summe/Gesamt/Zu zahlen" (sonst Zahlungsart) – Betrag in der Zeile oder der nächsten
    for (const re of [TOTAL, PAID]){
      const cands = [];
      lines.forEach((l, i) => {
        if (!re.test(l) || SKIP.test(l)) return;
        let a = amountsIn(l);
        if (!a.length && lines[i+1] && !SKIP.test(lines[i+1])) a = amountsIn(lines[i+1]);
        if (a.length) cands.push(a[a.length - 1]);
      });
      if (cands.length) return Math.max(...cands);
    }
    // 2) Sonst größter Betrag außerhalb von Steuer-/Rückgeldzeilen
    const all = lines.filter(l => !SKIP.test(l)).flatMap(amountsIn);
    return all.length ? Math.max(...all) : null;
  }

  function date(text, today = new Date()){
    const re = /(?<!\d)(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4}|\d{2})(?!\d)/g;
    for (const m of text.matchAll(re)){
      let [, d, mo, y] = m.map(Number);
      if (y < 100) y += 2000;
      const r = validDate(y, mo, d, today);
      if (r) return r;
    }
    return null;
  }

  function store(lines){
    const bad = /(www\.|https?:|tel\.?|fax|str\.|straße|strasse|platz\b|\b\d{5}\b|ust|steuer|kasse|bon\b|beleg|filiale|datum|uhrzeit|^\W*$)/i;
    for (const l of lines.slice(0, 6)){
      const t = l.replace(/[^\p{L}\p{N}&'\- .]/gu, '').replace(/\s+/g, ' ').trim();
      const letters = (t.match(/\p{L}/gu) || []).length;
      if (letters < 3 || letters < t.length * 0.5 || bad.test(t) || t.length > 32) continue;
      return niceName(t);
    }
    return '';
  }

  function parse(text, today){
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return {amount: total(lines), date: date(text, today), store: store(lines), isReceipt: TOTAL.test(text)};
  }
  return {parse};
})();

function validDate(y, mo, d, today = new Date()){
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  const diff = (today - dt) / 864e5;
  if (diff < -1 || diff > 400) return null;
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
// GROSSBUCHSTABEN -> Normal; kurze Marken (REWE, ARAL, DM) bleiben
function niceName(t){
  if (t.length <= 5 || t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-&])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
}

/* Kategorien, wie Banking-Apps sie anzeigen -> App-Kategorie */
const BANK_CATS = [
  [/gastronomie|restaurant|essen\s*(&|und)\s*trinken|lieferdienst|caf[eé]s?\b|bars?\b/i, 'out'],
  [/lebensmittel|supermarkt/i, 'food'],
  [/mobilit[aä]t|verkehr|tank|lade(stelle|s[aä]ule|station)|e-?auto|[öo]pnv|auto\b|transport|taxi|parken|parkhaus|bahn|flug|reisen?\b/i, 'transport'],
  [/gesundheit|apotheke|medizin|drogerie|k[öo]rperpflege|beauty|friseur/i, 'health'],
  [/wohnen|miete|haushalt|energie|strom|nebenkosten|versicherung|internet|telefon|mobilfunk|telekommunikation|m[öo]bel|garten|baumarkt/i, 'home'],
  [/streaming|unterhaltung|freizeit|kultur|sport|hobby|urlaub|hotel|medien|abo(nnement)?s?\b|spiele|kino/i, 'fun'],
  [/shopping|kleidung|mode\b|elektronik|online.?shopping|einkaufen|geschenke/i, 'shop'],
  [/dienstleistung(en)?|sonstiges?|geb[uü]hren|bargeld|geldautomat|bildung|spenden|steuern|kinder|haustiere/i, 'other'],
];
// Typische Kategorie-Bezeichnungen der Banking-Apps (als ganze Zeile)
const BANK_CAT_LABELS = ['gastronomie','restaurants?','lebensmittel','supermarkt','shopping','streaming','hobby','hobbys','dienstleistungen',
  'tank-?\\s*(&|und)\\s*ladestelle','tankstelle','tanken','mobilit[aä]t','verkehr','[öo]ffentliche verkehrsmittel','[öo]pnv','auto','parken','taxi',
  'gesundheit','drogerie','k[öo]rperpflege','beauty','wohnen','miete','haushalt','energie','versicherungen?','telekommunikation','internet',
  'freizeit','unterhaltung','kultur','sport','reisen','urlaub','hotel','medien','abonnements?','kleidung','mode','elektronik','geschenke',
  'sonstiges','geb[uü]hren','bargeld','geldautomat','bargeldabhebung','barauszahlung','bildung','spenden','steuern','kinder','haustiere','lieferdienste?','caf[eé]s?','bars?','m[öo]bel','garten','baumarkt'];
const BANK_CAT_LINE = new RegExp('^(' + BANK_CAT_LABELS.join('|') + ')$', 'i');
// "Einkauf Hobby", "Lastschrift Versicherungen": Buchungsart + Kategorie
const TYPE_CAT = /^\s*(einkauf|kartenzahlung|lastschrift|basislastschrift|[üu]berweisung|dauerauftrag|gutschrift|bargeldabhebung|barauszahlung|auszahlung)\s+(.{3,30})$/i;

/* Banking-Screenshot: Liste von Umsätzen mit Datumsüberschriften */
const BankParser = (() => {
  const MONTHS = {jan:1, feb:2, mär:3, mae:3, mar:3, apr:4, mai:5, jun:6, jul:7, aug:8, sep:9, okt:10, oct:10, nov:11, dez:12, dec:12};
  // Betrag mit optionalem Vorzeichen und €/EUR; OCR liest das Minus oft als – oder ~
  const AMT = /(^|[^\d,.])([+\-−–—~]?)\s?(\d{1,3}(?:[.\s]\d{3})+|\d{1,5})\s?,\s?(\d{2})(?!\d)\s?(€|eur\b|e\b)?/i;
  const NOISE = /\b(kartenzahlung|lastschrift|sepa|basislastschrift|überweisung|ueberweisung|dauerauftrag|gutschrift|visa|mastercard|debit|girocard|apple\s*pay|google\s*pay|kartenumsatz|umsatz|vorgemerkt|ausstehend|abgeschlossen|einkauf|bargeldabhebung|barauszahlung|auszahlung|bargeldauszahlung)\b/gi;
  const BALANCE = /(kontostand|saldo|verf[uü]gbar|guthaben|dispo|gesamtbetrag|alle\s*ums)/i;

  function dateOf(line, today){
    const l = line.toLowerCase();
    if (/^\s*heute\b/.test(l)) return iso(today);
    if (/^\s*gestern\b/.test(l)) return iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
    let m = l.match(/(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?!\d)/);
    if (m){
      let y = m[3] ? +m[3] : today.getFullYear(); if (y < 100) y += 2000;
      let r = validDate(y, +m[2], +m[1], today);
      if (!r && !m[3]) r = validDate(y - 1, +m[2], +m[1], today);
      return r;
    }
    m = l.match(/(?<!\d)(\d{1,2})\.?\s+([a-zäöü]{3})[a-zäöü]*\.?\s*(\d{4})?/);
    if (m && MONTHS[m[2]]){
      const y = m[3] ? +m[3] : today.getFullYear();
      return validDate(y, MONTHS[m[2]], +m[1], today) || (!m[3] && validDate(y - 1, MONTHS[m[2]], +m[1], today));
    }
    return null;
  }
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const PREFIX = /^\s*(crv|paypal|pp\.?\d*|sumup|sq|zettle|izettle|ztl|stripe|klarna|vrp|lsp|sp|tst|google|apple\.com\/bill|amzn\s*mktp|amazon\s*mktp)\s*\*\s*/i;
  function cleanName(s){
    for (let k = 0; k < 4 && PREFIX.test(s); k++) s = s.replace(PREFIX, '');
    s = s.replace(/(\p{L}{3,}.*?)\s+\p{L}\.?\s*$/u, '$1');   // abgeschnitten: "Shop L" -> "Shop"
    const noLegal = s.replace(/[\s,\-]+(gmbh|mbh|ag|se|kg|ohg|ug|gbr|e\.?\s?k\.?|e\.?\s?v\.?|ltd\.?|inc\.?|llc|s\.?a\.?r\.?l\.?|b\.?v\.?|s\.?a\.?)\b.*$/i, '');
    if ((noLegal.match(/\p{L}/gu) || []).length >= 3) s = noLegal;
    s = s.replace(/[\/\\;:,.\-–]+\s*$/, '');
    return niceName(s.replace(NOISE, ' ').replace(/[|_*#@<>»«©®"]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–.,:]+|[\s\-–.,:]+$/g, '').trim());
  }
  const isNameLike = s => (s.match(/\p{L}/gu) || []).length >= 3;

  // Live Text kopiert die Spalten manchmal getrennt oder in gemischten Stücken.
  // Dann: alle Namen in Lesereihenfolge (mit Datum davor) und alle Beträge in Lesereihenfolge
  // (mit Kategorie danach) sammeln und der Reihe nach verbinden – wenn die Anzahl genau passt.
  // loose = true: auch eine unbekannte Zeile direkt nach einem Betrag gilt als dessen Kategorie.
  function parseSequence(lines, today, loose){
    const names = [], amts = [];
    let curDate = null, prevWasAmount = false;
    for (const line of lines){
      if (BALANCE.test(line)){ prevWasAmount = false; continue; }
      const m = line.match(AMT);
      const d = dateOf(line, today);
      if (m){
        const own = cleanName(line.slice(0, m.index + m[1].length).replace(/(?<!\d)\d{1,2}\.\d{1,2}\.(\d{2,4})?/, ''));
        if (isNameLike(own)) names.push({name: own, date: d || curDate});
        amts.push({sign: m[2] ? (m[2] === '+' ? '+' : '-') : '', amount: parseFloat(m[3].replace(/[.\s]/g, '') + '.' + m[4]), hasCurrency: !!m[5]});
        prevWasAmount = true;
        continue;
      }
      if (d){ curDate = d; prevWasAmount = false; continue; }
      const tc = line.match(TYPE_CAT);
      const n = tc ? tc[2].trim() : cleanName(line);
      const last = amts[amts.length - 1];
      if (tc || BANK_CAT_LINE.test(n) || (loose && prevWasAmount && last && !last.bankCat)){
        // Kategorie: zum nächstliegenden Betrag ohne Kategorie
        const target = (prevWasAmount && last && !last.bankCat) ? last : amts.find(x => !x.bankCat) || last;
        if (target && !target.bankCat && isNameLike(n)) target.bankCat = n;
        prevWasAmount = false;
        continue;
      }
      if (isNameLike(n)) names.push({name: n, date: curDate});
      prevWasAmount = false;
    }
    if (amts.length < 2 || names.length !== amts.length) return null;
    return amts.map((x, i) => ({...x, name: names[i].name, date: names[i].date}));
  }

  function parse(text, today = new Date()){
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const raw = [];
    let curDate = null, pendingName = '', dateHeaders = 0, unused = 0;   // unused: Namen ohne Betrag
    let block = {names: [], nameless: []};             // Abschnitt zwischen Datumsüberschriften
    const closeBlock = () => {
      // Live Text kopiert manchmal erst alle Namen, dann alle Beträge: dann der Reihe nach zuordnen
      if (block.nameless.length > 1 && block.names.length === block.nameless.length)
        block.nameless.forEach((r, i) => { r.name = block.names[i]; });
      block = {names: [], nameless: []};
    };
    for (const line of lines){
      if (BALANCE.test(line)){ pendingName = ''; continue; }
      const m = line.match(AMT);
      const d = dateOf(line, today);
      if (!m){
        if (d){ closeBlock(); if (pendingName) unused++; curDate = d; dateHeaders++; pendingName = ''; continue; }
        const tc = line.match(TYPE_CAT);
        const n = tc ? tc[2].trim() : cleanName(line);
        if (tc || BANK_CAT_LINE.test(n)){
          const last = raw[raw.length - 1];
          if (last && !last.bankCat && isNameLike(n)) last.bankCat = n;
          continue;
        }
        if (isNameLike(n)){ if (pendingName) unused++; pendingName = n; block.names.push(n); }
        continue;
      }
      const sign = m[2] ? (m[2] === '+' ? '+' : '-') : '';
      const amount = parseFloat(m[3].replace(/[.\s]/g, '') + '.' + m[4]);
      let name = cleanName(line.slice(0, m.index + m[1].length).replace(/(?<!\d)\d{1,2}\.\d{1,2}\.(\d{2,4})?/, ''));
      const own = isNameLike(name);
      if (!own) name = pendingName;
      const r = {name, amount, sign, date: d || curDate, hasCurrency: !!m[5]};
      raw.push(r);
      if (!own) block.nameless.push(r); else block.names.push(name);
      pendingName = '';
    }
    closeBlock();
    // Fehlen Namen, aber passt die Spalten-Zuordnung genau, diese nehmen
    if (pendingName) unused++;
    if (raw.some(r => !r.name) || unused){
      const seq = parseSequence(lines, today, false) || parseSequence(lines, today, true);
      if (seq) raw.splice(0, raw.length, ...seq);
    }
    const firstDated = raw.find(r => r.date);
    raw.forEach(r => { if (!r.date && firstDated){ r.date = firstDated.date; r.dateGuess = true; } });
    const minus = raw.filter(r => r.sign === '-').length;
    const entries = raw
      .filter(r => r.sign !== '+')                             // Plus (Gutschriften) immer ignorieren
      .filter(r => minus ? r.sign === '-' : true)              // gibt es Minus-Beträge, nur diese
      .filter(r => r.amount > 0 && r.amount <= MAX_AMOUNT)     // > 1000 € ignorieren
      .map(r => (/geldautomat|bargeld/i.test(r.bankCat || '') && (!r.name || /\d{3,}/.test(r.name)) ? {...r, name: 'Bargeld'} : r))
      .map(r => ({name: r.name || '', amount: Math.round(r.amount), date: r.date || iso(today), dateGuess: !!r.dateGuess || !r.date, bankCat: r.bankCat || ''}))
      .filter(r => r.amount > 0);
    const signed = raw.filter(r => r.sign).length;
    const looksLikeBank = raw.length >= 2 && (signed >= 2 || dateHeaders >= 1 || raw.filter(r => r.hasCurrency).length >= 2);
    return {entries, looksLikeBank};
  }
  return {parse};
})();

/* Kategorie erraten: erst eigene frühere Notizen, dann Stichwörter */
const CAT_HINTS = [
  [/rewe|edeka|aldi|lidl|netto|penny|kaufland|norma|globus|tegut|real\b|bäck|baeck|metzger|alnatura|denns|supermarkt/i, 'food'],
  [/restaurant|pizz|café|cafe|bistro|imbiss|burger|mcdonald|kebab|döner|doner|sushi|\bbar\b|brauhaus|gasthaus|starbucks|lieferando|wolt/i, 'out'],
  [/aral|shell|esso|\bjet\b|tankstelle|\bdb\b|bahn|mvg|bvg|hvv|taxi|uber|bolt|parken|parkhaus|flixbus/i, 'transport'],
  [/apotheke|arzt|praxis|klinik|optik/i, 'health'],
  [/kino|cinema|theater|museum|zoo|therme|fitness|netflix|spotify|disney/i, 'fun'],
  [/ikea|\bobi\b|bauhaus|hornbach|toom|miete|strom|stadtwerke|telekom|vodafone|o2\b/i, 'home'],
  [/\bdm\b|rossmann|müller|mueller|h&m|zara|primark|mediamarkt|saturn|amazon|tk ?maxx|c&a|deichmann|zalando|otto\b/i, 'shop'],
];
function bankCatToApp(bankCat){
  if (!bankCat) return null;
  const own = state.cats.find(c => c.name.toLowerCase() === bankCat.toLowerCase());   // eigene Kategorie gleichen Namens
  if (own) return own.id;
  const hit = BANK_CATS.find(([re]) => re.test(bankCat));
  return hit && state.cats.some(c => c.id === hit[1]) ? hit[1] : null;
}
function guessCat(storeName, bankCat){
  if (!storeName) return bankCatToApp(bankCat);
  const s = storeName.toLowerCase();
  const prev = state.items.slice().reverse().find(i => i.note && (i.note.toLowerCase().includes(s) || s.includes(i.note.toLowerCase())));
  if (prev && state.cats.some(c => c.id === prev.cat)) return prev.cat;
  if (/^bargeld$/i.test(storeName.trim()) || DANCE.test(storeName)){   // Bargeld & Tanz-Orte -> Tanzen
    const t = state.cats.find(c => /^tanzen$/i.test(c.name));
    if (t) return t.id;
  }
  const fromBank = bankCatToApp(bankCat);
  if (fromBank) return fromBank;
  const hit = CAT_HINTS.find(([re]) => re.test(storeName));
  return hit && state.cats.some(c => c.id === hit[1]) ? hit[1] : null;
}

/* ---------- Bild vorbereiten & erkennen ---------- */
function loadScript(src){
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Texterkennung konnte nicht geladen werden – Internet nötig'));
    document.head.appendChild(s);
  });
}
// Graustufen + Kontrast; dunkle Bilder (Dark-Mode-Screenshots) werden invertiert
async function prepareImage(file){
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d', {willReadFrequently: true});
  g.drawImage(img, 0, 0, c.width, c.height);
  const im = g.getImageData(0, 0, c.width, c.height), px = im.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4){ const y = 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2]; px[i] = y; sum += y; }
  const invert = sum / (px.length / 4) < 110;
  for (let i = 0; i < px.length; i += 4){
    let y = px[i]; if (invert) y = 255 - y;
    y = Math.max(0, Math.min(255, (y - 128) * 1.4 + 128));
    px[i] = px[i+1] = px[i+2] = y;
  }
  g.putImageData(im, 0, 0);
  return c;
}
let ocrWorker = null, ocrProgress = () => {};
async function recognize(file, onProgress){
  ocrProgress = onProgress;
  await loadScript(OCR.script);
  if (!ocrWorker){
    ocrWorker = await Tesseract.createWorker('deu', 1, {
      logger: m => { if (m.status === 'recognizing text') ocrProgress(m.progress); },
    });
  }
  const canvas = await prepareImage(file);
  const {data} = await ocrWorker.recognize(canvas);
  return data.text;
}

/* ---------- Oberfläche: Scan-Taste im Eingabefenster ---------- */
$('scanBtn').onclick = () => $('scanFile').click();
function applyText(text){
  const receipt = ReceiptParser.parse(text);
  const bank = BankParser.parse(text);
  if (!receipt.isReceipt && bank.looksLikeBank && bank.entries.length){
    renderAmount();
    closeSheet('expenseSheet');
    openImport(bank.entries, text);
    return;
  }
  if (receipt.amount) amountStr = String(Math.round(receipt.amount));
  renderAmount(); renderSuggest();
  if (receipt.date) $('date').value = receipt.date;
  // Name vom Bon ersetzt einen automatisch eingetragenen Ort, aber nie selbst Getipptes
  if (receipt.store && noteSource !== 'user'){ locRun++; setLocBadge(''); $('note').placeholder = 'Notiz'; $('note').value = receipt.store; noteSource = 'receipt'; }
  const c = !catTouched && guessCat(receipt.store);
  if (c){ selCat = c; renderChips(); renderSuggest(); }
  const found = [receipt.amount && 'Betrag', receipt.date && 'Datum', receipt.store && 'Geschäft'].filter(Boolean);
  toast(found.length ? `Übernommen: ${found.join(', ')} – bitte prüfen` : 'Kein Betrag bis 1000 € erkannt – bitte von Hand eingeben');
}

$('scanFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const session = sheetSession;
  const btn = $('scanBtn');
  const msg = t => { if (session === sheetSession) $('amountDisplay').innerHTML = `<span class="ph msg">${t}</span>`; };
  btn.classList.add('busy'); btn.disabled = true;
  msg('Bild wird gelesen …');
  try {
    const text = await recognize(file, p => msg(`Bild wird gelesen … ${Math.round(p * 100)} %`));
    if (session !== sheetSession) return;
    applyText(text);
  } catch (err) {
    renderAmount();
    toast(err.message || 'Bild konnte nicht gelesen werden');
  } finally {
    btn.classList.remove('busy'); btn.disabled = false;
  }
};

/* ---------- Text einfügen (z. B. mit Live Text vom iPhone kopiert) ---------- */
$('pasteBtn').onclick = async () => {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch {}
  if (text && /\d[,.]\d{2}/.test(text)) return applyText(text);
  // Zwischenablage nicht lesbar oder leer: Feld zum Einfügen anzeigen
  $('pasteArea').value = text || '';
  openSheet('pasteSheet');
  setTimeout(() => $('pasteArea').focus(), 350);
};
$('pasteGo').onclick = () => {
  const text = $('pasteArea').value;
  if (!/\d[,.]\d{2}/.test(text)){ toast('Kein Betrag im Text gefunden'); return; }
  closeSheet('pasteSheet');
  applyText(text);
};

/* ---------- Mehrere Ausgaben aus Screenshot prüfen & übernehmen ---------- */
let importRows = [];
function isDuplicate(r){
  const n = (r.name || '').toLowerCase();
  if (!n) return false;
  return state.items.some(i => i.date === r.date && Math.round(i.amount) === r.amount
    && (!i.note || i.note.toLowerCase().includes(n.slice(0, 5)) || n.includes(i.note.toLowerCase().slice(0, 5))));
}
function completeNames(entries){
  const known = [...new Set([...entries.map(e => e.name), ...state.items.map(i => i.note).filter(Boolean)])];
  entries.forEach(e => {
    if (!e.name || e.name.length < 5) return;
    const n = e.name.toLowerCase();
    const longer = known.filter(k => k.length > e.name.length && k.toLowerCase().startsWith(n)).sort((a, b) => a.length - b.length)[0];
    if (longer) e.name = longer;
  });
  return entries;
}
let importText = '';
function openImport(entries, text){
  importText = text || '';
  completeNames(entries);
  importRows = entries.map(e => {
    const dup = isDuplicate(e);
    return {...e, cat: guessCat(e.name, e.bankCat) || (state.cats.find(c => c.id === 'other') || state.cats[0]).id, on: !dup && !!e.name, dup};
  });
  renderImport();
  openSheet('importSheet');
}
function renderImport(){
  const catOpts = id => state.cats.map(c => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  $('importList').innerHTML = importRows.map((r, i) => `
    <div class="imp ${r.on ? '' : 'off'}" data-i="${i}">
      <button class="check ${r.on ? 'on' : ''}" data-act="toggle" aria-label="Übernehmen"></button>
      <div class="impBody">
        <input class="impName" data-f="name" value="${esc(r.name)}" placeholder="Name fehlt – bitte eintragen" autocomplete="off">
        <div class="impMeta">
          <select data-f="cat">${catOpts(r.cat)}</select>
          <label class="impDate ${r.dateGuess ? 'guess' : ''}">${r.dateGuess ? '? ' : ''}${new Date(r.date + 'T12:00').toLocaleDateString('de-DE', {day:'numeric', month:'short'})}<input type="date" data-f="date" value="${r.date}"></label>
          ${r.dup ? '<span class="impDup">schon erfasst</span>' : ''}
        </div>
      </div>
      <div class="impAmt"><input data-f="amount" inputmode="numeric" value="${r.amount}"><span>€</span></div>
    </div>`).join('');
  const n = importRows.filter(r => r.on).length;
  $('importSave').textContent = n ? `Hinzufügen (${n})` : 'Hinzufügen';
  $('importSave').disabled = !n;
  $('importInfo').textContent = `${importRows.length} Ausgabe${importRows.length === 1 ? '' : 'n'} erkannt · Gutschriften und Beträge über 1000 € werden ignoriert.`;
  $('importRaw').hidden = !importText;
}
$('importList').onclick = e => {
  const b = e.target.closest('[data-act=toggle]'); if (!b) return;
  const r = importRows[+b.closest('.imp').dataset.i]; r.on = !r.on; renderImport();
};
$('importList').onchange = e => {
  const f = e.target.dataset.f; if (!f) return;
  const r = importRows[+e.target.closest('.imp').dataset.i];
  if (f === 'amount'){
    const n = Math.round(parseFloat(e.target.value.replace(',', '.')));
    r.amount = n > 0 && n <= MAX_AMOUNT ? n : r.amount;
    if (!(n > 0 && n <= MAX_AMOUNT)) toast('Nur Beträge von 1 bis 1000 €');
    renderImport();
  } else if (f === 'date'){ if (e.target.value){ r.date = e.target.value; r.dateGuess = false; r.dup = isDuplicate(r); } renderImport(); }
  else if (f === 'cat'){
    // gleiche Namen in der Liste mitändern; beim Hinzufügen auch für gespeicherte Ausgaben übernehmen
    importRows.forEach(x => { if (x === r || sameName(x.name, r.name)){ x.cat = e.target.value; x.catChanged = true; } });
    renderImport();
  }
  else { r[f] = e.target.value.trim(); if (f === 'name' && r.name && !r.on && !r.dup){ r.on = true; renderImport(); } }
};
$('importSave').onclick = () => {
  const rows = importRows.filter(r => r.on && r.amount > 0);
  let id = Date.now();
  const ids = new Set();
  rows.forEach(r => { ids.add(id); state.items.push({id: id++, amount: r.amount, cat: r.cat, note: r.name, date: r.date}); });
  const catUndo = [];
  rows.filter(r => r.catChanged && r.name).forEach(r => catUndo.push(...applyCatToName(r.name, r.cat).filter(([i]) => !ids.has(i.id))));
  save(); closeSheet('importSheet');
  const last = rows.map(r => r.date).sort().pop();
  if (last){ const [y, m] = last.split('-').map(Number); view = new Date(y, m - 1, 1); }
  render();
  toast(`${rows.length} Ausgabe${rows.length === 1 ? '' : 'n'} hinzugefügt`, 'Rückgängig', () => {
    state.items = state.items.filter(i => !ids.has(i.id));
    catUndo.forEach(([i, old]) => i.cat = old);
    save(); render();
  });
};

/* Erkannten Text anzeigen (zum Prüfen / Weiterschicken) */
$('importRaw').onclick = () => {
  $('pasteArea').value = importText;
  closeSheet('importSheet');
  openSheet('pasteSheet');
  toast('Erkannter Text – zum Kopieren gedrückt halten');
};
