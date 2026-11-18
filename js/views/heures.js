// Heures sup : les employés sont en CDI 35 h ; on ne note que les heures supplémentaires,
// au midi et/ou au soir (ex. 40 min, 1 h 30). La responsable voit tout mais ne modifie rien.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, toast, today, dateFromKey, addDaysKey,
} from '../util.js';

const CHOIX = [15, 30, 45, 60, 90, 120]; // minutes proposées
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export const fmtH = (min) => {
  const h = Math.floor(min / 60); const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const jourLabel = (k) => { const d = dateFromKey(k); return `${JOURS[d.getDay()]} ${d.getDate()}`; };
const moisLabel = (k) => { const d = dateFromKey(k); return `${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const debutMois = (k) => `${k.slice(0, 7)}-01`;
const finMois = (k) => { const d = dateFromKey(debutMois(k)); d.setMonth(d.getMonth() + 1); d.setDate(0); return today(d); };
const moisDecale = (k, n) => { const d = dateFromKey(debutMois(k)); d.setMonth(d.getMonth() + n); return today(d); };
const lundi = (k) => { const d = dateFromKey(k); return addDaysKey(k, -((d.getDay() + 6) % 7)); };
const totalDoc = (r) => (Number(r.midi) || 0) + (Number(r.soir) || 0);

export function renderHeures(view, { sub, session }) {
  const isAdmin = session.user.role === 'admin';
  const equipe = isAdmin && sub !== 'moi';
  return equipe ? renderEquipe(view, session) : renderMoi(view, session, isAdmin);
}

function tabs(isAdmin, on) {
  if (!isAdmin) return '';
  return `<div class="tabs" role="tablist">
    <a href="#/heures" class="${on === 'equipe' ? 'on' : ''}">Équipe</a>
    <a href="#/heures/moi" class="${on === 'moi' ? 'on' : ''}">Mes heures sup</a></div>`;
}

// ---------- Mes heures sup (employé) ----------
function renderMoi(view, session, isAdmin) {
  const uid = session.user.uid;
  let day = today();
  let docs = {}; // date -> { midi, soir }
  let ouvert = null; // 'midi' | 'soir' : choix de durée affiché

  const ref = () => doc(db, 'heures', `${uid}_${day}`);

  function setService(service, minutes) {
    const cur = docs[day] || { midi: 0, soir: 0 };
    const next = { midi: Number(cur.midi) || 0, soir: Number(cur.soir) || 0, [service]: minutes };
    if (!next.midi && !next.soir) {
      deleteDoc(ref()).catch((e) => toast(e.message));
      const copy = { ...docs }; delete copy[day]; docs = copy;
    } else {
      setDoc(ref(), {
        uid, prenom: session.user.prenom, date: day, midi: next.midi, soir: next.soir,
        totalMin: next.midi + next.soir, updatedAt: serverTimestamp(),
      }).catch((e) => toast(`Erreur : ${e.message}`, 5000));
      docs = { ...docs, [day]: next };
    }
    ouvert = null;
    draw();
  }

  function carte(service, label) {
    const v = Number(docs[day]?.[service]) || 0;
    const on = ouvert === service;
    return `<div class="card pad stack hscard ${v ? 'has' : ''}" style="gap:10px">
      <button type="button" class="hsbtn" data-open="${service}" aria-expanded="${on}">
        <span class="stack" style="gap:2px;align-items:flex-start"><strong style="font-size:18px">${label}</strong>
          <span class="small muted">${v ? 'Heures sup ajoutées' : 'Pas d’heures sup'}</span></span>
        <span class="hsval">${v ? `+ ${fmtH(v)}` : '+'}</span>
      </button>
      ${on ? `<div class="stack" style="gap:8px">
        <span class="small muted">Combien d’heures sup au ${service} ?</span>
        <div class="chips">${CHOIX.map((m) => `<button type="button" class="chip ${v === m ? 'on' : ''}" data-set="${service}" data-min="${m}">${fmtH(m)}</button>`).join('')}</div>
        <form class="row" data-autre="${service}" style="gap:8px;align-items:flex-end;flex-wrap:wrap" novalidate>
          <div class="field" style="width:90px"><label for="ah-${service}">Heures</label><input id="ah-${service}" inputmode="numeric" placeholder="0"></div>
          <div class="field" style="width:90px"><label for="am-${service}">Minutes</label><input id="am-${service}" inputmode="numeric" placeholder="40"></div>
          <button type="submit" class="btn">Valider</button>
        </form>
        ${v ? `<button type="button" class="btn small" data-set="${service}" data-min="0" style="align-self:flex-start;color:var(--alert)">Pas d’heures sup (effacer)</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  function draw() {
    const totalJour = totalDoc(docs[day] || {});
    const m0 = debutMois(day); const m1 = finMois(day);
    const duMois = Object.entries(docs).filter(([k]) => k >= m0 && k <= m1).sort(([a], [b]) => a.localeCompare(b));
    const totalMois = duMois.reduce((s, [, v]) => s + totalDoc(v), 0);
    const semaines = {};
    duMois.forEach(([k, v]) => { const l = lundi(k); semaines[l] = (semaines[l] || 0) + totalDoc(v); });

    view.innerHTML = `
      <h1 class="title">Heures sup</h1>
      ${tabs(isAdmin, 'moi')}
      <div class="row between" style="gap:8px;max-width:520px">
        <button type="button" class="btn small" data-shift="-1" aria-label="Jour précédent">‹</button>
        <input type="date" class="dateinput" id="hd" value="${esc(day)}" max="${today()}" aria-label="Jour">
        <button type="button" class="btn small" data-shift="1" aria-label="Jour suivant" ${day >= today() ? 'disabled' : ''}>›</button>
      </div>
      <div class="row between" style="max-width:520px"><strong>${esc(cap(jourLabel(day)))} ${esc(moisLabel(day))}</strong>
        <span style="font-size:20px;font-weight:700">${totalJour ? `+ ${fmtH(totalJour)}` : '—'}</span></div>
      <div class="hsgrid">${carte('midi', 'Midi')}${carte('soir', 'Soir')}</div>
      <section class="card pad stack" style="gap:8px;max-width:520px">
        <div class="row between"><strong>Heures sup de ${esc(moisLabel(day))}</strong><span style="font-size:20px;font-weight:700">${fmtH(totalMois)}</span></div>
        ${Object.keys(semaines).sort().map((l) => `<div class="row between small"><span>Semaine du ${esc(jourLabel(l))}</span><strong>${fmtH(semaines[l])}</strong></div>`).join('')}
        ${duMois.length ? `<details><summary class="small">Voir le détail des jours</summary>
          <div class="stack" style="gap:4px;margin-top:8px">${duMois.map(([k, v]) => `<a href="#" data-goto="${k}" class="row between small" style="text-decoration:none;color:inherit">
            <span>${esc(jourLabel(k))}${v.midi ? ` · midi ${fmtH(v.midi)}` : ''}${v.soir ? ` · soir ${fmtH(v.soir)}` : ''}</span><strong>${fmtH(totalDoc(v))}</strong></a>`).join('')}</div></details>`
          : '<span class="small muted">Aucune heure sup ce mois-ci.</span>'}
      </section>`;
  }

  view.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { e.preventDefault(); day = g.dataset.goto; ouvert = null; draw(); window.scrollTo(0, 0); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.shift) { const n = addDaysKey(day, Number(b.dataset.shift)); if (n <= today()) { day = n; ouvert = null; draw(); } }
    else if (b.dataset.open) { ouvert = ouvert === b.dataset.open ? null : b.dataset.open; draw(); }
    else if (b.dataset.set) setService(b.dataset.set, Number(b.dataset.min));
  });
  view.addEventListener('submit', (e) => {
    e.preventDefault();
    const service = e.target.dataset.autre; if (!service) return;
    const h = parseInt(e.target.querySelector(`#ah-${service}`).value, 10) || 0;
    const m = parseInt(e.target.querySelector(`#am-${service}`).value, 10) || 0;
    const total = h * 60 + m;
    if (total <= 0 || total > 12 * 60) { toast('Indiquez une durée (ex. 0 h 40 ou 1 h 30).'); return; }
    setService(service, total);
  });
  view.addEventListener('change', (e) => { if (e.target.id === 'hd' && e.target.value && e.target.value <= today()) { day = e.target.value; ouvert = null; draw(); } });

  const un = onSnapshot(query(collection(db, 'heures'), where('uid', '==', uid)), (s) => {
    docs = Object.fromEntries(s.docs.map((d) => [d.data().date, d.data()]));
    if (!ouvert) draw();
  });
  draw();
  return () => un();
}

