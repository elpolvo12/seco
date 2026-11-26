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

/* Banking-Screenshot: Liste von Umsätzen mit Datumsüberschriften */
const BankParser = (() => {
  const MONTHS = {jan:1, feb:2, mär:3, mae:3, mar:3, apr:4, mai:5, jun:6, jul:7, aug:8, sep:9, okt:10, oct:10, nov:11, dez:12, dec:12};
  // Betrag mit optionalem Vorzeichen und €/EUR; OCR liest das Minus oft als – oder ~
  const AMT = /(^|[^\d,.])([+\-−–—~]?)\s?(\d{1,3}(?:[.\s]\d{3})+|\d{1,5})\s?,\s?(\d{2})(?!\d)\s?(€|eur\b|e\b)?/i;
  const NOISE = /\b(kartenzahlung|lastschrift|sepa|basislastschrift|überweisung|ueberweisung|dauerauftrag|gutschrift|visa|mastercard|debit|girocard|apple\s*pay|google\s*pay|kartenumsatz|umsatz|vorgemerkt|ausstehend|abgeschlossen|einkauf)\b/gi;
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

  function cleanName(s){
    return niceName(s.replace(NOISE, ' ').replace(/[|_*#@<>»«©®"]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–.,:]+|[\s\-–.,:]+$/g, '').trim());
  }
  const isNameLike = s => (s.match(/\p{L}/gu) || []).length >= 3;

  function parse(text, today = new Date()){
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const raw = [];
    let curDate = null, pendingName = '', dateHeaders = 0;
    for (const line of lines){
      if (BALANCE.test(line)){ pendingName = ''; continue; }
      const m = line.match(AMT);
      const d = dateOf(line, today);
      if (!m){
        if (d){ curDate = d; dateHeaders++; pendingName = ''; continue; }
        const n = cleanName(line);
        if (isNameLike(n)) pendingName = n;
        continue;
      }
      const sign = m[2] ? (m[2] === '+' ? '+' : '-') : '';
      const amount = parseFloat(m[3].replace(/[.\s]/g, '') + '.' + m[4]);
      let name = cleanName(line.slice(0, m.index + m[1].length).replace(/(?<!\d)\d{1,2}\.\d{1,2}\.(\d{2,4})?/, ''));
      if (!isNameLike(name)) name = pendingName;
      raw.push({name, amount, sign, date: d || curDate, hasCurrency: !!m[5]});
      pendingName = '';
    }
    const signed = raw.filter(r => r.sign).length;
    const entries = raw
      .filter(r => signed ? r.sign === '-' : true)            // mit Vorzeichen: nur Abbuchungen
      .filter(r => r.amount > 0 && r.amount <= MAX_AMOUNT)     // > 1000 € ignorieren
      .filter(r => r.name)
      .map(r => ({name: r.name, amount: Math.round(r.amount), date: r.date || iso(today)}))
      .filter(r => r.amount > 0);
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
function guessCat(storeName){
  if (!storeName) return null;
  const s = storeName.toLowerCase();
  const prev = state.items.slice().reverse().find(i => i.note && (i.note.toLowerCase().includes(s) || s.includes(i.note.toLowerCase())));
  if (prev && state.cats.some(c => c.id === prev.cat)) return prev.cat;
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
    const receipt = ReceiptParser.parse(text);
    const bank = BankParser.parse(text);
    if (!receipt.isReceipt && bank.looksLikeBank && bank.entries.length){
      renderAmount();
      closeSheet('expenseSheet');
      openImport(bank.entries);
      return;
    }
    if (receipt.amount) amountStr = String(Math.round(receipt.amount));
    renderAmount(); renderSuggest();
    if (receipt.date) $('date').value = receipt.date;
    if (receipt.store && !$('note').value.trim()){ locRun++; setLocBadge(''); $('note').placeholder = 'Notiz'; $('note').value = receipt.store; }
    const c = !catTouched && guessCat(receipt.store);
    if (c){ selCat = c; renderChips(); renderSuggest(); }
    const found = [receipt.amount && 'Betrag', receipt.date && 'Datum', receipt.store && 'Geschäft'].filter(Boolean);
    toast(found.length ? `Übernommen: ${found.join(', ')} – bitte prüfen` : 'Kein Betrag bis 1000 € erkannt – bitte von Hand eingeben');
  } catch (err) {
    renderAmount();
    toast(err.message || 'Bild konnte nicht gelesen werden');
  } finally {
    btn.classList.remove('busy'); btn.disabled = false;
  }
};

/* ---------- Mehrere Ausgaben aus Screenshot prüfen & übernehmen ---------- */
let importRows = [];
function isDuplicate(r){
  const n = r.name.toLowerCase();
  return state.items.some(i => i.date === r.date && Math.round(i.amount) === r.amount
    && (!i.note || i.note.toLowerCase().includes(n.slice(0, 5)) || n.includes(i.note.toLowerCase().slice(0, 5))));
}
function openImport(entries){
  importRows = entries.map(e => {
    const dup = isDuplicate(e);
    return {...e, cat: guessCat(e.name) || selCat || state.cats[0].id, on: !dup, dup};
  });
  renderImport();
  openSheet('importSheet');
}
function renderImport(){
  const catOpts = id => state.cats.map(c => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.ico} ${esc(c.name)}</option>`).join('');
  $('importList').innerHTML = importRows.map((r, i) => `
    <div class="imp ${r.on ? '' : 'off'}" data-i="${i}">
      <button class="check ${r.on ? 'on' : ''}" data-act="toggle" aria-label="Übernehmen"></button>
      <div class="impBody">
        <input class="impName" data-f="name" value="${esc(r.name)}" autocomplete="off">
        <div class="impMeta">
          <select data-f="cat">${catOpts(r.cat)}</select>
          <span class="impDate">${new Date(r.date + 'T12:00').toLocaleDateString('de-DE', {day:'numeric', month:'short'})}</span>
          ${r.dup ? '<span class="impDup">schon erfasst</span>' : ''}
        </div>
      </div>
      <div class="impAmt"><input data-f="amount" inputmode="numeric" value="${r.amount}"><span>€</span></div>
    </div>`).join('');
  const n = importRows.filter(r => r.on).length;
  $('importSave').textContent = n ? `Hinzufügen (${n})` : 'Hinzufügen';
  $('importSave').disabled = !n;
  $('importInfo').textContent = `${importRows.length} Ausgabe${importRows.length === 1 ? '' : 'n'} erkannt · Gutschriften und Beträge über 1000 € werden ignoriert.`;
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
  } else r[f] = e.target.value.trim();
};
$('importSave').onclick = () => {
  const rows = importRows.filter(r => r.on && r.amount > 0);
  let id = Date.now();
  const ids = new Set();
  rows.forEach(r => { ids.add(id); state.items.push({id: id++, amount: r.amount, cat: r.cat, note: r.name, date: r.date}); });
  save(); closeSheet('importSheet');
  const last = rows.map(r => r.date).sort().pop();
  if (last){ const [y, m] = last.split('-').map(Number); view = new Date(y, m - 1, 1); }
  render();
  toast(`${rows.length} Ausgabe${rows.length === 1 ? '' : 'n'} hinzugefügt`, 'Rückgängig', () => {
    state.items = state.items.filter(i => !ids.has(i.id)); save(); render();
  });
};
