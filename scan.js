'use strict';
/* Beleg scannen: Foto -> Texterkennung (Tesseract, läuft auf dem Gerät) -> Betrag, Datum, Geschäft */

const OCR = {
  script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
};

/* ---------- Text auswerten (ohne DOM, testbar) ---------- */
const ReceiptParser = (() => {
  const AMOUNT = /(?<![\d,.])(\d{1,3}(?:[.\s]\d{3})+|\d{1,5})\s?[,.]\s?(\d{2})(?![\d])/g;
  const TOTAL = /(zu\s*zahlen|gesamt|summe|total|endbetrag|zahlbetrag|rechnungsbetrag|betrag\s*eur|brutto)/i;
  const PAID = /(\bbar\b|\bec\b|girocard|karte|kartenzahlung|visa|mastercard|maestro|apple\s*pay|gegeben)/i;
  const SKIP = /(mwst|ust\b|ust\.|steuer|netto|r[uü]ckgeld|wechselgeld|zwischensumme|rabatt|pfand\s*r|%)/i;

  const toNum = (int, dec) => parseFloat(int.replace(/[.\s]/g, '') + '.' + dec);
  const amountsIn = line => [...line.matchAll(AMOUNT)].map(m => toNum(m[1], m[2])).filter(n => n > 0 && n < 100000);

  function total(lines){
    // 1) Zeile mit "Summe/Gesamt/Zu zahlen" – Betrag in der Zeile oder der nächsten
    for (let pass = 0; pass < 2; pass++){
      const re = pass === 0 ? TOTAL : PAID;
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
      const dt = new Date(y, mo - 1, d);
      if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) continue;
      const diff = (today - dt) / 864e5;
      if (diff >= -1 && diff < 400) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
    return null;
  }

  function store(lines){
    const bad = /(www\.|https?:|tel\.?|fax|str\.|straße|strasse|platz\b|\b\d{5}\b|ust|steuer|kasse|bon\b|beleg|filiale|datum|uhrzeit|^\W*$)/i;
    for (const l of lines.slice(0, 6)){
      const t = l.replace(/[^\p{L}\p{N}&'\- .]/gu, '').replace(/\s+/g, ' ').trim();
      const letters = (t.match(/\p{L}/gu) || []).length;
      if (letters < 3 || letters < t.length * 0.5 || bad.test(t) || t.length > 32) continue;
      // GROSSBUCHSTABEN -> Normal; kurze Marken (REWE, ARAL, DM) bleiben
      if (t.length <= 5 || t !== t.toUpperCase()) return t;
      return t.toLowerCase().replace(/(^|[\s\-&])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
    }
    return '';
  }

  function parse(text, today){
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return {amount: total(lines), date: date(text, today), store: store(lines)};
  }
  return {parse};
})();

/* Kategorie erraten: erst eigene frühere Notizen, dann Stichwörter */
const CAT_HINTS = [
  [/rewe|edeka|aldi|lidl|netto|penny|kaufland|norma|globus|tegut|real|bäck|baeck|metzger|bio|denns|alnatura|markt/i, 'food'],
  [/restaurant|pizz|café|cafe|bistro|imbiss|burger|mcdonald|kebab|döner|doner|sushi|bar\b|brauhaus|gasthaus|starbucks/i, 'out'],
  [/aral|shell|esso|jet\b|total|tankstelle|db\b|bahn|mvg|bvg|hvv|taxi|uber|parken|parkhaus/i, 'transport'],
  [/apotheke|arzt|praxis|klinik|optik/i, 'health'],
  [/kino|cinema|theater|museum|zoo|bad\b|therme|fitness/i, 'fun'],
  [/ikea|obi|bauhaus|hornbach|toom/i, 'home'],
  [/dm\b|rossmann|müller|mueller|h&m|zara|primark|mediamarkt|saturn|amazon|tk ?maxx|c&a|deichmann/i, 'shop'],
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
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Texterkennung konnte nicht geladen werden (Internet nötig beim ersten Mal)'));
    document.head.appendChild(s);
  });
}
async function prepareImage(file){
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
let ocrWorker = null;
async function recognize(file, onProgress){
  await loadScript(OCR.script);
  if (!ocrWorker){
    ocrWorker = await Tesseract.createWorker('deu', 1, {
      logger: m => { if (m.status === 'recognizing text') onProgress(m.progress); },
    });
  }
  const canvas = await prepareImage(file);
  const {data} = await ocrWorker.recognize(canvas);
  return data.text;
}

/* ---------- Oberfläche ---------- */
$('scanBtn').onclick = () => $('scanFile').click();
$('scanFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const session = sheetSession;
  const btn = $('scanBtn');
  btn.classList.add('busy'); btn.disabled = true;
  $('amountDisplay').innerHTML = '<span class="ph msg">Beleg wird gelesen …</span>';
  try {
    const text = await recognize(file, p => {
      if (session === sheetSession) $('amountDisplay').innerHTML = `<span class="ph msg">Beleg wird gelesen … ${Math.round(p * 100)} %</span>`;
    });
    if (session !== sheetSession) return;
    const r = ReceiptParser.parse(text);
    if (r.amount){ amountStr = String(Math.round(r.amount)); }
    renderAmount(); renderSuggest();
    if (r.date) $('date').value = r.date;
    if (r.store && !$('note').value.trim()){ locRun++; setLocBadge(''); $('note').placeholder = 'Notiz'; $('note').value = r.store; }
    const c = !catTouched && guessCat(r.store);
    if (c){ selCat = c; renderChips(); renderSuggest(); }
    const found = [r.amount && 'Betrag', r.date && 'Datum', r.store && 'Geschäft'].filter(Boolean);
    toast(found.length ? `Übernommen: ${found.join(', ')} – bitte prüfen` : 'Kein Betrag erkannt – bitte von Hand eingeben');
  } catch (err) {
    renderAmount();
    toast(err.message || 'Beleg konnte nicht gelesen werden');
  } finally {
    btn.classList.remove('busy'); btn.disabled = false;
  }
};
