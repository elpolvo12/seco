'use strict';

/* ---------- Farben (validierte Kategorie-Palette, hell/dunkel) ---------- */
const BASE_PALETTE = {
  light: ['#257de0','#f47230','#00b894','#f2a600','#ee7fac','#008a17','#6a4ce2','#ec4647','#8e8e93'],
  dark:  ['#338ced','#e76624','#00a888','#d28e05','#e24d8b','#0aac23','#9887ef','#eb6263','#98989f'],
};
/* Weitere Töne: Plätze 9–16 und 17–24 sind hellere/dunklere Varianten der 8 Farben (Plätze 0–7) */
const mixHex = (hex, to, t) => {
  const a = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), b = [1, 3, 5].map(i => parseInt(to.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const PALETTE = {
  light: [...BASE_PALETTE.light, ...BASE_PALETTE.light.slice(0, 8).map(h => mixHex(h, '#000000', .30)), ...BASE_PALETTE.light.slice(0, 8).map(h => mixHex(h, '#ffffff', .40))],
  dark:  [...BASE_PALETTE.dark,  ...BASE_PALETTE.dark.slice(0, 8).map(h => mixHex(h, '#ffffff', .40)),  ...BASE_PALETTE.dark.slice(0, 8).map(h => mixHex(h, '#000000', .24))],
};
const range = (from, n) => Array.from({length: n}, (_, i) => from + i);
const SWATCH_ORDER = [...range(0, 8), ...range(9, 8), ...range(17, 8), 8];
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (state.theme || 'dark') === 'dark' || (state.theme === 'system' && darkMQ.matches);
const color = slot => PALETTE[isDark() ? 'dark' : 'light'][slot] ?? PALETTE.light[8];

const DEFAULT_CATS = [
  {id:'food',     name:'Lebensmittel', ico:'cart',       c:5},
  {id:'out',      name:'Restaurant',   ico:'restaurant', c:1},
  {id:'transport',name:'Verkehr',      ico:'bus',        c:0},
  {id:'home',     name:'Wohnen',       ico:'home',       c:6},
  {id:'fun',      name:'Freizeit',     ico:'ticket',     c:4},
  {id:'shop',     name:'Shopping',     ico:'bag',        c:2},
  {id:'health',   name:'Gesundheit',   ico:'health',     c:7},
  {id:'other',    name:'Sonstiges',    ico:'box',        c:3},
];
const UNKNOWN = {id:'?', name:'Ohne Kategorie', ico:'help', c:8};

/* ---------- Speicher ---------- */
const KEY = 'ausgaben.v2';
let state = load();
function load(){
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.items)) return {budget:0, cats:DEFAULT_CATS, loc:false, home:null, places:[], ...s};
  } catch {}
  let items = [];
  try { items = JSON.parse(localStorage.getItem('ausgaben.v1')) || []; } catch {}
  return {items, cats: structuredClone(DEFAULT_CATS), budget: 0, loc: false, home: null, places: []};
}
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
// Ganze Euro: bestehende Beträge einmalig kaufmännisch runden
function roundAll(st){
  st.items.forEach(i => i.amount = Math.round(i.amount));
  st.budget = Math.round(st.budget || 0);
  (st.places || []).forEach(p => { if (p.amount) p.amount = Math.round(p.amount); (p.amounts || []).forEach(x => x.a = Math.round(x.a)); });
  return st;
}
if (!state.wholeEuros){ roundAll(state); state.wholeEuros = true; save(); }
// Emoji-Kategorien auf Carbon-Icons umstellen (auch für importierte Backups)
function migrateIcons(st){
  st.cats.forEach(c => { const k = EMOJI_TO_ICON[String(c.ico || '').replace(/\uFE0F/g, '')]; if (k) c.ico = k; });
  return st;
}
migrateIcons(state);
/* Wahrnehmungsabstand (OKLab) zweier Farben – für den „unterscheidbarsten“ freien Platz */
function oklab(hex){
  const [r, g, b] = [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b), m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b), sc = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
  return [.2104542553*l + .7936177850*m - .0040720468*sc, 1.9779984951*l - 2.4285922050*m + .4505937099*sc, .0259040371*l + .7827717662*m - .8086757660*sc];
}
const colorDist = (a, b) => { const x = oklab(PALETTE.light[a]), y = oklab(PALETTE.light[b]); return Math.hypot(x[0]-y[0], x[1]-y[1], x[2]-y[2]); };
/* Freier Farbplatz, der sich von allen vergebenen am stärksten unterscheidet (Grau/Platz 8 nur zuletzt) */
function freeSlot(taken){
  const used = [...taken];
  const free = [...Array(25).keys()].filter(i => !taken.has(i) && i !== 8);
  if (!free.length) return taken.has(8) ? 0 : 8;
  if (!used.length) return free[0];
  return free.map(i => [i, Math.min(...used.map(u => colorDist(i, u)))]).sort((a, b) => b[1] - a[1])[0][0];
}
/* Jede Kategorie bekommt eine eigene Farbe: erste behält sie, spätere Doppelte bekommen einen neuen Platz */
function migrateColors(st){
  const seen = new Set(), dup = [];
  st.cats.forEach(c => { if (!Number.isInteger(c.c) || c.c < 0 || c.c > 24 || seen.has(c.c)) dup.push(c); else seen.add(c.c); });
  dup.forEach(c => { c.c = freeSlot(seen); seen.add(c.c); });
  return dup.length > 0;
}
migrateColors(state); save();
// Einmalig: Kategorie "Tanzen" anlegen und Bargeld dorthin
if (!state.migDance){
  let t = state.cats.find(c => /^tanzen$/i.test(c.name));
  if (!t){
    const used = new Set(state.cats.map(c => c.c));
    const slot = [4, 6, 2, 0, 1, 3, 5, 7].find(i => !used.has(i)) ?? 4;
    t = {id: 'dance', name: 'Tanzen', ico: 'music', c: slot};
    state.cats.push(t);
  }
  state.items.forEach(i => { if (/^bargeld$/i.test((i.note || '').trim())) i.cat = t.id; });
  state.migDance = true; save();
}
// Einmalig: Tanz-Orte (Tangoloft, Tanzschule …) nach Tanzen
const DANCE = /tangoloft|tanz|tango|milonga|salsa|swing\s*dance|ballett/i;
if (!state.migDance2){
  const t = state.cats.find(c => /^tanzen$/i.test(c.name));
  if (t){
    state.items.forEach(i => { if (DANCE.test(i.note || '')) i.cat = t.id; });
    (state.places || []).forEach(p => { if (DANCE.test(p.name || '')) p.cat = t.id; });
  }
  state.migDance2 = true; save();
}

