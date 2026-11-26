'use strict';
/* ============================================================
   Auswertung: Datenfunktionen + Kachel-HTML
   Nutzt Globals aus app.js (state, eur, icon, cat, color, esc, iso, pad,
   monthKey, ofMonth, sum, daysIn, forecast, groupByCat) – erst zur Laufzeit.
   ============================================================ */

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const parseD = s => new Date(s + 'T12:00');
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const monthDate = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1, 12); };
const prevMonthKey = key => { const d = monthDate(key); return monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
const sgn = n => n > 0 ? '+' : n < 0 ? '−' : '';
const money = n => eur.format(Math.abs(n));
const pctDelta = (cur, prev) => prev > 0 ? Math.round((cur - prev) / prev * 100) : null;
const deltaText = p => p === null ? '' : Math.abs(p) < 1 ? '≈ wie Vormonat' : `${p > 0 ? '▲ +' : '▼ '}${Math.abs(p)} %`;

function dayTotals(){
  const m = new Map();
  state.items.forEach(i => { const e = m.get(i.date) || {sum: 0, count: 0, items: []}; e.sum += i.amount; e.count++; e.items.push(i); m.set(i.date, e); });
  return m;
}
const firstDate = () => state.items.reduce((m, i) => i.date < m ? i.date : m, iso(new Date()));

/* ---------- Gespart: Tagesbudget minus Ausgaben ---------- */
function savingBase(){
  const target = state.budget || forecast(monthKey(new Date())).histAvg;
  return target ? {target, byBudget: !!state.budget} : null;
}
/* Tage vor der ersten erfassten Ausgabe zählen nicht (sonst wäre alles „gespart“) */
function savedRange(from, to, base, totals){
  const start = parseD(firstDate());
  let saved = 0, budget = 0, spent = 0, days = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)){
    if (d < start) continue;
    const dailyB = base.target / daysIn(d.getFullYear(), d.getMonth() + 1);
    const s = (totals.get(iso(d)) || {sum: 0}).sum;
    budget += dailyB; spent += s; saved += dailyB - s; days++;
  }
  return {saved: Math.round(saved), budget: Math.round(budget), spent: Math.round(spent), days};
}
function savingsSummary(key, now = new Date()){
  const base = savingBase(); if (!base) return null;
  const totals = dayTotals(), isCur = key === monthKey(now), ms = monthDate(key);
  const monthEnd = new Date(ms.getFullYear(), ms.getMonth() + 1, 0, 12);
  const out = {base, isCur, month: savedRange(ms, isCur ? now : monthEnd, base, totals)};
  if (isCur){
    const today = addDays(now, 0), monday = addDays(now, -((now.getDay() + 6) % 7));
    out.day = savedRange(today, today, base, totals);
    out.week = savedRange(monday, today, base, totals);
  }
  return out;
}
const transfers = () => state.savings || [];
const transferredIn = key => transfers().filter(t => t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0);
const transferredAll = () => transfers().reduce((s, t) => s + t.amount, 0);
const toTransfer = (s, key) => Math.max(0, s.month.saved - transferredIn(key));

/* Eine Karte: Gespart im Monat groß, Heute/Woche als Chips, Tagesgeld als Link */
function saveCardHTML(s, key){
  if (!s) return `<button class="saveCard wide" data-go="budget"><span class="ico" style="--c:var(--green)">${icon('piggy')}</span><div class="grow"><small>Gespart</small><b>–</b><span class="hint">Lege ein Budget fest, dann siehst du hier, was du sparst.</span></div></button>`;
  const m = s.month, open = s.isCur ? toTransfer(s, key) : 0, done = transferredIn(key);
  const chip = (label, r) => `<span class="${r.saved > 0 ? 'pos' : r.saved < 0 ? 'neg' : ''}">${label} ${sgn(r.saved)}${money(r.saved)}</span>`;
  const chips = (s.isCur ? chip('Heute', s.day) + chip('Woche', s.week) : '') + (done ? `<span>Überwiesen ${eur.format(done)}</span>` : '');
  return `<div class="saveCard">
    <div class="scTop"><span class="ico" style="--c:var(--green)">${icon('piggy')}</span>
      <div class="grow"><small>Gespart im Monat</small><b>${sgn(m.saved)}${money(m.saved)}</b></div>
      ${s.isCur ? `<button class="scBtn" id="tgBtn">Ins Tagesgeld ›</button>` : ''}</div>
    ${chips ? `<div class="scChips">${chips}</div>` : ''}
  </div>`;
}