// ---------- Équipe (responsable, lecture seule) ----------
function renderEquipe(view, session) {
  let mois = debutMois(today());
  let rows = [];
  let users = [];
  let ouvert = null;
  let un = null;

  function draw() {
    const parUid = {};
    rows.forEach((r) => { (parUid[r.uid] = parUid[r.uid] || []).push(r); });
    const noms = Object.fromEntries(users.map((u) => [u.id, u.prenom]));
    const ids = [...new Set([...users.filter((u) => u.actif !== false).map((u) => u.id), ...Object.keys(parUid)])]
      .sort((a, b) => (noms[a] || '').localeCompare(noms[b] || ''));
    const total = (uid) => (parUid[uid] || []).reduce((s, r) => s + totalDoc(r), 0);
    const totalEquipe = ids.reduce((s, id) => s + total(id), 0);
    const detail = (uid) => {
      const list = (parUid[uid] || []).filter((r) => totalDoc(r) > 0).sort((a, b) => a.date.localeCompare(b.date));
      const semaines = {};
      list.forEach((r) => { const l = lundi(r.date); semaines[l] = (semaines[l] || 0) + totalDoc(r); });
      return `<tr class="detailrow"><td colspan="3"><div class="stack" style="gap:4px">
        ${Object.keys(semaines).sort().map((l) => `<div class="row between small"><span>Semaine du ${esc(jourLabel(l))}</span><strong>${fmtH(semaines[l])}</strong></div>`).join('')}
        <table class="table" style="margin-top:6px"><tbody>${list.map((r) => `<tr><td>${esc(jourLabel(r.date))}</td>
          <td class="small">${r.midi ? `Midi : ${fmtH(r.midi)}` : ''}${r.midi && r.soir ? ' · ' : ''}${r.soir ? `Soir : ${fmtH(r.soir)}` : ''}</td>
          <td style="text-align:right"><strong>${fmtH(totalDoc(r))}</strong></td></tr>`).join('') || '<tr><td class="muted">Aucune heure sup ce mois-ci.</td></tr>'}</tbody></table>
      </div></td></tr>`;
    };
    view.innerHTML = `
      <div class="row between no-print" style="flex-wrap:wrap;gap:12px">
        <h1 class="title">Heures sup</h1>
        <button type="button" class="btn" id="print">${icon('download', 20)} Exporter en PDF</button>
      </div>
      <div class="no-print">${tabs(true, 'equipe')}</div>
      <div class="row no-print" style="gap:8px">
        <button type="button" class="btn small" data-mois="-1" aria-label="Mois précédent">‹</button>
        <strong style="min-width:150px;text-align:center">${esc(cap(moisLabel(mois)))}</strong>
        <button type="button" class="btn small" data-mois="1" aria-label="Mois suivant" ${mois >= debutMois(today()) ? 'disabled' : ''}>›</button>
      </div>
      <div class="print-only print-head"><div><strong style="font-size:16px">K-RAMEN · Heures supplémentaires</strong><br>${esc(cap(moisLabel(mois)))}</div><div>Édité par ${esc(session.user.prenom)}</div></div>
      <div class="card tablewrap"><table class="table">
        <thead><tr><th>Employé</th><th>Jours avec heures sup</th><th style="text-align:right">Heures sup du mois</th></tr></thead>
        <tbody>${ids.map((id) => `<tr class="clickrow" data-uid="${esc(id)}" tabindex="0" role="button" aria-expanded="${ouvert === id}">
            <td><strong>${esc(noms[id] || parUid[id]?.[0]?.prenom || '?')}</strong> <span class="small muted no-print">${ouvert === id ? '▲' : '▼'}</span></td>
            <td>${(parUid[id] || []).filter((r) => totalDoc(r) > 0).length}</td>
            <td style="text-align:right"><strong>${fmtH(total(id))}</strong></td></tr>
            ${ouvert === id ? detail(id) : ''}`).join('') || '<tr><td colspan="3" class="muted">Aucun employé.</td></tr>'}
          <tr><td><strong>Total équipe</strong></td><td></td><td style="text-align:right"><strong>${fmtH(totalEquipe)}</strong></td></tr></tbody>
      </table></div>
      <p class="small muted no-print" style="margin:0">Chaque employé note lui-même ses heures sup ; vous les consultez ici sans pouvoir les modifier. Touchez un nom pour voir le détail.</p>`;
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
