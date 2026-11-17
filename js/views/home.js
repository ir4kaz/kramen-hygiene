// Accueil : avancement des relevés, alertes, accès rapides.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, today, longDate, currentMoment, fmtTemp, rangeLabel,
} from '../util.js';

const TILES = [
  { id: 'temperatures', label: 'Températures', icon: 'thermo' },
  { id: 'nettoyage', label: 'Nettoyage', icon: 'clean', soon: true },
  { id: 'reception', label: 'Réception', icon: 'truck', soon: true },
  { id: 'documents', label: 'Documents', icon: 'folder', soon: true },
];

export function renderHome(view, { session }) {
  const day = today();
  const moment = currentMoment();
  let appareils = [];
  let releves = [];

  function draw() {
    const actifs = appareils.filter((a) => a.actif !== false);
    const faits = releves.filter((r) => r.moment === moment && actifs.some((a) => a.id === r.appareilId));
    const total = actifs.length;
    const done = faits.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const alerts = releves.filter((r) => r.horsNorme);
    const reste = total - done;

    const alertHtml = alerts.length
      ? alerts.map((r) => `
        <div class="alertbox">
          <span class="ic">${icon('alert', 22)}</span>
          <div class="stack" style="gap:4px;flex:1">
            <strong>${esc(r.appareilNom)} : ${esc(fmtTemp(r.valeur))}</strong>
            <span class="muted small">Relevé du ${esc(r.moment)} par ${esc(r.parNom)}. Attendu : ${esc(rangeLabel(r.min, r.max))}. Vérifier la porte et refaire un relevé.</span>
          </div>
        </div>`).join('')
      : (done ? `<div class="okbox">${icon('check', 22)} Aucune température hors norme aujourd’hui.</div>` : '');

    const tiles = TILES.map((t) => {
      const sub = t.id === 'temperatures'
        ? (reste > 0 ? `${reste} appareil${reste > 1 ? 's' : ''} à relever` : 'Relevé terminé')
        : 'Bientôt disponible';
      const hot = t.id === 'temperatures' && reste > 0 ? '<span class="badge hot">À faire</span>' : '';
      return `<a href="#/${t.id}" class="tile ${t.soon ? 'soon' : ''}">
        ${hot}
        <span class="icon">${icon(t.icon)}</span>
        <span class="stack" style="gap:4px"><span class="name">${t.label}</span><span class="small muted">${sub}</span></span>
      </a>`;
    }).join('');

    view.innerHTML = `
      <div class="stack" style="gap:4px">
        <h1 class="title">Bonjour ${esc(session.user.prenom)}</h1>
        <p class="muted" style="margin:0;text-transform:capitalize">${esc(longDate())} · relevé du ${moment}</p>
      </div>
      <div class="grid-top">
        <section class="card pad stack" aria-label="Avancement" style="gap:10px;justify-content:center">
          <div class="row between"><strong>Relevés du ${moment}</strong><span style="font-size:22px;font-weight:700">${done} / ${total}</span></div>
          <div class="progress"><div style="width:${pct}%"></div></div>
        </section>
        <div class="stack">${alertHtml}</div>
      </div>
      <div class="grid2 grid-tiles">${tiles}</div>`;
  }

  draw();
  const un1 = onSnapshot(collection(db, 'appareils'), (s) => {
    appareils = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  const un2 = onSnapshot(query(collection(db, 'releves'), where('date', '==', day)), (s) => {
    releves = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  return () => { un1(); un2(); };
}