/* ---------- Helfer ---------- */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const eur = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const eur0 = eur;
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cat = id => state.cats.find(c => c.id === id) || UNKNOWN;
const sum = arr => arr.reduce((s,i) => s + i.amount, 0);
const ofMonth = key => state.items.filter(i => i.date.startsWith(key));
const parseNum = s => { const n = parseFloat(String(s).trim().replace(/[€\s]/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.')); return isFinite(n) ? Math.round(n) : NaN; };

/* Haptik: ein unsichtbarer iOS-Schalter wird per Klick umgeschaltet (iOS 18+). Wirkt nur nach einer Berührung. */
const hapticLabel = (() => {
  const l = document.createElement('label');
  l.setAttribute('aria-hidden', 'true');
  l.style.cssText = 'position:fixed;left:-200px;top:-200px;width:1px;height:1px;opacity:0;pointer-events:none';
  l.innerHTML = '<input type="checkbox" switch tabindex="-1">';
  document.body.appendChild(l);
  return l;
})();
const haptic = () => { try { hapticLabel.click(); } catch {} };

let view = new Date(); view.setDate(1);
let tab = 'home';

/* ---------- Tabs & Monat ---------- */
$$('.tab').forEach(b => b.onclick = () => { if (b.dataset.view !== tab) haptic(); showTab(b.dataset.view); });
function showTab(name){
  tab = name;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-'+name));
  scrollTo(0,0);
  render();
}
$$('[data-month]').forEach(b => b.onclick = () => { view.setMonth(view.getMonth() + +b.dataset.month); render(); });

function render(){
  const title = view.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
  $$('.monthTitle').forEach(h => h.textContent = title);
  if (tab === 'home') renderHome();
  if (tab === 'stats') renderStats();
  if (tab === 'settings') renderSettings();
  syncCompactBar();
}
/* Kompakte Titelleiste: erscheint, sobald der große Titel nach oben wegscrollt */
function syncCompactBar(){
  const t = document.querySelector('.view.active .largeTitle');
  $('compactTitle').textContent = t ? t.textContent : '';
  $('compactBar').classList.toggle('show', scrollY > 48);
}
let holoRaf = 0;
addEventListener('scroll', () => {
  $('compactBar').classList.toggle('show', scrollY > 48);
  if (!holoRaf) holoRaf = requestAnimationFrame(() => { holoRaf = 0; $('hero').style.setProperty('--hs', (Math.sin(scrollY / 170) * 30).toFixed(1)); });
}, {passive: true});

/* ---------- Übersicht ---------- */
function renderHome(){
  const key = monthKey(view);
  const month = ofMonth(key);
  const total = sum(month);
  renderHero(key, total);
  const isCur = key === monthKey(new Date());
  const sv = savingsSummary(key);
  $('saveCard').innerHTML = saveCardHTML(sv, key);
  const ct = catTilesHTML(key, false), kt = kpiTilesHTML(key);
  $('catTiles').innerHTML = ct; $('catSec').hidden = !ct;
  $('kpiTiles').innerHTML = kt; $('kpiSec').hidden = !kt;

  const q = $('search').value.trim().toLowerCase();
  renderFavs(key, q);
  $('listWrap').hidden = !state.listOpen;
  $('listToggle').setAttribute('aria-expanded', state.listOpen ? 'true' : 'false');
  $('listCount').textContent = `(${q ? state.items.filter(i => matches(i, q)).length : month.length})`;
  let list = q ? state.items.filter(i => matches(i, q)) : month;
  list = list.slice().sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);

  if (!list.length){
    $('list').innerHTML = q
      ? `<p class="empty"><span class="big">${icon('search')}</span>Keine Treffer für „${esc(q)}“.</p>`
      : `<p class="empty"><span class="big">${icon('wallet')}</span>Noch keine Ausgaben in diesem Monat.<br>Tippe auf <b>+</b>, um eine hinzuzufügen.</p>`;
    return;
  }
  const days = new Map();
  list.forEach(i => { if (!days.has(i.date)) days.set(i.date, []); days.get(i.date).push(i); });
  const today = iso(new Date()), yest = iso(new Date(Date.now() - 864e5));
  $('list').innerHTML = [...days].map(([d,arr]) => {
    const label = d === today ? 'Heute' : d === yest ? 'Gestern'
      : new Date(d+'T12:00').toLocaleDateString('de-DE', {weekday:'short', day:'numeric', month:'short', ...(q ? {year:'numeric'} : {})});
    return `<div class="day"><span>${label}</span><span>${eur.format(sum(arr))}</span></div><div class="card group">` +
      arr.map(i => { const c = cat(i.cat); return `<div class="swipe" data-id="${i.id}">
        <button class="swipeDel" data-del="${i.id}">Löschen</button>
        <div class="row"><span class="ico" style="--c:${color(c.c)}">${icon(c.ico)}</span>
        <span class="meta"><b>${esc(i.note || c.name)}</b>${i.note ? `<small>${esc(c.name)}</small>` : ''}</span>
        <span class="amt">${eur.format(i.amount)}</span></div></div>`; }).join('') + '</div>';
  }).join('');
}
const matches = (i, q) => (i.note||'').toLowerCase().includes(q) || cat(i.cat).name.toLowerCase().includes(q)
  || eur.format(i.amount).includes(q) || String(i.amount).replace('.',',').includes(q);
function groupByCat(list){
  const m = {};
  list.forEach(i => m[i.cat] = (m[i.cat]||0) + i.amount);
  return Object.entries(m).sort((a,b) => b[1]-a[1]);
}
$('search').oninput = renderHome;
$('setBudgetHint').onclick = () => { showTab('settings'); setTimeout(() => $('budgetInput').focus(), 50); };

/* Wischen zum Löschen: kurz wischen = Taste zeigen, weit wischen (> 50 %) = sofort löschen */
let drag = null, openRow = null;
const delBtn = row => row.parentElement.querySelector('.swipeDel');
const setX = (row, x) => {
  row.style.transform = x ? `translateX(${x}px)` : '';
  const del = delBtn(row);
  del.style.width = Math.max(88, -x) + 'px';
  del.style.opacity = x ? '1' : '0';   // Löschen nur sichtbar, wenn die Zeile verschoben ist
};
const closeOpen = () => { if (openRow){ setX(openRow, 0); openRow = null; } };
$('list').addEventListener('pointerdown', e => {
  const row = e.target.closest('.row'); if (!row) return;
  if (openRow && openRow !== row) closeOpen();
  drag = {row, id: e.pointerId, x:e.clientX, y:e.clientY, dx:0, base: row === openRow ? -88 : 0, moved:false, locked:null, full:false};
});
$('list').addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (drag.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)){
    drag.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (drag.locked === 'x') try { drag.row.setPointerCapture(e.pointerId); } catch {}
  }
  if (drag.locked !== 'x') return;
  drag.moved = true; drag.dx = dx;
  const sw = drag.row.parentElement, w = sw.offsetWidth;
  sw.classList.add('dragging');
  const x = Math.min(0, drag.base + dx);
  setX(drag.row, x);
  const full = -x > w * 0.5;
  if (full !== drag.full){ drag.full = full; sw.classList.toggle('full', full); }
});
const endDrag = () => {
  if (!drag) return;
  const {row, moved, base, dx, full} = drag; drag = null;
  const sw = row.parentElement;
  sw.classList.remove('dragging');
  if (!moved){
    if (openRow === row){ closeOpen(); return; }
    openExpense(state.items.find(i => i.id == sw.dataset.id));
    return;
  }
  if (full){                                   // ganz rausschieben, Zeile zuklappen, löschen
    const w = sw.offsetWidth;
    setX(row, -w);
    sw.style.height = sw.offsetHeight + 'px';
    requestAnimationFrame(() => { sw.classList.add('collapse'); sw.style.height = '0px'; });
    openRow = null;
    setTimeout(() => removeItem(+sw.dataset.id), 280);
    return;
  }
  sw.classList.remove('full');
  if (base + dx < -44){ setX(row, -88); openRow = row; }
  else { setX(row, 0); if (openRow === row) openRow = null; }
};
$('list').addEventListener('pointerup', endDrag);
$('list').addEventListener('pointercancel', () => {
  if (!drag) return;
  const {row, base} = drag; drag = null;
  row.parentElement.classList.remove('dragging', 'full');
  setX(row, base);
});
$('list').addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (d) removeItem(+d.dataset.del); });
document.addEventListener('pointerdown', e => { if (openRow && !e.target.closest('.swipe')) closeOpen(); });