/* Wochen-Kacheln (Mo–So): Betrag pro Tag; grün im Tagesbudget, rot darüber, heute mit Rahmen */
function weekTilesHTML(now = new Date()){
  const base = savingBase(), totals = dayTotals(), start = parseD(firstDate());
  const monday = addDays(now, -((now.getDay() + 6) % 7)), todayStr = iso(now);
  return Array.from({length: 7}, (_, i) => {
    const d = addDays(monday, i), ds = iso(d), e = totals.get(ds), amt = e ? e.sum : 0, future = ds > todayStr;
    const daily = base ? base.target / daysIn(d.getFullYear(), d.getMonth() + 1) : null;
    const cls = future ? 'fut' : (!base || d < start) ? '' : amt > daily ? 'hi' : amt > 0 ? 'ok' : '';
    return `<div class="${cls}${ds === todayStr ? ' today' : ''}"><small>${WD[i]}</small><b>${future ? '–' : Math.round(amt)}</b></div>`;
  }).join('');
}

/* ---------- Kategorien-Kacheln ---------- */
function catTilesHTML(key, withDelta){
  const month = ofMonth(key), total = sum(month);
  if (!month.length) return '';
  const prev = {}; ofMonth(prevMonthKey(key)).forEach(i => prev[i.cat] = (prev[i.cat] || 0) + i.amount);
  return groupByCat(month).map(([id, v]) => {
    const c = cat(id), pct = total ? Math.round(v / total * 100) : 0;
    const p = withDelta ? pctDelta(v, prev[id] || 0) : null;
    return `<button class="tile catTile" data-cat="${id}" style="--c:${color(c.c)}">
      <span class="ico sm">${icon(c.ico)}</span><span class="pct">${pct} %</span>
      <b>${eur.format(v)}</b><small>${esc(c.name)}</small>${withDelta && p !== null ? `<span class="dl">${deltaText(p)}</span>` : ''}</button>`;
  }).join('');
}

/* ---------- Kennzahlen-Kacheln ---------- */
function kpiTilesHTML(key, now = new Date()){
  const list = ofMonth(key), total = sum(list), isCur = key === monthKey(now);
  if (!list.length) return '';
  const ms = monthDate(key), dim = daysIn(ms.getFullYear(), ms.getMonth() + 1);
  const days = isCur ? now.getDate() : dim;
  const prevTotal = sum(ofMonth(prevMonthKey(key)));
  const top = list.reduce((a, b) => !a || b.amount > a.amount ? b : a, null);
  const totals = dayTotals();
  let best = null, free = 0;
  const start = parseD(firstDate());
  for (let d = 1; d <= days; d++){
    const dt = new Date(ms.getFullYear(), ms.getMonth(), d, 12), e = totals.get(iso(dt));
    if (e && (!best || e.sum > best.sum)) best = {sum: e.sum, d: dt};
    if (!e && dt >= start) free++;
  }
  const t = (label, value, sub = '') => `<div class="tile"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const p = pctDelta(total, prevTotal);
  return t('Ø pro Tag', eur.format(total / days), `über ${days} Tage`)
    + t('Ausgaben', list.length, `Ø ${eur.format(total / list.length)}`)
    + t('Größte', eur.format(top.amount), esc(top.note || cat(top.cat).name))
    + t('Teuerster Tag', best ? eur.format(best.sum) : '–', best ? best.d.toLocaleDateString('de-DE', {weekday: 'short', day: 'numeric', month: 'short'}) : '')
    + t('Ohne Ausgabe', `${free} ${free === 1 ? 'Tag' : 'Tage'}`, 'in diesem Monat')
    + t('Ggü. Vormonat', p === null ? '–' : `${p > 0 ? '▲ +' : p < 0 ? '▼ ' : ''}${Math.abs(p)} %`, prevTotal ? `Vormonat ${eur.format(prevTotal)}` : '');
}

/* ---------- Kalender-Kacheln (Heatmap) ---------- */
function calendarHTML(key, now = new Date()){
  const ms = monthDate(key), y = ms.getFullYear(), m = ms.getMonth(), dim = daysIn(y, m + 1);
  const totals = dayTotals(), todayStr = iso(now);
  const vals = [];
  for (let d = 1; d <= dim; d++){ const e = totals.get(`${y}-${pad(m + 1)}-${pad(d)}`); if (e) vals.push(e.sum); }
  vals.sort((a, b) => a - b);
  const level = v => { if (!v) return 0; const r = vals.filter(x => x <= v).length / vals.length; return r <= .25 ? 1 : r <= .5 ? 2 : r <= .75 ? 3 : 4; };
  const lead = (ms.getDay() + 6) % 7;
  let html = '<span></span>'.repeat(lead);
  for (let d = 1; d <= dim; d++){
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`, e = totals.get(ds), future = ds > todayStr;
    html += `<button class="dayTile l${level(e ? e.sum : 0)}${ds === todayStr ? ' today' : ''}${future ? ' future' : ''}" data-day="${ds}" ${future ? 'disabled' : ''}>
      <i>${d}</i><b>${e ? Math.round(e.sum) : ''}</b></button>`;
  }
  return html;
}
function dayDetailHTML(ds){
  const e = dayTotals().get(ds);
  const label = parseD(ds).toLocaleDateString('de-DE', {weekday: 'long', day: 'numeric', month: 'long'});
  if (!e) return `<b>${label}</b><span>Keine Ausgaben</span>`;
  return `<b>${label} · ${eur.format(e.sum)}</b><span>${e.items.map(i => `${esc(i.note || cat(i.cat).name)} ${eur.format(i.amount)}`).join(' · ')}</span>`;
}

