'use strict';

/* ---------- Farben (validierte Kategorie-Palette, hell/dunkel) ---------- */
const PALETTE = {
  light: ['#257de0','#f47230','#00b894','#f2a600','#ee7fac','#008a17','#6a4ce2','#ec4647','#8e8e93'],
  dark:  ['#338ced','#e76624','#00a888','#d28e05','#e24d8b','#0aac23','#9887ef','#eb6263','#98989f'],
};
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (state.theme || 'dark') === 'dark' || (state.theme === 'system' && darkMQ.matches);
const color = slot => PALETTE[isDark() ? 'dark' : 'light'][slot] ?? PALETTE.light[8];

const DEFAULT_CATS = [
  {id:'food',     name:'Lebensmittel', ico:'🛒', c:5},
  {id:'out',      name:'Restaurant',   ico:'🍽️', c:1},
  {id:'transport',name:'Verkehr',      ico:'🚌', c:0},
  {id:'home',     name:'Wohnen',       ico:'🏠', c:6},
  {id:'fun',      name:'Freizeit',     ico:'🎬', c:4},
  {id:'shop',     name:'Shopping',     ico:'🛍️', c:2},
  {id:'health',   name:'Gesundheit',   ico:'💊', c:7},
  {id:'other',    name:'Sonstiges',    ico:'📦', c:3},
];
const UNKNOWN = {id:'?', name:'Ohne Kategorie', ico:'❔', c:8};

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

let view = new Date(); view.setDate(1);
let tab = 'home';

/* ---------- Tabs & Monat ---------- */
$$('.tab').forEach(b => b.onclick = () => showTab(b.dataset.view));
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
}

/* ---------- Übersicht ---------- */
function budgetStatus(total, budget, key){
  const now = new Date(), isCurrent = key === monthKey(now);
  const pct = total / budget;
  let text;
  if (pct > 1) text = `⚠️ <b>${eur.format(total - budget)}</b> über Budget von ${eur0.format(budget)}`;
  else {
    const rest = budget - total;
    if (isCurrent){
      const daysLeft = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() - now.getDate() + 1;
      text = `Noch <b>${eur.format(rest)}</b> · ${eur.format(rest/daysLeft)} pro Tag`;
    } else text = `<b>${eur.format(rest)}</b> von ${eur0.format(budget)} übrig`;
    if (pct >= .8) text = '⚠️ ' + text;
  }
  return {pct, text, cls: pct > 1 ? 'over' : pct >= .8 ? 'warn' : ''};
}

function renderHome(){
  const key = monthKey(view);
  const month = ofMonth(key);
  const total = sum(month);
  $('total').textContent = eur.format(total);

  const b = state.budget;
  $('budgetBox').hidden = !b;
  $('setBudgetHint').hidden = !!b;
  if (b){
    const s = budgetStatus(total, b, key);
    $('budgetFill').style.width = Math.min(100, s.pct*100) + '%';
    $('budgetFill').parentElement.className = 'progress ' + s.cls;
    $('budgetText').innerHTML = s.text;
  }

  const byCat = groupByCat(month);
  $('catCard').hidden = !byCat.length;
  $('bar').innerHTML = byCat.map(([id,v]) => `<i style="flex-grow:${v};background:${color(cat(id).c)}" title="${esc(cat(id).name)}"></i>`).join('');
  $('legend').innerHTML = byCat.map(([id,v]) => `<span style="--c:${color(cat(id).c)}">${esc(cat(id).name)} <b>${eur.format(v)}</b></span>`).join('');

  const q = $('search').value.trim().toLowerCase();
  let list = q ? state.items.filter(i => matches(i, q)) : month;
  list = list.slice().sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);

  if (!list.length){
    $('list').innerHTML = q
      ? `<p class="empty"><span class="big">🔍</span>Keine Treffer für „${esc(q)}“.</p>`
      : `<p class="empty"><span class="big">💸</span>Noch keine Ausgaben in diesem Monat.<br>Tippe auf <b>+</b>, um eine hinzuzufügen.</p>`;
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
        <div class="row"><span class="ico" style="--c:${color(c.c)}">${c.ico}</span>
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
  delBtn(row).style.width = Math.max(88, -x) + 'px';
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
  openRow = null; save(); render();
  toast('Ausgabe gelöscht', 'Rückgängig', () => { state.items.push(item); save(); render(); });
}