function removeItem(id){
  const idx = state.items.findIndex(i => i.id === id); if (idx < 0) return;
  const [item] = state.items.splice(idx, 1);
  openRow = null; save(); render(); haptic();
  toast('Ausgabe gelöscht', 'Rückgängig', () => { state.items.push(item); save(); render(); });
}

/* ---------- Ausgabe-Sheet mit Ziffernblock ---------- */
let editing = null, amountStr = '', selCat = DEFAULT_CATS[0].id;

function openSheet(id){ $(id).classList.add('open'); }
function closeSheet(id){ $(id).classList.remove('open'); document.activeElement?.blur(); }
$$('[data-close]').forEach(el => el.onclick = () => closeSheet(el.closest('.sheetWrap').id));
$$('.sheet').forEach(sh => {
  const head = sh.querySelector('.sheetHead');
  let d = null;
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    d = {y: e.clientY, t: Date.now(), dy: 0};
    try { head.setPointerCapture(e.pointerId); } catch {}
    sh.style.transition = 'none';
  });
  head.addEventListener('pointermove', e => {
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y);
    sh.style.transform = `translateY(${d.dy}px)`;
  });
  const end = () => {
    if (!d) return;
    const {dy, t} = d; d = null;
    sh.style.transition = ''; sh.style.transform = '';
    if (dy > 110 || (dy > 40 && Date.now() - t < 250)) closeSheet(sh.closest('.sheetWrap').id);
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
});

