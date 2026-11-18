// Accueil : avancement des relevés, alertes, accès rapides.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, today, longDate, currentMoment, fmtTemp, rangeLabel, currentService, daysUntil,
} from '../util.js';

const TILES = [
  { id: 'temperatures', label: 'Températures', icon: 'thermo' },
  { id: 'nettoyage', label: 'Nettoyage', icon: 'clean' },
  { id: 'reception', label: 'Réception', icon: 'truck' },
  { id: 'dlc', label: 'DLC', icon: 'tag' },
  { id: 'courses', label: 'Courses', icon: 'cart' },
  { id: 'heures', label: 'Heures', icon: 'heures' },
  { id: 'documents', label: 'Documents', icon: 'folder', adminOnly: true },
  { id: 'historique', label: 'Historique', icon: 'history', adminOnly: true },
];

export function renderHome(view, { session }) {
  const day = today();
  const moment = currentMoment();
  let appareils = [];
  let releves = [];
  let taches = [];
  let nets = [];
  let recs = [];
  let dlcs = [];
  let courses = [];
  const service = currentService();

  function draw() {
    const actifs = appareils.filter((a) => a.actif !== false);
    const faits = releves.filter((r) => r.moment === moment && actifs.some((a) => a.id === r.appareilId));
    const total = actifs.length;
    const done = faits.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const alerts = releves.filter((r) => r.horsNorme);
    const reste = total - done;

    // Relevé oublié : le matin à partir de 14h, le soir à partir de 22h (fins de service).
    const h = new Date().getHours();
    const nbMoment = (m) => releves.filter((r) => r.moment === m && actifs.some((a) => a.id === r.appareilId)).length;
    const oublis = [];
    if (h >= 14 && total && nbMoment('matin') < total) oublis.push(['matin', nbMoment('matin')]);
    if (h >= 22 && total && nbMoment('soir') < total) oublis.push(['soir', nbMoment('soir')]);
    const oubliHtml = oublis.map(([m, n]) => `<a href="#/temperatures" class="alertbox" style="text-decoration:none;color:inherit">
        <span class="ic">${icon('thermo', 22)}</span>
        <div class="stack" style="gap:2px"><strong>Le relevé du ${m} n’a pas été fait</strong>
        <span class="small muted">${n} / ${total} appareils relevés. Touchez ici pour le compléter.</span></div></a>`).join('');

    const conseil = (r) => (r.sens === 'froid'
      ? 'Vérifier le réglage et prévenir la responsable.'
      : 'Déplacer les produits et prévenir la responsable.');
    const alertHtml = alerts.length
      ? `<div class="alertbox">
          <span class="ic">${icon('alert', 22)}</span>
          <div class="stack" style="gap:10px;flex:1">
            <strong>${alerts.length} température${alerts.length > 1 ? 's' : ''} hors norme aujourd’hui</strong>
            ${alerts.map((r) => `<div class="stack" style="gap:2px">
              <span><strong>${esc(r.appareilNom)} : ${esc(fmtTemp(r.valeur))}</strong> <span class="small muted">(trop ${esc(r.sens || 'chaud')})</span></span>
              <span class="muted small">Relevé du ${esc(r.moment)} par ${esc(r.parNom)}. Attendu : ${esc(rangeLabel(r.min, r.max))}. ${conseil(r)}</span>
            </div>`).join('')}
          </div>
        </div>`
      : (done ? `<div class="okbox">${icon('check', 22)} Aucune température hors norme aujourd’hui.</div>` : '');
    const dateTxt = longDate();
    const dateCap = dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1);

    // Nettoyage après le service en cours.
    const tService = taches.filter((t) => t.actif !== false && t.frequence === 'service');
    const doneItems = Object.assign({}, ...nets.filter((n) => n.seance === 'service' && n.service === service).map((n) => n.items || {}));
    const doneClean = tService.filter((t) => doneItems[t.id]).length;

    const dlcPerimes = dlcs.filter((x) => daysUntil(x.dlc) < 0).length;
    const dlcBientot = dlcs.filter((x) => { const n = daysUntil(x.dlc); return n >= 0 && n <= 1; }).length;
    const dlcHtml = (dlcPerimes || dlcBientot) ? `<a href="#/dlc" class="alertbox" style="text-decoration:none;color:inherit">
        <span class="ic">${icon('tag', 22)}</span>
        <div class="stack" style="gap:2px"><strong>DLC : ${dlcPerimes ? `${dlcPerimes} périmé${dlcPerimes > 1 ? 's' : ''}` : ''}${dlcPerimes && dlcBientot ? ' · ' : ''}${dlcBientot ? `${dlcBientot} à utiliser aujourd’hui ou demain` : ''}</strong>
        <span class="small muted">Touchez ici pour voir les produits.</span></div></a>` : '';
    const isAdmin = session.user.role === 'admin';
    const tiles = TILES.filter((t) => !t.adminOnly || isAdmin).map((t) => {
      let sub = 'Bientôt disponible';
      let hot = '';
      if (t.id === 'temperatures') {
        sub = reste > 0 ? `${reste} appareil${reste > 1 ? 's' : ''} à relever` : 'Relevé terminé';
        if (reste > 0) hot = '<span class="badge hot">À faire</span>';
      } else if (t.id === 'nettoyage') {
        sub = tService.length ? `Service du ${service} : ${doneClean} / ${tService.length}` : 'Plan à créer';
      } else if (t.id === 'reception') {
        const nc = recs.filter((r) => !r.conforme).length;
        sub = recs.length ? `${recs.length} livraison${recs.length > 1 ? 's' : ''} aujourd’hui${nc ? ` · ${nc} non conforme${nc > 1 ? 's' : ''}` : ''}` : 'Aucune livraison aujourd’hui';
      } else if (t.id === 'dlc') {
        sub = dlcs.length ? `${dlcs.length} produit${dlcs.length > 1 ? 's' : ''} en cours${dlcPerimes ? ` · ${dlcPerimes} périmé${dlcPerimes > 1 ? 's' : ''}` : ''}` : 'Aucun produit en cours';
        if (dlcPerimes + dlcBientot) hot = '<span class="badge hot">À voir</span>';
      } else if (t.id === 'courses') {
        const n = courses.filter((x) => !x.achete).length;
        sub = n ? `${n} article${n > 1 ? 's' : ''} à acheter` : 'Liste vide';
      } else if (t.id === 'heures') {
        sub = session.user.role === 'admin' ? 'Heures de l’équipe' : 'Noter mes heures';
      } else if (t.id === 'documents') {
        sub = 'PMS, fiches, fournisseurs…';
      } else if (t.id === 'historique') {
        sub = 'Relevés, nettoyage, livraisons et PDF';
      }
      return `<a href="#/${t.id}" class="tile ${t.soon ? 'soon' : ''} ${t.wide ? 'wide' : ''}">
        ${hot}
        <span class="icon">${icon(t.icon)}</span>
        <span class="stack" style="gap:4px"><span class="name">${t.label}</span><span class="small muted">${sub}</span></span>
      </a>`;
    }).join('');

    view.innerHTML = `
      <div class="stack" style="gap:4px">
        <h1 class="title">Bonjour ${esc(session.user.prenom)}</h1>
        <p class="muted" style="margin:0">${esc(dateCap)} · relevé du ${moment}</p>
      </div>
      <div class="grid-top">
        <section class="card pad stack" aria-label="Avancement" style="gap:10px;justify-content:center">
          <div class="row between"><strong>Relevés du ${moment}</strong><span style="font-size:22px;font-weight:700">${done} / ${total}</span></div>
          <div class="progress"><div style="width:${pct}%"></div></div>
        </section>
        <div class="stack">${oubliHtml}${dlcHtml}${alertHtml}</div>
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
  const un3 = onSnapshot(collection(db, 'taches'), (s) => {
    taches = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  const un4 = onSnapshot(query(collection(db, 'nettoyages'), where('date', '==', day)), (s) => {
    nets = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  const un5 = onSnapshot(query(collection(db, 'receptions'), where('date', '==', day)), (s) => {
    recs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  const un6 = onSnapshot(query(collection(db, 'dlc'), where('statut', '==', 'en_cours')), (s) => {
    dlcs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  const un7 = onSnapshot(collection(db, 'courses'), (s) => {
    courses = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  return () => { un1(); un2(); un3(); un4(); un5(); un6(); un7(); };
}
