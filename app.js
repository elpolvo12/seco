'use strict';
const CATS = [
  {id:'food',  name:'Essen',      ico:'🛒', c:'#34c759'},
  {id:'out',   name:'Restaurant', ico:'🍽️', c:'#ff9500'},
  {id:'transport',name:'Verkehr', ico:'🚌', c:'#5ac8fa'},
  {id:'home',  name:'Wohnen',     ico:'🏠', c:'#af52de'},
  {id:'fun',   name:'Freizeit',   ico:'🎬', c:'#ff2d55'},
  {id:'shop',  name:'Shopping',   ico:'🛍️', c:'#007aff'},
  {id:'health',name:'Gesundheit', ico:'💊', c:'#ff3b30'},
  {id:'other', name:'Sonstiges',  ico:'📦', c:'#8e8e93'},
];
const cat = id => CATS.find(c => c.id === id) || CATS[CATS.length-1];
const $ = id => document.getElementById(id);
const eur = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const KEY = 'ausgaben.v1';

let items = [];
try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch { items = []; }
const save = () => localStorage.setItem(KEY, JSON.stringify(items));

const pad = n => String(n).padStart(2,'0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
let view = new Date(); view.setDate(1);
let editing = null, selCat = CATS[0].id;

function render(){
  $('month').textContent = view.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
  const prefix = `${view.getFullYear()}-${pad(view.getMonth()+1)}`;
  const list = items.filter(i => i.date.startsWith(prefix))
    .sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);
  const total = list.reduce((s,i) => s + i.amount, 0);
  $('total').textContent = eur.format(total);

  const sums = {};
  list.forEach(i => sums[i.cat] = (sums[i.cat]||0) + i.amount);
  const entries = Object.entries(sums).sort((a,b) => b[1]-a[1]);
  $('bar').innerHTML = entries.map(([k,v]) =>
    `<i style="width:${v/total*100}%;background:${cat(k).c}"></i>`).join('');
  $('legend').innerHTML = entries.map(([k,v]) =>
    `<span style="--c:${cat(k).c}">${cat(k).name} ${eur.format(v)}</span>`).join('');

  if (!list.length){ $('list').innerHTML = '<p class="empty">Keine Ausgaben in diesem Monat.<br>Tippe auf + zum Hinzufügen.</p>'; return; }
  const days = {};
  list.forEach(i => (days[i.date] ||= []).push(i));
  $('list').innerHTML = Object.entries(days).map(([d,arr]) => {
    const label = new Date(d+'T12:00').toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'});
    const sum = arr.reduce((s,i)=>s+i.amount,0);
    return `<div class="day"><span>${label}</span><span>${eur.format(sum)}</span></div><div class="group">` +
      arr.map(i => `<button class="item" data-id="${i.id}">
        <span class="ico" style="--c:${cat(i.cat).c}33">${cat(i.cat).ico}</span>
        <span class="meta"><b>${cat(i.cat).name}</b>${i.note?`<small>${esc(i.note)}</small>`:''}</span>
        <span class="amt">${eur.format(i.amount)}</span></button>`).join('') + '</div>';
  }).join('');
}
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function renderCats(){
  $('cats').innerHTML = CATS.map(c =>
    `<button type="button" data-id="${c.id}" style="--c:${c.c}" class="${c.id===selCat?'on':''}">${c.ico} ${c.name}</button>`).join('');
}

function openSheet(item){
  editing = item || null;
  $('sheetTitle').textContent = item ? 'Ausgabe bearbeiten' : 'Neue Ausgabe';
  $('amount').value = item ? String(item.amount).replace('.',',') : '';
  $('note').value = item ? item.note : '';
  $('date').value = item ? item.date : isoDate(new Date());
  selCat = item ? item.cat : selCat;
  $('del').hidden = !item;
  renderCats();
  $('sheet').showModal();
  if (!item) $('amount').focus();
}

const parseAmount = s => {
  const n = parseFloat(s.trim().replace(/\./g,'').replace(',','.'));
  return isFinite(n) ? Math.round(n*100)/100 : NaN;
};

$('fab').onclick = () => openSheet();
$('cancel').onclick = () => $('sheet').close();
$('cats').onclick = e => { const b = e.target.closest('button'); if (b){ selCat = b.dataset.id; renderCats(); } };
$('list').onclick = e => { const b = e.target.closest('.item'); if (b) openSheet(items.find(i => i.id == b.dataset.id)); };
$('del').onclick = () => {
  if (editing && confirm('Diese Ausgabe löschen?')){ items = items.filter(i => i !== editing); save(); $('sheet').close(); render(); }
};
$('form').onsubmit = e => {
  const amount = parseAmount($('amount').value);
  if (!(amount > 0)){ e.preventDefault(); $('amount').focus(); return; }
  const data = {amount, cat:selCat, note:$('note').value.trim(), date:$('date').value};
  if (editing) Object.assign(editing, data);
  else items.push({id:Date.now(), ...data});
  save();
  const d = new Date(data.date+'T12:00'); view = new Date(d.getFullYear(), d.getMonth(), 1);
  render();
};
$('prev').onclick = () => { view.setMonth(view.getMonth()-1); render(); };
$('next').onclick = () => { view.setMonth(view.getMonth()+1); render(); };

$('export').onclick = async () => {
  const q = s => `"${String(s).replace(/"/g,'""')}"`;
  const rows = [['Datum','Kategorie','Betrag','Notiz'], ...items.slice().sort((a,b)=>a.date.localeCompare(b.date))
    .map(i => [i.date, cat(i.cat).name, String(i.amount).replace('.',','), i.note])];
  const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\n');
  const file = new File([csv], 'ausgaben.csv', {type:'text/csv'});
  if (navigator.canShare?.({files:[file]})){ try { await navigator.share({files:[file]}); return; } catch(e){ if (e.name==='AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'ausgaben.csv'; a.click();
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
render();