$('add').onclick = () => { haptic(); openExpense(); };
function openExpense(item){
  editing = item || null;
  sheetSession++; here = null; catTouched = false; knownPlace = null;
  noteSource = item && item.note ? 'user' : '';
  $('expTitle').textContent = item ? 'Bearbeiten' : 'Neue Ausgabe';
  amountStr = item ? String(Math.round(item.amount)) : '';
  $('note').value = item ? item.note : '';
  const d = new Date(); const inView = monthKey(view) === monthKey(d);
  $('date').value = item ? item.date : inView ? iso(d) : iso(new Date(view.getFullYear(), view.getMonth()+1, 0));
  if (item) selCat = item.cat;
  else if (!state.cats.some(c => c.id === selCat)) selCat = state.cats[0]?.id;
  $('expDelete').hidden = !item;
  renderAmount(); renderChips(); renderSuggest();
  setLocBadge('');
  openSheet('expenseSheet');
  if (!item && state.loc) fillLocation();
}
function renderAmount(){
  $('amountDisplay').innerHTML = amountStr
    ? `${Number(amountStr).toLocaleString('de-DE')} €`
    : '<span class="ph">0 €</span>';
}
function renderChips(){
  $('chips').innerHTML = state.cats.map(c =>
    `<button data-id="${c.id}" class="${c.id===selCat?'on':''}" style="--c:${color(c.c)}">${icon(c.ico)}${esc(c.name)}</button>`).join('');
  $('chips').querySelector('.on')?.scrollIntoView({inline:'center', block:'nearest'});
}
$('chips').onclick = e => { const b = e.target.closest('button'); if (b){ selCat = b.dataset.id; catTouched = true; renderChips(); renderSuggest(); } };
$('keypad').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k || b.textContent;
  if (k === 'del') amountStr = amountStr.slice(0,-1);
  else if (k === 'clr') amountStr = '';
  else {
    if (Number(amountStr + k) > 1000){
      const el = $('amountDisplay'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      toast('Ausgaben gehen nur bis 1000 €'); return;
    }
    amountStr = (amountStr === '0' ? '' : amountStr) + k;
    if (amountStr === '0') amountStr = '';
  }
  renderAmount(); renderSuggest();
  const el = $('amountDisplay'); el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 100);
};
/* Kategorie für alle Ausgaben mit gleichem Namen übernehmen (inkl. gemerkter Orte) */
const sameName = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
function applyCatToName(name, cat, except){
  const changed = state.items.filter(i => i !== except && sameName(i.note, name) && i.cat !== cat).map(i => [i, i.cat]);
  changed.forEach(([i]) => i.cat = cat);
  (state.places || []).forEach(p => { if (sameName(p.name, name)) p.cat = cat; });
  return changed;
}
function toastCatChange(name, catId, changed){
  if (!changed.length) return false;
  toast(`Kategorie „${cat(catId).name}“ für ${changed.length + 1}× „${name}“`, 'Rückgängig', () => {
    changed.forEach(([i, old]) => i.cat = old); save(); render();
  });
  return true;
}
$('expSave').onclick = () => {
  const amount = parseNum(amountStr);
  if (!(amount > 0)){ const el = $('amountDisplay'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
  const data = {amount, cat:selCat, note:$('note').value.trim(), date:$('date').value || iso(new Date())};
  const key = data.date.slice(0,7);
  const before = sum(ofMonth(key));
  const oldCat = editing ? editing.cat : null;
  if (editing) Object.assign(editing, data);
  else { state.items.push({id: Date.now(), ...data}); if (here) rememberPlace(here, data); }
  save(); haptic();
  closeSheet('expenseSheet');
  const [y,m] = key.split('-').map(Number); view = new Date(y, m-1, 1);
  $('search').value = '';
  render();
  const after = sum(ofMonth(key)), b = state.budget;
  if (b && before <= b && after > b) toast(`Monatsbudget überschritten (${eur.format(after - b)} drüber)`);
  else if (b && before < .8*b && after >= .8*b) toast(`80 % des Budgets erreicht`);
  else if (editing && oldCat !== data.cat && data.note){
    const changed = applyCatToName(data.note, data.cat, editing);
    if (changed.length){ save(); render(); toastCatChange(data.note, data.cat, changed); }
  }
  else if (!editing) toast(`${eur.format(amount)} gespeichert`);
};
$('expDelete').onclick = () => { if (editing){ const id = editing.id; closeSheet('expenseSheet'); removeItem(id); } };

/* ---------- Prognose, „Heute noch“, Favoriten ---------- */
const daysIn = (y, m) => new Date(y, m, 0).getDate();

/* Prognose Monatsende: bisherige Ausgaben + Resttage × Tagesschnitt.
   Anfang des Monats zählt der Schnitt der letzten Monate stärker, später dein aktuelles Tempo. */
function forecast(key, now = new Date()){
  const [y, m] = key.split('-').map(Number);
  const dim = daysIn(y, m), isCurrent = key === monthKey(now);
  const spent = sum(ofMonth(key));
  const hist = [];
  for (let k = 1; k <= 3; k++){ const t = sum(ofMonth(monthKey(new Date(y, m - 1 - k, 1)))); if (t > 0) hist.push(t); }
  const histAvg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
  let projected = null;
  const elapsed = isCurrent ? now.getDate() : dim;
  if (isCurrent && (elapsed >= 3 || histAvg)){
    const curRate = spent / elapsed;
    const w = Math.min(1, elapsed / 10);
    const rate = histAvg ? w * curRate + (1 - w) * histAvg / dim : curRate;
    projected = Math.round(Math.max(spent, spent + (dim - elapsed) * rate));
  }
  return {dim, elapsed, spent, projected, histAvg: histAvg ? Math.round(histAvg) : null, isCurrent};
}

/* Was darf ich heute noch ausgeben? Rest von Budget (sonst Ø der letzten Monate) ÷ verbleibende Tage */
function todayLeft(now = new Date()){
  const key = monthKey(now), f = forecast(key, now);
  const target = state.budget || f.histAvg;
  if (!target) return null;
  const todayStr = iso(now);
  const spentToday = sum(state.items.filter(i => i.date === todayStr));
  const before = sum(state.items.filter(i => i.date.startsWith(key) && i.date < todayStr));
  const daysLeft = f.dim - now.getDate() + 1;
  const allowance = (target - before) / daysLeft;
  return {left: Math.round(allowance - spentToday), allowance: Math.round(allowance), exhausted: target - before <= 0, byBudget: !!state.budget};
}

/* Hero: Karte im Kartenformat – „heute noch“, Monatsbalken, drei Kennzahlen (Monat · Restzeit · Prognose) */
function renderHero(key, total){
  const now = new Date(), isCur = key === monthKey(now);
  const f = forecast(key, now), t = isCur ? todayLeft(now) : null;
  const target = state.budget || f.histAvg || 0, byBudget = !!state.budget;
  const ms = monthDate(key), dim = daysIn(ms.getFullYear(), ms.getMonth() + 1);
  $('hcDate').textContent = isCur ? now.toLocaleDateString('de-DE', {weekday: 'short', day: 'numeric', month: 'long'}) : ms.toLocaleDateString('de-DE', {month: 'long', year: 'numeric'});
  $('hcDaily').textContent = t && !t.exhausted ? `${byBudget ? 'Tagesbudget' : 'Richtwert'} ${eur.format(t.allowance)}` : '';
  // Hauptzahl
  let main, label;
  if (t){
    if (t.exhausted){ main = byBudget ? '0 €' : eur.format(total); label = byBudget ? 'Budget aufgebraucht' : 'über dem Üblichen'; }
    else if (t.left < 0){ main = '−' + eur.format(-t.left); label = 'über Tagesbudget'; }
    else { main = eur.format(t.left); label = 'heute noch'; }
  } else { main = eur.format(total); label = 'ausgegeben'; }
  $('hcMain').textContent = main; $('hcLabel').textContent = label;
  // Monatsbalken: neutral, erst ab 80 % orange, über 100 % rot
  const pct = target ? total / target : 0, bar = $('hcBar');
  bar.parentElement.style.visibility = target ? 'visible' : 'hidden';
  bar.style.width = Math.min(100, pct * 100) + '%';
  bar.className = pct > 1 ? 'over' : pct >= .8 ? 'warn' : '';
  // Kennzahlen
  const set = (n, l, v, sub, cls = '') => { $(`c${n}l`).textContent = l; $(`c${n}v`).textContent = v; $(`c${n}s`).textContent = sub; $(`c${n}v`).className = cls; $(`c${n}s`).className = cls; };
  set(1, isCur ? 'Monat' : 'Gesamt', eur.format(total), target ? (byBudget ? `von ${eur.format(target)}` : `Ø ${eur.format(target)}`) : 'ausgegeben');
  if (isCur){
    const left = dim - now.getDate();
    set(2, 'Noch', left > 0 ? `${left} ${left === 1 ? 'Tag' : 'Tage'}` : 'Letzter Tag', `Ø ${eur.format(total / now.getDate())} pro Tag`);
    if (f.projected == null) set(3, 'Prognose', '–', 'zu früh');
    else if (!target) set(3, 'Prognose', eur.format(f.projected), 'Monatsende');
    else if (f.projected > target) set(3, 'Prognose', eur.format(f.projected), `▲ ${eur.format(f.projected - target)} drüber`, 'bad');
    else set(3, 'Prognose', eur.format(f.projected), '✓ im Budget', 'good');
  } else {
    set(2, 'Ø pro Tag', eur.format(total / dim), 'im Monat');
    if (!target) set(3, 'Budget', '–', 'nicht gesetzt');
    else if (total > target) set(3, 'Über Budget', eur.format(total - target), `Budget ${eur.format(target)}`, 'bad');
    else set(3, 'Unter Budget', eur.format(target - total), `Budget ${eur.format(target)}`, 'good');
  }
  $('setBudgetHint').hidden = !!state.budget;
  // Woche: eigene Karte unter der Karte (nur aktueller Monat)
  $('weekCard').hidden = !isCur;
  if (isCur){ $('weekTiles').innerHTML = weekTilesHTML(now); $('wcSum').textContent = `${eur.format(weekSpent(now))} ausgegeben`; }
}

/* Favoriten: häufigste Ausgaben (Name + Betrag), jüngere zählen mehr */
function computeFavorites(now = new Date()){
  const hidden = new Set(state.favHidden || []);
  const map = new Map();
  state.items.forEach(i => {
    const note = (i.note || '').trim(), amt = Math.round(i.amount);
    if (!(amt > 0)) return;
    const age = Math.max(0, (now - new Date(i.date + 'T12:00')) / 864e5);
    if (age > 180) return;
    const key = (note ? note.toLowerCase() : '#' + i.cat) + '|' + amt;
    let e = map.get(key);
    if (!e) map.set(key, e = {key, note, amt, cat: i.cat, score: 0, count: 0, last: i.date});
    e.score += Math.pow(0.5, age / 60); e.count++;
    if (i.date >= e.last){ e.last = i.date; e.cat = i.cat; e.note = note; }
  });
  return [...map.values()].filter(e => e.count >= 2 && !hidden.has(e.key)).sort((a, b) => b.score - a.score).slice(0, 6);
}
function renderFavs(key, q){
  const box = $('favs');
  const favs = state.favs !== false && !q && key === monthKey(new Date()) ? computeFavorites() : [];
  box.hidden = !favs.length;
  box.innerHTML = favs.length
    ? `<div class="favLabel"><span>Schnell erfassen</span><small>gedrückt halten = ausblenden</small></div><div class="favRow">` +
      favs.map(f => `<button class="favBtn" style="--c:${color(cat(f.cat).c)}" data-fav="${encodeURIComponent(f.key)}">${icon(cat(f.cat).ico)}${esc(f.note || cat(f.cat).name)} · <b>${eur.format(f.amt)}</b></button>`).join('') + '</div>'
    : '';
}
function quickAdd(key){
  const f = computeFavorites().find(x => x.key === key); if (!f) return;
  const today = iso(new Date()), mk = today.slice(0, 7), before = sum(ofMonth(mk));
  const item = {id: Date.now(), amount: f.amt, cat: f.cat, note: f.note, date: today};
  state.items.push(item); save(); render(); haptic();
  const after = before + f.amt, b = state.budget;
  let msg = `${f.note || cat(f.cat).name} ${eur.format(f.amt)} gespeichert`;
  if (b && before <= b && after > b) msg = 'Monatsbudget überschritten';
  else if (b && before < .8 * b && after >= .8 * b) msg = '80 % des Budgets erreicht';
  toast(msg, 'Rückgängig', () => { state.items = state.items.filter(i => i.id !== item.id); save(); render(); });
}
function hideFav(key){
  state.favHidden = [...(state.favHidden || []), key]; save(); render();
  toast('Favorit ausgeblendet', 'Rückgängig', () => { state.favHidden = state.favHidden.filter(k => k !== key); save(); render(); });
}
let favTimer = null, favLong = false;
$('favs').addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  favLong = false; clearTimeout(favTimer);
  favTimer = setTimeout(() => { favLong = true; hideFav(decodeURIComponent(b.dataset.fav)); }, 650);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('favs').addEventListener(ev, () => clearTimeout(favTimer)));
$('favs').addEventListener('click', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  if (favLong){ favLong = false; return; }
  quickAdd(decodeURIComponent(b.dataset.fav));
});
$('favs').addEventListener('contextmenu', e => e.preventDefault());