/* ---------- Ausgabe-Sheet mit Ziffernblock ---------- */
let editing = null, amountStr = '', selCat = DEFAULT_CATS[0].id;

function openSheet(id){ $(id).classList.add('open'); }
function closeSheet(id){ $(id).classList.remove('open'); document.activeElement?.blur(); }
$$('[data-close]').forEach(el => el.onclick = () => closeSheet(el.closest('.sheetWrap').id));

$('add').onclick = () => openExpense();
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
    `<button data-id="${c.id}" class="${c.id===selCat?'on':''}" style="--c:${color(c.c)}">${c.ico} ${esc(c.name)}</button>`).join('');
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
$('expSave').onclick = () => {
  const amount = parseNum(amountStr);
  if (!(amount > 0)){ const el = $('amountDisplay'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
  const data = {amount, cat:selCat, note:$('note').value.trim(), date:$('date').value || iso(new Date())};
  const key = data.date.slice(0,7);
  const before = sum(ofMonth(key));
  if (editing) Object.assign(editing, data);
  else { state.items.push({id: Date.now(), ...data}); if (here) rememberPlace(here, data); }
  save();
  closeSheet('expenseSheet');
  const [y,m] = key.split('-').map(Number); view = new Date(y, m-1, 1);
  $('search').value = '';
  render();
  const after = sum(ofMonth(key)), b = state.budget;
  if (b && before <= b && after > b) toast(`⚠️ Monatsbudget überschritten (${eur.format(after - b)} drüber)`);
  else if (b && before < .8*b && after >= .8*b) toast(`⚠️ 80 % des Budgets erreicht`);
  else if (!editing) toast(`${eur.format(amount)} gespeichert`);
};
$('expDelete').onclick = () => { if (editing){ const id = editing.id; closeSheet('expenseSheet'); removeItem(id); } };

/* ---------- Statistik ---------- */
function renderStats(){
  renderMonthChart();
  renderDonut();
  renderKpis();
}
function renderMonthChart(){
  const svg = $('monthChart');
  const W = svg.clientWidth || 340, H = 210, padL = 8, padR = 8, padT = 30, padB = 22;
  const months = [];
  for (let k = 5; k >= 0; k--){ const d = new Date(view.getFullYear(), view.getMonth()-k, 1); months.push({d, key:monthKey(d), v:sum(ofMonth(monthKey(d)))}); }
  const max = Math.max(state.budget || 0, ...months.map(m => m.v), 1) * 1.08;
  const plotH = H - padT - padB, slot = (W - padL - padR) / months.length, bw = Math.min(34, slot * .55);
  const y = v => padT + plotH - v / max * plotH;
  let out = `<line class="grid" x1="${padL}" x2="${W-padR}" y1="${y(0)}" y2="${y(0)}"/>`;
  months.forEach((m, i) => {
    const x = padL + slot*i + (slot-bw)/2, h = Math.max(0, y(0) - y(m.v));
    const r = Math.min(4, h/2, bw/2);
    // oben abgerundet, Basis gerade
    if (h > 0) out += `<path class="bar ${i===5?'sel':''}" data-i="${i}" d="M${x},${y(0)} v${-(h-r)} q0,${-r} ${r},${-r} h${bw-2*r} q${r},0 ${r},${r} v${h-r} z"/>`;
    out += `<text x="${x+bw/2}" y="${H-5}" text-anchor="middle">${m.d.toLocaleDateString('de-DE',{month:'short'}).replace('.','')}</text>`;
    out += `<rect class="hit" data-i="${i}" x="${padL+slot*i}" y="0" width="${slot}" height="${H}"/>`;
  });
  if (state.budget){
    out += `<line class="budgetLine" x1="${padL}" x2="${W-padR}" y1="${y(state.budget)}" y2="${y(state.budget)}"/>`;
    out += `<text x="${W-padR}" y="${y(state.budget)-5}" text-anchor="end">Budget ${eur0.format(state.budget)}</text>`;
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = out;
  const tip = $('barTip');
  const showTip = i => {
    const m = months[i], x = padL + slot*i + slot/2;
    tip.textContent = `${m.d.toLocaleDateString('de-DE',{month:'long'})}: ${eur.format(m.v)}`;
    tip.style.left = Math.max(70, Math.min(W - 60, x + 10)) + 'px';
    tip.classList.add('show');
    svg.querySelectorAll('.bar').forEach(b => b.classList.toggle('sel', +b.dataset.i === i));
  };
  tip.classList.remove('show');
  svg.onpointerover = svg.onpointerdown = e => { const h = e.target.closest('.hit'); if (h) showTip(+h.dataset.i); };
  svg.onpointerleave = () => { tip.classList.remove('show'); svg.querySelectorAll('.bar').forEach(b => b.classList.toggle('sel', b.dataset.i === '5')); };
}
function renderDonut(){
  const list = ofMonth(monthKey(view)), total = sum(list), groups = groupByCat(list);
  $('donutTotal').textContent = eur.format(total);
  const R = 48, C = 2 * Math.PI * R, gap = groups.length > 1 ? 2 : 0;
  let off = 0, out = `<circle cx="60" cy="60" r="${R}" stroke="var(--fill)" stroke-width="16"/>`;
  groups.forEach(([id, v]) => {
    const len = v / total * C;
    out += `<circle cx="60" cy="60" r="${R}" stroke="${color(cat(id).c)}" stroke-width="16" stroke-dasharray="${Math.max(0.5, len-gap)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len;
  });
  $('donut').innerHTML = out;
  $('catTable').innerHTML = groups.length
    ? groups.map(([id,v]) => `<div class="trow" style="--c:${color(cat(id).c)}"><span class="dot"></span><span class="nm">${cat(id).ico} ${esc(cat(id).name)}</span><span class="pc">${Math.round(v/total*100)} %</span><span class="vl">${eur.format(v)}</span></div>`).join('')
    : '<p class="empty" style="padding:10px">Keine Ausgaben in diesem Monat.</p>';
}
function renderKpis(){
  const key = monthKey(view), list = ofMonth(key), total = sum(list), now = new Date();
  const days = key === monthKey(now) ? now.getDate() : new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
  const prev = sum(ofMonth(monthKey(new Date(view.getFullYear(), view.getMonth()-1, 1))));
  const top = list.reduce((a,b) => !a || b.amount > a.amount ? b : a, null);
  const diff = prev ? (total - prev) / prev * 100 : null;
  const kpi = (l, v, s='') => `<div class="kpi"><small>${l}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  $('kpis').innerHTML =
    kpi('Ø pro Tag', eur.format(total/days), `über ${days} Tage`) +
    kpi('Anzahl', list.length, list.length ? `Ø ${eur.format(total/list.length)}` : '') +
    kpi('Größte Ausgabe', top ? eur.format(top.amount) : '–', top ? esc(top.note || cat(top.cat).name) : '') +
    kpi('Ggü. Vormonat', diff === null ? '–' : `${diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : ''}${Math.round(diff)} %`, prev ? `Vormonat ${eur.format(prev)}` : '');
}

/* ---------- Einstellungen ---------- */
function renderSettings(){
  if (document.activeElement !== $('budgetInput'))
    $('budgetInput').value = state.budget ? state.budget.toLocaleString('de-DE') + ' €' : '';
  $('locToggle').checked = !!state.loc;
  $('homeLabel').textContent = state.home ? 'Zuhause neu festlegen' : 'Aktuellen Standort als Zuhause festlegen';
  $('homeState').textContent = state.home ? '✓' : '›';
  $('homeClear').hidden = !state.home;
  $('placesCount').textContent = state.places.length;
  $('placesClear').disabled = !state.places.length;
  $('catList').innerHTML = state.cats.map(c => `<button class="cell action" data-cat="${c.id}">
      <span class="left"><span class="ico" style="--c:${color(c.c)}">${c.ico}</span>${esc(c.name)}</span><span class="chev">›</span></button>`).join('')
    + `<button class="cell action add" data-cat="">＋ Kategorie hinzufügen</button>`;
}
$('budgetInput').onfocus = e => { e.target.value = state.budget ? String(state.budget) : ''; };
$('budgetInput').onblur = e => {
  const n = parseNum(e.target.value);
  state.budget = n > 0 ? n : 0; save(); renderSettings();
  toast(state.budget ? `Budget: ${eur.format(state.budget)} pro Monat` : 'Budget entfernt');
};
$('budgetInput').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };

let editCat = null, catSlot = 0;
$('catList').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) openCat(state.cats.find(c => c.id === b.dataset.cat)); };
function openCat(c){
  editCat = c || null;
  $('catTitle').textContent = c ? 'Kategorie bearbeiten' : 'Neue Kategorie';
  $('catName').value = c ? c.name : '';
  $('catEmoji').value = c ? c.ico : '';
  catSlot = c ? c.c : state.cats.length % 8;
  $('catDelete').hidden = !c || state.cats.length <= 1;
  renderCatPreview();
  openSheet('catSheet');
}
function renderCatPreview(){
  $('catPrevIco').style.setProperty('--c', color(catSlot));
  $('catPrevIco').textContent = $('catEmoji').value.trim() || '🏷️';
  $('swatches').innerHTML = PALETTE.light.map((_, i) => `<button data-s="${i}" class="${i===catSlot?'on':''}" style="--c:${color(i)}" aria-label="Farbe ${i+1}"></button>`).join('');
}
$('catEmoji').oninput = renderCatPreview;
$('swatches').onclick = e => { const b = e.target.closest('button'); if (b){ catSlot = +b.dataset.s; renderCatPreview(); } };
$('catSave').onclick = () => {
  const name = $('catName').value.trim();
  if (!name){ $('catName').focus(); return; }
  const data = {name, ico: $('catEmoji').value.trim() || '🏷️', c: catSlot};
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
    state = {items, cats: Array.isArray(d.cats) && d.cats.length ? d.cats : structuredClone(DEFAULT_CATS), budget: Math.round(+d.budget || 0), loc: !!d.loc, home: d.home || null, places: Array.isArray(d.places) ? d.places : []};
    roundAll(state); state.wholeEuros = true; state.theme = d.theme || 'dark'; save(); applyTheme(); render(); toast('Backup wiederhergestellt');
  } catch { alert('Die Datei ist kein gültiges Backup.'); }
};
$('wipe').onclick = () => {
  if (!confirm('Wirklich alle Ausgaben, Kategorien und das Budget löschen?')) return;
  const old = state;
  state = {items: [], cats: structuredClone(DEFAULT_CATS), budget: 0, loc: false, home: null, places: [], wholeEuros: true, theme: old.theme};
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
  b.textContent = state === 'busy' ? '📍' : '';
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
$('placesClear').onclick = () => {
  if (!state.places.length || !confirm(`${state.places.length} bekannte Orte vergessen?`)) return;
  state.places = []; save(); renderSettings(); toast('Bekannte Orte gelöscht');
};
$('homeClear').onclick = () => { state.home = null; save(); renderSettings(); toast('Zuhause entfernt'); };

/* ---------- Toast ---------- */
let toastTimer;
function toast(text, actionLabel = '', action = null){
  $('toastText').textContent = text;
  $('toastAction').textContent = actionLabel;
  $('toastAction').onclick = () => { action?.(); $('toast').classList.remove('show'); };
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), actionLabel ? 5000 : 2500);
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
addEventListener('resize', () => { if (tab === 'stats') renderMonthChart(); });
/* ---------- Version & Update ---------- */
const APP_VERSION = '1.17';
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
  if (has) toast(`Neue Version ${latestVersion} verfügbar`, 'Aktualisieren', applyUpdate);
  else if (manual && !latestVersion) toast('Keine Verbindung – später nochmal versuchen');
  return has;
}
async function applyUpdate(){
  toast('Wird aktualisiert …');
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
checkUpdate(false);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(false); });
render();
