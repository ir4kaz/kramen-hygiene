// Heures : chaque employé note ses heures ; la responsable voit le total et le détail de chacun.
// Même fonctionnement que « Les heures de Rayana » : midi, soir, les deux, ou horaires précis + pause.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, toast, today, dateFromKey, addDaysKey,
} from '../util.js';

const PRESETS = {
  midi: [['11:50', '14:00']],
  soir: [['18:50', '22:00']],
  both: [['11:50', '14:00'], ['18:50', '22:00']],
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export function dureeLigne(l) {
  const a = toMin(l.debut); const b = toMin(l.fin);
  if (a === null || b === null) return 0;
  let d = b - a; if (d < 0) d += 1440; // passe minuit
  return Math.max(0, d - (Number(l.pause) || 0));
}
export const fmtH = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
const jourLabel = (k) => { const d = dateFromKey(k); return `${JOURS[d.getDay()]} ${d.getDate()}`; };
const moisLabel = (k) => { const d = dateFromKey(k); return `${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const debutMois = (k) => `${k.slice(0, 7)}-01`;
const finMois = (k) => { const d = dateFromKey(debutMois(k)); d.setMonth(d.getMonth() + 1); d.setDate(0); return today(d); };
const moisDecale = (k, n) => { const d = dateFromKey(debutMois(k)); d.setMonth(d.getMonth() + n); return today(d); };
const lundi = (k) => { const d = dateFromKey(k); return addDaysKey(k, -((d.getDay() + 6) % 7)); };

export function renderHeures(view, { sub, session }) {
  const isAdmin = session.user.role === 'admin';
  const onglet = isAdmin && sub !== 'moi' ? 'equipe' : 'moi';
  return onglet === 'equipe' ? renderEquipe(view, session) : renderMoi(view, session, isAdmin);
}

function tabs(isAdmin, on) {
  if (!isAdmin) return '';
  return `<div class="tabs" role="tablist">
    <a href="#/heures" class="${on === 'equipe' ? 'on' : ''}">Équipe</a>
    <a href="#/heures/moi" class="${on === 'moi' ? 'on' : ''}">Mes heures</a></div>`;
}

// ---------- Mes heures (chaque employé) ----------
function renderMoi(view, session, isAdmin) {
  const uid = session.user.uid;
  let day = today();
  let docs = {}; // date -> { lignes, totalMin }
  let precis = false;

  const ref = () => doc(db, 'heures', `${uid}_${day}`);
  const lignes = () => docs[day]?.lignes || [];

  function save(newLignes) {
    if (!newLignes.length) {
      deleteDoc(ref()).catch((e) => toast(e.message));
      const copy = { ...docs }; delete copy[day]; docs = copy;
    } else {
      const totalMin = newLignes.reduce((s, l) => s + dureeLigne(l), 0);
      setDoc(ref(), {
        uid, prenom: session.user.prenom, date: day, lignes: newLignes, totalMin, updatedAt: serverTimestamp(),
      }).catch((e) => toast(`Erreur : ${e.message}`, 5000));
      docs = { ...docs, [day]: { lignes: newLignes, totalMin } };
    }
    draw();
  }

  function draw() {
    const ls = lignes();
    const totalJour = ls.reduce((s, l) => s + dureeLigne(l), 0);
    const m0 = debutMois(day); const m1 = finMois(day);
    const duMois = Object.entries(docs).filter(([k]) => k >= m0 && k <= m1).sort(([a], [b]) => a.localeCompare(b));
    const totalMois = duMois.reduce((s, [, v]) => s + (v.totalMin || 0), 0);
    // Totaux par semaine (lundi → dimanche).
    const semaines = {};
    duMois.forEach(([k, v]) => { const l = lundi(k); semaines[l] = (semaines[l] || 0) + (v.totalMin || 0); });

    view.innerHTML = `
      <h1 class="title">Heures</h1>
      ${tabs(isAdmin, 'moi')}
      <section class="card pad stack" style="gap:12px">
        <div class="row between" style="gap:8px">
          <button type="button" class="btn small" data-shift="-1" aria-label="Jour précédent">‹</button>
          <input type="date" class="dateinput" id="hd" value="${esc(day)}" max="${today()}" aria-label="Jour">
          <button type="button" class="btn small" data-shift="1" aria-label="Jour suivant" ${day >= today() ? 'disabled' : ''}>›</button>
        </div>
        <div class="row between"><strong>${esc(cap(jourLabel(day)))} ${esc(moisLabel(day))}</strong><span style="font-size:22px;font-weight:700">${fmtH(totalJour)}</span></div>
        ${ls.length ? `<div class="stack" style="gap:6px">${ls.map((l, i) => `<div class="row between card" style="padding:10px 12px">
            <span>${esc(l.debut)} → ${esc(l.fin)}${l.pause ? ` <span class="small muted">(pause ${l.pause} min)</span>` : ''}</span>
            <span class="row" style="gap:8px"><strong>${fmtH(dureeLigne(l))}</strong><button type="button" class="iconbtn" data-delline="${i}" aria-label="Retirer cet horaire">✕</button></span>
          </div>`).join('')}</div>` : '<span class="muted">Aucune heure ce jour-là.</span>'}
        <div class="grid2" style="gap:8px">
          <button type="button" class="btn" data-preset="midi">Midi<br><span class="small muted">11h50 – 14h00</span></button>
          <button type="button" class="btn" data-preset="soir">Soir<br><span class="small muted">18h50 – 22h00</span></button>
          <button type="button" class="btn" data-preset="both">Midi + soir</button>
          <button type="button" class="btn" data-precis>Horaires précis</button>
        </div>
        ${precis ? `<form id="hp" class="stack" style="gap:10px" novalidate>
          <div class="form-grid">
            <div class="field"><label for="h1">Début</label><input id="h1" type="time" value="11:50"></div>
            <div class="field"><label for="h2">Fin</label><input id="h2" type="time" value="14:00"></div>
            <div class="field"><label for="h3">Pause à retirer (min)</label><input id="h3" inputmode="numeric" value="0"></div>
          </div>
          <button type="submit" class="btn primary">Ajouter cet horaire</button>
        </form>` : ''}
        ${ls.length ? '<button type="button" class="btn small" data-clear style="align-self:flex-start;color:var(--alert)">Effacer ce jour</button>' : ''}
      </section>
      <section class="card pad stack" style="gap:8px">
        <div class="row between"><strong>Total de ${esc(moisLabel(day))}</strong><span style="font-size:20px;font-weight:700">${fmtH(totalMois)}</span></div>
        ${Object.keys(semaines).sort().map((l) => `<div class="row between small"><span>Semaine du ${esc(jourLabel(l))}</span><strong>${fmtH(semaines[l])}</strong></div>`).join('')}
        ${duMois.length ? `<details><summary class="small">Voir le détail des jours</summary>
          <div class="stack" style="gap:4px;margin-top:8px">${duMois.map(([k, v]) => `<a href="#" data-goto="${k}" class="row between small" style="text-decoration:none;color:inherit"><span>${esc(jourLabel(k))}</span><strong>${fmtH(v.totalMin || 0)}</strong></a>`).join('')}</div></details>` : ''}
      </section>`;
  }

  view.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { e.preventDefault(); day = g.dataset.goto; precis = false; draw(); window.scrollTo(0, 0); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.shift) { const n = addDaysKey(day, Number(b.dataset.shift)); if (n <= today()) { day = n; precis = false; draw(); } }
    else if (b.dataset.preset) {
      const add = PRESETS[b.dataset.preset].map(([debut, fin]) => ({ debut, fin, pause: 0 }));
      const ex = lignes();
      const nouvelles = add.filter((a) => !ex.some((l) => l.debut === a.debut && l.fin === a.fin));
      if (!nouvelles.length) { toast('Déjà ajouté.'); return; }
      save([...ex, ...nouvelles]);
    } else if (b.hasAttribute('data-precis')) { precis = !precis; draw(); }
    else if (b.dataset.delline) { const ls = [...lignes()]; ls.splice(Number(b.dataset.delline), 1); save(ls); }
    else if (b.hasAttribute('data-clear')) { if (window.confirm('Effacer toutes les heures de ce jour ?')) save([]); }
  });
  view.addEventListener('change', (e) => { if (e.target.id === 'hd' && e.target.value && e.target.value <= today()) { day = e.target.value; draw(); } });
  view.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const l = { debut: f.h1.value, fin: f.h2.value, pause: Math.max(0, parseInt(f.h3.value, 10) || 0) };
    if (toMin(l.debut) === null || toMin(l.fin) === null) { toast('Indiquez le début et la fin.'); return; }
    if (!dureeLigne(l)) { toast('La pause dépasse le temps travaillé.'); return; }
    precis = false;
    save([...lignes(), l]);
  });

  const un = onSnapshot(query(collection(db, 'heures'), where('uid', '==', uid)), (s) => {
    docs = Object.fromEntries(s.docs.map((d) => [d.data().date, d.data()]));
    draw();
  });
  draw();
  return () => un();
}

// ---------- Équipe (responsable) ----------
function renderEquipe(view, session) {
  let mois = debutMois(today());
  let rows = [];
  let users = [];
  let ouvert = null; // uid dont on affiche le détail
  let un = null;

  function draw() {
    const fin = finMois(mois);
    const parUid = {};
    rows.forEach((r) => { (parUid[r.uid] = parUid[r.uid] || []).push(r); });
    const noms = Object.fromEntries(users.map((u) => [u.id, u.prenom]));
    const ids = [...new Set([...users.filter((u) => u.actif !== false).map((u) => u.id), ...Object.keys(parUid)])]
      .sort((a, b) => (noms[a] || '').localeCompare(noms[b] || ''));
    const total = (uid) => (parUid[uid] || []).reduce((s, r) => s + (r.totalMin || 0), 0);
    const detail = (uid) => {
      const list = (parUid[uid] || []).sort((a, b) => a.date.localeCompare(b.date));
      const semaines = {};
      list.forEach((r) => { const l = lundi(r.date); semaines[l] = (semaines[l] || 0) + (r.totalMin || 0); });
      return `<tr class="detailrow"><td colspan="3">
        <div class="stack" style="gap:4px">
          ${Object.keys(semaines).sort().map((l) => `<div class="row between small"><span>Semaine du ${esc(jourLabel(l))}</span><strong>${fmtH(semaines[l])}</strong></div>`).join('')}
          <table class="table" style="margin-top:6px"><tbody>${list.map((r) => `<tr><td>${esc(jourLabel(r.date))}</td>
            <td class="small">${(r.lignes || []).map((l) => `${esc(l.debut)}–${esc(l.fin)}${l.pause ? ` (−${l.pause} min)` : ''}`).join(' · ')}</td>
            <td style="text-align:right"><strong>${fmtH(r.totalMin || 0)}</strong></td></tr>`).join('') || '<tr><td class="muted">Aucune heure ce mois-ci.</td></tr>'}</tbody></table>
        </div></td></tr>`;
    };
    view.innerHTML = `
      <div class="row between no-print" style="flex-wrap:wrap;gap:12px">
        <h1 class="title">Heures</h1>
        <button type="button" class="btn" id="print">${icon('download', 20)} Exporter en PDF</button>
      </div>
      <div class="no-print">${tabs(true, 'equipe')}</div>
      <div class="row no-print" style="gap:8px">
        <button type="button" class="btn small" data-mois="-1" aria-label="Mois précédent">‹</button>
        <strong style="min-width:150px;text-align:center">${esc(cap(moisLabel(mois)))}</strong>
        <button type="button" class="btn small" data-mois="1" aria-label="Mois suivant" ${mois >= debutMois(today()) ? 'disabled' : ''}>›</button>
      </div>
      <div class="print-only print-head"><div><strong style="font-size:16px">K-RAMEN · Heures de l’équipe</strong><br><span>${esc(cap(moisLabel(mois)))}</span></div><div>Édité par ${esc(session.user.prenom)}</div></div>
      <div class="card tablewrap"><table class="table">
        <thead><tr><th>Employé</th><th>Jours travaillés</th><th style="text-align:right">Total du mois</th></tr></thead>
        <tbody>${ids.map((id) => `<tr class="clickrow" data-uid="${esc(id)}" tabindex="0" role="button" aria-expanded="${ouvert === id || 'false'}">
            <td><strong>${esc(noms[id] || (parUid[id]?.[0]?.prenom) || '?')}</strong> <span class="small muted no-print">${ouvert === id ? '▲' : '▼'}</span></td>
            <td>${(parUid[id] || []).length}</td>
            <td style="text-align:right"><strong>${fmtH(total(id))}</strong></td></tr>
            ${ouvert === id ? detail(id) : ''}`).join('') || '<tr><td colspan="3" class="muted">Aucun employé.</td></tr>'}</tbody>
      </table></div>
      <p class="small muted no-print" style="margin:0">Touchez un employé pour voir le détail jour par jour et le total de chaque semaine. Période : du 1er au ${esc(jourLabel(fin))}.</p>`;
  }

  function subscribe() {
    if (un) un();
    rows = []; draw();
    un = onSnapshot(query(collection(db, 'heures'), where('date', '>=', mois), where('date', '<=', finMois(mois))), (s) => {
      rows = s.docs.map((d) => d.data()); draw();
    });
  }
  const toggle = (uid) => { ouvert = ouvert === uid ? null : uid; draw(); };
  view.addEventListener('click', (e) => {
    const r = e.target.closest('[data-uid]');
    if (r) { toggle(r.dataset.uid); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'print') window.print();
    else if (b.dataset.mois) { mois = moisDecale(mois, Number(b.dataset.mois)); ouvert = null; subscribe(); }
  });
  view.addEventListener('keydown', (e) => {
    const r = e.target.closest?.('[data-uid]');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(r.dataset.uid); }
  });
  const unU = onSnapshot(collection(db, 'users'), (s) => { users = s.docs.map((d) => ({ id: d.id, ...d.data() })); draw(); });
  subscribe();
  return () => { unU(); if (un) un(); };
}