/* ---------- Statistik (Kacheln) ---------- */
let selDay = null;
function renderStats(){
  const key = monthKey(view), now = new Date();
  $('calendar').innerHTML = calendarHTML(key, now);
  const dflt = key === monthKey(now) ? iso(now) : null;
  if (!selDay || !selDay.startsWith(key)) selDay = dflt;
  $('dayDetail').innerHTML = selDay ? dayDetailHTML(selDay) : '<span>Tippe auf einen Tag, um die Ausgaben zu sehen.</span>';
  $$('.dayTile').forEach(t => t.classList.toggle('sel', t.dataset.day === selDay));
  const wd = weekdayTilesHTML(key, now);
  $('weekdayTiles').innerHTML = wd; $('wdSec').hidden = !wd;
  $('monthTiles').innerHTML = monthTilesHTML(key);
  const sc = catTilesHTML(key, true);
  $('statCatTiles').innerHTML = sc; $('statCatSec').hidden = !sc;
  const pl = placeTilesHTML(key);
  $('placeTiles').innerHTML = pl; $('placeSec').hidden = !pl;
}
$('view-stats').addEventListener('click', e => {
  const d = e.target.closest('.dayTile'); if (d && !d.disabled){ selDay = d.dataset.day; renderStats(); return; }
  const m = e.target.closest('[data-m]'); if (m){ const [y, mo] = m.dataset.m.split('-').map(Number); view = new Date(y, mo - 1, 1); haptic(); render(); return; }
  const c = e.target.closest('[data-cat]'); if (c){ showCategoryList(c.dataset.cat); }
});

/* Startseite: Kacheln antippen, Liste auf-/zuklappen, Tagesgeld */
function showCategoryList(id){
  showTab('home');
  $('search').value = cat(id).name; state.listOpen = true; save(); render();
  setTimeout(() => $('listToggle').scrollIntoView({behavior: 'smooth', block: 'start'}), 60);
}
$('listToggle').onclick = () => { state.listOpen = !state.listOpen; if (!state.listOpen) $('search').value = ''; save(); render(); };
$('view-home').addEventListener('click', e => {
  if (e.target.closest('[data-go=budget]')){ showTab('settings'); setTimeout(() => $('budgetInput').focus(), 80); return; }
  const c = e.target.closest('.catTile'); if (c){ showCategoryList(c.dataset.cat); return; }
  if (e.target.closest('#tgBtn')) openSavings();
});

