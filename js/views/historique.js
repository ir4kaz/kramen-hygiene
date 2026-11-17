// Historique des relevés + export PDF (via l'impression du navigateur).
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, today, fmtTemp, rangeLabel, TYPES, TYPE_ORDER,
} from '../util.js';

const p2 = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const shortTemp = (v) => String(v).replace('.', ',').replace('-', '−');
const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()}`;
const fmtFull = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

function period(mode, ref) {
  const d = fromKey(ref);
  if (mode === 'jour') return { start: d, end: d, label: fmtFull(d) };
  if (mode === 'semaine') {
    const start = addDays(d, -((d.getDay() + 6) % 7)); // lundi
    const end = addDays(start, 6);
    return { start, end, label: `Semaine du ${fmtFull(start)} au ${fmtFull(end)}` };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const m = MONTHS[d.getMonth()];
  return { start, end, label: `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}` };
}

function shift(mode, ref, dir) {
  const d = fromKey(ref);
  if (mode === 'jour') return toKey(addDays(d, dir));
  if (mode === 'semaine') return toKey(addDays(d, 7 * dir));
  return toKey(new Date(d.getFullYear(), d.getMonth() + dir, 1));
}

export function renderHistorique(view, { session }) {
  let mode = 'semaine';
  let ref = today();
  let appareils = [];
  let releves = [];
  let unRel = null;

  function subscribe() {
    if (unRel) unRel();
    const { start, end } = period(mode, ref);
    releves = [];
    draw();
    unRel = onSnapshot(
      query(collection(db, 'releves'), where('date', '>=', toKey(start)), where('date', '<=', toKey(end))),
      (s) => { releves = s.docs.map((d) => ({ id: d.id, ...d.data() })); draw(); },
      (e) => { console.error(e); view.querySelector('#hist-body').innerHTML = `<div class="alertbox">${esc(e.message)}</div>`; },
    );
  }

  function tableHtml(days, apps, map) {
    const head1 = days.map((d) => `<th colspan="2" class="c day">${esc(fmtDay(d))}</th>`).join('');
    const head2 = days.map(() => '<th class="c ms">M</th><th class="c ms">S</th>').join('');
    const rows = apps.map((a) => {
      const cells = days.map((d) => ['matin', 'soir'].map((m) => {
        const r = map[`${toKey(d)}_${m}_${a.id}`];
        if (!r) return '<td class="c v empty">·</td>';
        const corr = Array.isArray(r.historique) && r.historique.length;
        const title = `${r.parNom || ''}${corr ? ` — corrigé (avant : ${r.historique.map((h) => shortTemp(h.valeur)).join(', ')})` : ''}`;
        return `<td class="c v ${r.horsNorme ? 'out' : ''}" title="${esc(title)}">${esc(shortTemp(r.valeur))}${corr ? '<sup>*</sup>' : ''}</td>`;
      }).join('')).join('');
      return `<tr><th class="app">${esc(a.nom)}<span class="rng">${esc(rangeLabel(a.min, a.max))}</span></th>${cells}</tr>`;
    }).join('');
    return `<div class="tablewrap card hist-card"><table class="hist">
      <thead><tr><th class="app" rowspan="2">Appareil</th>${head1}</tr><tr>${head2}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function draw() {
    const { start, end, label } = period(mode, ref);
    const days = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d));
    const map = {};
    for (const r of releves) map[`${r.date}_${r.moment}_${r.appareilId}`] = r;
    const usedIds = new Set(releves.map((r) => r.appareilId));
    const apps = appareils
      .filter((a) => a.actif !== false || usedIds.has(a.id))
      .sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || ((a.ordre ?? 0) - (b.ordre ?? 0)));

    // Tableaux : 16 jours max par tableau pour rester lisible (et tenir sur une page A4).
    const chunks = [];
    for (let i = 0; i < days.length; i += 16) chunks.push(days.slice(i, i + 16));
    const tables = apps.length ? chunks.map((c) => tableHtml(c, apps, map)).join('') : '<div class="card pad muted">Aucun appareil.</div>';

    const outs = releves.filter((r) => r.horsNorme).sort((a, b) => a.date.localeCompare(b.date) || a.moment.localeCompare(b.moment));
    const corrs = releves.filter((r) => Array.isArray(r.historique) && r.historique.length);
    const expected = apps.filter((a) => a.actif !== false).length * days.filter((d) => toKey(d) <= today()).length * 2;
    const nb = releves.length;

    const outHtml = outs.length ? `<table class="table">
      <thead><tr><th>Date</th><th>Appareil</th><th>Valeur</th><th>Attendu</th><th>Relevé par</th></tr></thead>
      <tbody>${outs.map((r) => `<tr><td>${esc(fmtDay(fromKey(r.date)))} · ${esc(r.moment)}</td><td>${esc(r.appareilNom)}</td>
        <td><span class="badge alert">${esc(fmtTemp(r.valeur))}</span></td><td>${esc(rangeLabel(r.min, r.max))}</td><td>${esc(r.parNom)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="pad muted" style="margin:0">Aucune température hors norme sur la période.</p>';

    const corrHtml = corrs.length ? `<table class="table">
      <thead><tr><th>Date</th><th>Appareil</th><th>Ancienne(s) valeur(s)</th><th>Valeur retenue</th><th>Par</th></tr></thead>
      <tbody>${corrs.map((r) => `<tr><td>${esc(fmtDay(fromKey(r.date)))} · ${esc(r.moment)}</td><td>${esc(r.appareilNom)}</td>
        <td>${r.historique.map((h) => `${esc(fmtTemp(h.valeur))} <span class="small muted">(${esc(h.parNom || '?')})</span>`).join('<br>')}</td>
        <td>${esc(fmtTemp(r.valeur))}</td><td>${esc(r.parNom)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="pad muted" style="margin:0">Aucune correction sur la période.</p>';

    const now = new Date();
    view.innerHTML = `
      <div class="row between no-print" style="flex-wrap:wrap;gap:12px">
        <h1 class="title">Historique</h1>
        <button type="button" class="btn primary" id="print">${icon('download', 20)} Exporter en PDF</button>
      </div>
      <div class="row no-print" style="flex-wrap:wrap;gap:12px">
        <div class="segmented seg3" role="group" aria-label="Période">
          ${['jour', 'semaine', 'mois'].map((m) => `<button type="button" data-mode="${m}" class="${mode === m ? 'on' : ''}" aria-pressed="${mode === m}">${m.charAt(0).toUpperCase()}${m.slice(1)}</button>`).join('')}
        </div>
        <div class="row" style="gap:6px">
          <button type="button" class="btn small" data-shift="-1" aria-label="Période précédente">‹</button>
          <input type="date" id="ref" value="${esc(ref)}" class="dateinput" aria-label="Choisir une date">
          <button type="button" class="btn small" data-shift="1" aria-label="Période suivante">›</button>
        </div>
      </div>

      <div class="print-only print-head">
        <div><strong style="font-size:16px">K-RAMEN · Relevés de températures</strong><br>29 Rue de Tournai, 59200 Tourcoing</div>
        <div style="text-align:right">Édité le ${esc(fmtFull(now))} par ${esc(session.user.prenom)}</div>
      </div>

      <div id="hist-body" class="stack" style="gap:16px">
        <div class="stack" style="gap:4px">
          <h2 style="font-size:20px">${esc(label)}</h2>
          <span class="small muted">${nb} relevé${nb > 1 ? 's' : ''}${expected ? ` sur ${expected} attendus à ce jour` : ''} · ${outs.length} hors norme · ${corrs.length} correction${corrs.length > 1 ? 's' : ''}. En rouge : hors norme. * : valeur corrigée.</span>
        </div>
        ${tables}
        <section class="card avoid-break"><h2 class="pad" style="font-size:16px;padding-bottom:0">Températures hors norme</h2>${outHtml}</section>
        <section class="card avoid-break"><h2 class="pad" style="font-size:16px;padding-bottom:0">Corrections</h2>${corrHtml}</section>
        <div class="print-only sign">Visa de la responsable : ______________________________ &nbsp;&nbsp; Date : ____ / ____ / ________</div>
      </div>`;
  }

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'print') { window.print(); return; }
    if (b.dataset.mode) { mode = b.dataset.mode; subscribe(); }
    if (b.dataset.shift) { ref = shift(mode, ref, Number(b.dataset.shift)); subscribe(); }
  });
  view.addEventListener('change', (e) => {
    if (e.target.id === 'ref' && e.target.value) { ref = e.target.value; subscribe(); }
  });

  const unApp = onSnapshot(collection(db, 'appareils'), (s) => {
    appareils = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  subscribe();
  return () => { unApp(); if (unRel) unRel(); };
}

export { TYPES };