/* ---------- Wochentage: Ø pro Tag, letzte 3 Monate ---------- */
function weekdayTilesHTML(key, now = new Date()){
  const ms = monthDate(key);
  const from = new Date(ms.getFullYear(), ms.getMonth() - 2, 1, 12);
  const end = new Date(ms.getFullYear(), ms.getMonth() + 1, 0, 12);
  const to = end < now ? end : addDays(now, 0);
  const start = parseD(firstDate()), totals = dayTotals();
  const sums = Array(7).fill(0), n = Array(7).fill(0);
  for (let d = new Date(from); d <= to; d = addDays(d, 1)){
    if (d < start) continue;
    const w = (d.getDay() + 6) % 7;
    sums[w] += (totals.get(iso(d)) || {sum: 0}).sum; n[w]++;
  }
  const avg = sums.map((s, i) => n[i] ? s / n[i] : 0), max = Math.max(...avg);
  if (!(max > 0)) return '';
  return avg.map((a, i) => `<div class="tile wd${a === max ? ' hi' : ''}"><small>${WD[i]}</small><b>${Math.round(a)}</b></div>`).join('');
}

/* ---------- Monate-Kacheln (letzte 6) ---------- */
function monthTilesHTML(key){
  const ms = monthDate(key), out = [];
  for (let k = 5; k >= 0; k--){
    const d = new Date(ms.getFullYear(), ms.getMonth() - k, 1), mk = monthKey(d);
    const total = sum(ofMonth(mk)), prev = sum(ofMonth(prevMonthKey(mk))), p = pctDelta(total, prev);
    const over = state.budget && total > state.budget;
    out.push(`<button class="tile monthTile${k === 0 ? ' sel' : ''}${over ? ' neg' : ''}" data-m="${mk}">
      <small>${d.toLocaleDateString('de-DE', {month: 'short', year: '2-digit'}).replace('.', '')}</small><b>${eur.format(total)}</b>
      <span>${p === null ? (total ? 'neu' : '–') : deltaText(p).replace(' wie Vormonat', '')}</span></button>`);
  }
  return out.join('');
}

/* ---------- Läden & Orte ---------- */
function placeTilesHTML(key){
  const map = new Map();
  ofMonth(key).forEach(i => {
    const name = (i.note || '').trim() || cat(i.cat).name, k = name.toLowerCase();
    const e = map.get(k) || {name, sum: 0, count: 0, cat: i.cat};
    e.sum += i.amount; e.count++; map.set(k, e);
  });
  return [...map.values()].sort((a, b) => b.sum - a.sum).slice(0, 6).map(e =>
    `<div class="tile placeTile" style="--c:${color(cat(e.cat).c)}"><small>${esc(e.name)}</small><b>${eur.format(e.sum)}</b><span>${e.count}× · Ø ${eur.format(e.sum / e.count)}</span></div>`).join('');
}