/* Tagesgeld: Überweisung vermerken */
function openSavings(){
  const key = monthKey(new Date()), s = savingsSummary(key);
  const open = s ? toTransfer(s, key) : 0;
  $('saveAmount').value = open || '';
  $('saveInfo').textContent = s
    ? `Gespart in diesem Monat: ${sgn(s.month.saved)}${money(s.month.saved)} · bereits vermerkt: ${eur.format(transferredIn(key))}. Hier trägst du ein, wie viel du ins Tagesgeld überwiesen hast.`
    : 'Hier trägst du ein, wie viel du ins Tagesgeld überwiesen hast.';
  renderSaveList();
  openSheet('saveSheet');
}
function renderSaveList(){
  const list = transfers().slice().sort((a, b) => b.id - a.id).slice(0, 6);
  $('saveList').hidden = !list.length;
  $('saveList').innerHTML = list.map(t => `<div class="tgRow"><span>${parseD(t.date).toLocaleDateString('de-DE', {day: 'numeric', month: 'short'})}</span><b>${eur.format(t.amount)}</b><button data-t="${t.id}">Entfernen</button></div>`).join('');
}
$('saveList').onclick = e => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  state.savings = transfers().filter(t => t.id !== +b.dataset.t); save(); renderSaveList(); render();
};
$('saveGo').onclick = () => {
  const n = parseNum($('saveAmount').value);
  if (!(n > 0)){ $('saveAmount').focus(); return; }
  const t = {id: Date.now(), date: iso(new Date()), amount: n};
  state.savings = [...transfers(), t]; save(); haptic();
  closeSheet('saveSheet'); render();
  toast(`${eur.format(n)} ins Tagesgeld vermerkt`, 'Rückgängig', () => { state.savings = transfers().filter(x => x.id !== t.id); save(); render(); });
};

/* ---------- Einstellungen ---------- */
function renderSettings(){
  if (document.activeElement !== $('budgetInput'))
    $('budgetInput').value = state.budget ? state.budget.toLocaleString('de-DE') + ' €' : '';
  $('locToggle').checked = !!state.loc;
  $('favToggle').checked = state.favs !== false;
  $('favHiddenCount').textContent = (state.favHidden || []).length;
  $('favReset').disabled = !(state.favHidden || []).length;
  $('homeLabel').textContent = state.home ? 'Zuhause neu festlegen' : 'Aktuellen Standort als Zuhause festlegen';
  $('homeState').textContent = state.home ? '✓' : '›';
  $('homeClear').hidden = !state.home;
  $('placesCount').textContent = state.places.length;
  $('placesClear').disabled = !state.places.length;
  $('catList').innerHTML = state.cats.map(c => `<button class="cell action" data-cat="${c.id}">
      <span class="left"><span class="ico" style="--c:${color(c.c)}">${icon(c.ico)}</span>${esc(c.name)}</span><span class="chev">›</span></button>`).join('')
    + `<button class="cell action add" data-cat="">＋ Kategorie hinzufügen</button>`;
}
$('budgetInput').onfocus = e => { e.target.value = state.budget ? String(state.budget) : ''; };
$('budgetInput').onblur = e => {
  const n = parseNum(e.target.value);
  state.budget = n > 0 ? n : 0; save(); renderSettings();
  toast(state.budget ? `Budget: ${eur.format(state.budget)} pro Monat` : 'Budget entfernt');
};
$('budgetInput').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };

let editCat = null, catSlot = 0, catIco = 'tag';
$('catList').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) openCat(state.cats.find(c => c.id === b.dataset.cat)); };
function openCat(c){
  editCat = c || null;
  $('catTitle').textContent = c ? 'Kategorie bearbeiten' : 'Neue Kategorie';
  $('catName').value = c ? c.name : '';
  catIco = c ? c.ico : 'tag';
  catSlot = c ? c.c : freeSlot(new Set(state.cats.map(x => x.c)));
  $('catDelete').hidden = !c || state.cats.length <= 1;
  renderCatPreview();
  openSheet('catSheet');
}
function renderCatPreview(){
  $('catPrevIco').style.setProperty('--c', color(catSlot));
  $('catPrevIco').innerHTML = icon(catIco);
  $('iconGrid').innerHTML = ICON_PICKER.map(k => `<button data-k="${k}" class="${k===catIco?'on':''}" style="--c:${color(catSlot)}" aria-label="${k}">${icon(k)}</button>`).join('');
  const owner = i => state.cats.find(x => x !== editCat && x.c === i);
  $('swatches').innerHTML = SWATCH_ORDER.map(i => { const o = owner(i);
    return `<button data-s="${i}" class="${i===catSlot?'on':''}${o?' used':''}" style="--c:${color(i)}" ${o?`disabled title="${esc(o.name)}"`:''} aria-label="Farbe ${i+1}${o?' (vergeben an '+esc(o.name)+')':''}">${o?icon(o.ico):''}</button>`; }).join('');
}
$('iconGrid').onclick = e => { const b = e.target.closest('button'); if (b){ catIco = b.dataset.k; renderCatPreview(); } };
$('swatches').onclick = e => { const b = e.target.closest('button'); if (b){ catSlot = +b.dataset.s; renderCatPreview(); } };
$('catSave').onclick = () => {
  const name = $('catName').value.trim();
  if (!name){ $('catName').focus(); return; }
  if (state.cats.some(x => x !== editCat && x.c === catSlot)) catSlot = freeSlot(new Set(state.cats.filter(x => x !== editCat).map(x => x.c)));
  const data = {name, ico: catIco, c: catSlot};
  if (editCat) Object.assign(editCat, data);
  else state.cats.push({id: 'c' + Date.now().toString(36), ...data});
  save(); closeSheet('catSheet'); render();
};
$('catDelete').onclick = () => {
  if (!editCat) return;
  const used = state.items.filter(i => i.cat === editCat.id).length;
  const fallback = state.cats.find(c => c !== editCat);
  if (!confirm(used ? `${used} Ausgabe(n) werden nach „${fallback.name}“ verschoben. Fortfahren?` : `„${editCat.name}“ löschen?`)) return;
  state.items.forEach(i => { if (i.cat === editCat.id) i.cat = fallback.id; });
  state.cats = state.cats.filter(c => c !== editCat);
  save(); closeSheet('catSheet'); render();
};

/* Backup & Export */
async function shareFile(name, type, content){
  const file = new File([content], name, {type});
  if (navigator.canShare?.({files:[file]})){
    try { await navigator.share({files:[file]}); return; } catch (e){ if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$('backupExport').onclick = () => shareFile(`seco-backup-${iso(new Date())}.json`, 'application/json', JSON.stringify({app:'seco', version:2, ...state}, null, 1));
$('csvExport').onclick = () => {
  const q = s => `"${String(s).replace(/"/g,'""')}"`;
  const rows = [['Datum','Kategorie','Betrag','Notiz'], ...state.items.slice().sort((a,b) => a.date.localeCompare(b.date))
    .map(i => [i.date, cat(i.cat).name, Math.round(i.amount), i.note])];
  shareFile(`seco-${iso(new Date())}.csv`, 'text/csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\n'));
};
$('backupImport').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const items = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(items) || items.some(i => typeof i.amount !== 'number' || !/^\d{4}-\d\d-\d\d$/.test(i.date))) throw 0;
    if (!confirm(`Backup mit ${items.length} Ausgaben wiederherstellen? Aktuelle Daten werden ersetzt.`)) return;
    state = {items, cats: Array.isArray(d.cats) && d.cats.length ? d.cats : structuredClone(DEFAULT_CATS), budget: Math.round(+d.budget || 0), loc: !!d.loc, home: d.home || null, places: Array.isArray(d.places) ? d.places : [], savings: Array.isArray(d.savings) ? d.savings : [], favs: d.favs, favHidden: Array.isArray(d.favHidden) ? d.favHidden : []};
    roundAll(state); migrateIcons(state); migrateColors(state); state.wholeEuros = true; state.theme = d.theme || 'dark'; save(); applyTheme(); render(); toast('Backup wiederhergestellt');
  } catch { alert('Die Datei ist kein gültiges Backup.'); }
};
$('wipe').onclick = () => {
  if (!confirm('Wirklich alle Ausgaben, Kategorien und das Budget löschen?')) return;
  const old = state;
  state = {items: [], cats: structuredClone(DEFAULT_CATS), budget: 0, loc: false, home: null, places: [], savings: [], wholeEuros: true, theme: old.theme};
  save(); render();
  toast('Alle Daten gelöscht', 'Rückgängig', () => { state = old; save(); render(); });
};


/* ---------- Ort ---------- */
const HOME_RADIUS = 300; // Meter
const getPos = (opts = {}) => new Promise((res, rej) => {
  if (!navigator.geolocation) return rej(new Error('Standort wird nicht unterstützt'));
  navigator.geolocation.getCurrentPosition(res, rej, {enableHighAccuracy:true, timeout:10000, maximumAge:30000, ...opts});
});
function distance(a, b){ // Haversine, Meter
  const R = 6371e3, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
let placeCache = null; // {lat, lon, t, name}
async function placeName(lat, lon, accuracy){
  if (placeCache && Date.now() - placeCache.t < 10*60e3 && distance(placeCache, {lat, lon}) < 40) return placeCache.name;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=18&addressdetails=1&accept-language=de`;
  const r = await fetch(url, {headers: {'Accept': 'application/json'}});
  if (!r.ok) throw new Error('Ortssuche fehlgeschlagen');
  const d = await r.json(), a = d.address || {};
  const place = a.city || a.town || a.village || a.municipality || a.suburb || '';
  const poiCats = ['amenity','shop','tourism','leisure','craft','office','railway','aeroway','public_transport','healthcare'];
  const poi = accuracy <= 100 && d.name && poiCats.includes(d.category) ? d.name : '';
  const street = a.road || a.pedestrian || a.square || a.neighbourhood || a.suburb || '';
  const parts = [poi || street, place].filter((v, i, arr) => v && arr.indexOf(v) === i);
  const name = parts.join(', ');
  placeCache = {lat, lon, t: Date.now(), name};
  return name;
}
function setLocBadge(state){
  const b = $('locBadge');
  b.innerHTML = state === 'busy' ? icon('location') : '';
  b.classList.toggle('spin', state === 'busy');
  $('note').classList.toggle('loading', state === 'busy');
}
let locRun = 0;
async function fillLocation(){
  const run = ++locRun, session = sheetSession;
  const sheetOpen = () => session === sheetSession && $('expenseSheet').classList.contains('open') && !editing;
  const stillValid = () => run === locRun && sheetOpen() && (noteSource === '' || noteSource === 'location');
  setLocBadge('busy');
  $('note').placeholder = 'Ort wird gesucht …';
  try {
    const p = await getPos({maximumAge: 5000});
    const pos = {lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy};
    if (state.home && distance(pos, state.home) <= HOME_RADIUS) return; // zuhause: nichts eintragen
    if (!sheetOpen()) return;
    here = pos;
    const known = findPlace(pos);
    if (known){ // bekannter Ort: sofort übernehmen, ohne Internet
      if (stillValid()){ $('note').value = known.name; noteSource = 'location'; }
      if (!catTouched && state.cats.some(c => c.id === known.cat)){ selCat = known.cat; renderChips(); }
      knownPlace = known; renderSuggest();
      return;
    }
    const name = await placeName(pos.lat, pos.lon, pos.acc);
    if (name && stillValid()){ $('note').value = name; noteSource = 'location'; }
  } catch (e) {
    if (e && e.code === 1 && run === locRun) toast('Standortzugriff verweigert – in den iOS-Einstellungen erlauben');
  } finally {
    if (run === locRun){ setLocBadge(''); $('note').placeholder = 'Notiz'; }
  }
}

/* Bekannte Orte: Name, Kategorie und Betrag vom letzten Mal */
let sheetSession = 0, here = null, catTouched = false, knownPlace = null;
const PLACE_RADIUS = 80; // Meter
function findPlace(pos){
  const r = Math.max(PLACE_RADIUS, Math.min(pos.acc || 0, 150));
  let best = null, bestD = Infinity;
  for (const pl of state.places){ const d = distance(pos, pl); if (d < r && d < bestD){ best = pl; bestD = d; } }
  return best;
}
function rememberPlace(pos, data){
  if (!data.note) return;
  let pl = findPlace({...pos, acc: 0});
  if (!pl){ pl = {lat: pos.lat, lon: pos.lon, count: 0}; state.places.push(pl); }
  const amounts = (pl.amounts || (pl.amount ? [{a: pl.amount, t: pl.t || Date.now()}] : [])).concat({a: data.amount, t: Date.now()}).slice(-30);
  Object.assign(pl, {name: data.note, cat: data.cat, amount: data.amount, amounts, t: Date.now(), count: (pl.count || 0) + 1});
  if (state.places.length > 300) state.places.sort((a,b) => b.t - a.t).length = 300;
  save();
}
/* Betragsvorschläge: häufig + kürzlich (Halbwertszeit 45 Tage), erst Ort, dann Kategorie */
function rankAmounts(list, now = Date.now()){
  const score = new Map();
  for (const {a, t} of list){
    if (!(a > 0)) continue;
    const w = Math.pow(0.5, (now - t) / (45 * 864e5));
    if (w < 0.1) continue; // älter als ~5 Monate
    score.set(a, (score.get(a) || 0) + w);
  }
  return [...score].sort((x, y) => y[1] - x[1]).map(([a]) => a);
}
function suggestions(){
  const out = [];
  const add = arr => { for (const a of arr){ if (out.length >= 3) break; if (!out.includes(a)) out.push(a); } };
  if (knownPlace && knownPlace.cat === selCat) add(rankAmounts(knownPlace.amounts || [{a: knownPlace.amount, t: knownPlace.t}]));
  const catItems = state.items.filter(i => i.cat === selCat)
    .map(i => ({a: Math.round(i.amount), t: i.id > 1e12 ? i.id : new Date(i.date + 'T12:00').getTime()}));
  add(rankAmounts(catItems));
  return out;
}
function renderSuggest(){
  const box = $('suggest');
  const list = amountStr ? [] : suggestions();
  box.innerHTML = list.map((a, i) => `<button data-a="${a}" class="${i === 0 && knownPlace && knownPlace.cat === selCat ? 'top' : ''}">${eur.format(a)}</button>`).join('');
  box.hidden = !list.length;
}
$('suggest').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  amountStr = b.dataset.a; renderAmount(); renderSuggest();
};
/* Woher die Notiz kommt: '' leer, 'location' Standort, 'receipt' Bon/Screenshot, 'user' selbst getippt.
   Rangfolge beim Überschreiben: user > receipt > location */
let noteSource = '';
$('note').addEventListener('input', () => { noteSource = $('note').value.trim() ? 'user' : ''; locRun++; setLocBadge(''); $('note').placeholder = 'Notiz'; });

$('locToggle').onchange = async e => {
  state.loc = e.target.checked; save();
  if (state.loc){
    try { await getPos(); if (!state.home) toast('Tipp: Lege „Zuhause“ fest, damit dort kein Ort eingetragen wird'); }
    catch (err) { state.loc = false; save(); renderSettings(); toast(err.code === 1 ? 'Standortzugriff verweigert' : 'Standort nicht verfügbar'); }
  }
};
$('homeSet').onclick = async () => {
  $('homeLabel').textContent = 'Standort wird ermittelt …';
  try {
    const p = await getPos({maximumAge: 0});
    state.home = {lat: p.coords.latitude, lon: p.coords.longitude}; save();
    toast('Zuhause gespeichert');
  } catch (err) { toast(err.code === 1 ? 'Standortzugriff verweigert' : 'Standort nicht verfügbar'); }
  renderSettings();
};
$('favToggle').onchange = e => { state.favs = e.target.checked; save(); };
$('favReset').onclick = () => { state.favHidden = []; save(); renderSettings(); toast('Favoriten zurückgeholt'); };
$('placesClear').onclick = () => {
  if (!state.places.length || !confirm(`${state.places.length} bekannte Orte vergessen?`)) return;
  state.places = []; save(); renderSettings(); toast('Bekannte Orte gelöscht');
};
$('homeClear').onclick = () => { state.home = null; save(); renderSettings(); toast('Zuhause entfernt'); };

/* ---------- Toast ---------- */
let toastTimer;
function toast(text, actionLabel = '', action = null, ms = 0){
  $('toastText').textContent = text;
  $('toastAction').textContent = actionLabel;
  $('toastAction').onclick = () => { action?.(); $('toast').classList.remove('show'); };
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), ms || (actionLabel ? 5000 : 2500));
}

/* ---------- Start ---------- */
function applyTheme(){
  document.documentElement.dataset.theme = state.theme || 'dark';
  $('themeColor').content = isDark() ? '#000000' : '#f2f2f7';
  $$('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === (state.theme || 'dark')));
}
$('themeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.theme = b.dataset.t; save(); applyTheme(); render(); };
darkMQ.addEventListener('change', () => { applyTheme(); render(); });
applyTheme();
/* ---------- Version & Update ---------- */
const APP_VERSION = '1.42';
$('versionText').textContent = APP_VERSION;
let latestVersion = null;
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++){ if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return false; };
async function checkUpdate(manual){
  if (manual){ $('updateLabel').textContent = 'Suche …'; $('updateState').textContent = ''; }
  try {
    const r = await fetch('version.json?t=' + Date.now(), {cache: 'no-store'});
    latestVersion = (await r.json()).version;
  } catch { latestVersion = null; }
  const has = latestVersion && newer(latestVersion, APP_VERSION);
  $('updateLabel').textContent = has ? `Version ${latestVersion} installieren` : latestVersion ? 'Aktuell ✓' : 'Nach Update suchen';
  $('updateState').textContent = has ? '›' : '';
  $('updateCheck').classList.toggle('add', !!has);
  if (has){
    // Automatisch aktualisieren, wenn gerade nichts offen ist (und nicht schon eben für diese Version versucht)
    const sheetOpen = !!document.querySelector('.sheetWrap.open');
    let tried = null; try { tried = JSON.parse(localStorage.getItem('seco.updTry')); } catch {}
    const recentlyTried = tried && tried.v === latestVersion && Date.now() - tried.t < 120000;
    if (!manual && !sheetOpen && !recentlyTried) return applyUpdate(), has;
    toast(`Neue Version ${latestVersion} verfügbar`, 'Aktualisieren', applyUpdate, 15000);
  }
  else if (manual && !latestVersion) toast('Keine Verbindung – später nochmal versuchen');
  return has;
}
async function applyUpdate(){
  toast('Wird aktualisiert …');
  try { localStorage.setItem('seco.updTry', JSON.stringify({v: latestVersion, t: Date.now(), from: APP_VERSION})); } catch {}
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));     // alte Dateien weg, Daten bleiben
  } catch {}
  location.reload();
}
$('updateCheck').onclick = async () => {
  if (latestVersion && newer(latestVersion, APP_VERSION)) return applyUpdate();
  checkUpdate(true);
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
// Nach einem Update kurz bestätigen
try {
  const tried = JSON.parse(localStorage.getItem('seco.updTry'));
  if (tried && tried.from !== APP_VERSION && Date.now() - tried.t < 120000){
    toast(`Aktualisiert auf Version ${APP_VERSION}`);
    localStorage.removeItem('seco.updTry');
  }
} catch {}
checkUpdate(false);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(false); });
render();
