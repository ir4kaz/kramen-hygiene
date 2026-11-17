// Nettoyage : cocher les tâches après chaque service, chaque jour et lors du nettoyage approfondi.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, setDoc, deleteField, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, today, shortDate, hhmm, toast,
  ZONES, ZONE_ORDER, FREQS, FREQ_ORDER, currentService, SEED_TACHES,
  dayPickerHtml, pastDayBanner, dateFromKey,
} from '../util.js';

export const sessionId = (date, seance, service) => (seance === 'service' ? `${date}_service-${service}` : `${date}_${seance}`);

const daysBetween = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
};

export function renderNettoyage(view, { session }) {
  let day = today();
  let seance = 'service';
  let service = currentService();
  let taches = [];
  let sess = null; // document de la séance affichée
  let derniers = []; // dates des nettoyages approfondis
  let pending = false;
  let unSess = null;
  let editingNote = false;

  const isAdmin = session.user.role === 'admin';
  const ref = () => doc(db, 'nettoyages', sessionId(day, seance, service));
  const list = () => taches.filter((t) => t.actif !== false && t.frequence === seance)
    .sort((a, b) => (ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone)) || ((a.ordre ?? 0) - (b.ordre ?? 0)));

  function saveState() {
    if (!navigator.onLine) return `<span class="savestate off">${icon('cloudoff', 16)} Hors ligne : envoi au retour du réseau</span>`;
    if (pending) return '<span class="savestate off">Envoi en cours…</span>';
    return `<span class="savestate ok">${icon('check', 16)} Enregistré automatiquement</span>`;
  }

  function lastDeepHtml() {
    if (seance !== 'approfondi') return '';
    const prev = derniers.filter((d) => d.date < day && d.nb > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!prev) return '<p class="small muted" style="margin:0">Aucun nettoyage approfondi enregistré avant aujourd’hui.</p>';
    const n = daysBetween(prev.date, day);
    const [y, m, d] = prev.date.split('-').map(Number);
    return `<p class="small muted" style="margin:0">Dernier nettoyage approfondi : ${esc(shortDate(new Date(y, m - 1, d)))} (il y a ${n} jour${n > 1 ? 's' : ''}).</p>`;
  }

  function draw() {
    const items = (sess && sess.items) || {};
    const tl = list();
    const done = tl.filter((t) => items[t.id]).length;
    const pct = tl.length ? Math.round((done / tl.length) * 100) : 0;

    let body;
    if (!taches.length) {
      body = isAdmin
        ? `<div class="card pad stack" style="gap:12px"><strong>Aucune tâche de nettoyage pour l’instant.</strong>
            <span class="muted small">Créez le plan de départ (fiche du bar, entretien après service, citrons, menthe, machine à glaçons). Vous pourrez tout modifier ensuite dans Admin.</span>
            <button type="button" class="btn primary" data-seed style="align-self:flex-start">Créer le plan de nettoyage de départ</button></div>`
        : '<div class="card pad muted">Aucune tâche de nettoyage. La responsable doit créer le plan dans Admin.</div>';
    } else if (!tl.length) {
      body = '<div class="card pad muted">Aucune tâche pour cette catégorie.</div>';
    } else {
      body = ZONE_ORDER.map((z) => {
        const zt = tl.filter((t) => (t.zone || 'autre') === z);
        if (!zt.length) return '';
        return `<section class="group stack">
          <h2>${esc(ZONES[z])}</h2>
          <div class="card list">${zt.map((t) => {
            const it = items[t.id];
            return `<div class="crow ${it ? 'done' : ''}">
              <button type="button" class="checkbtn" data-task="${esc(t.id)}" aria-pressed="${it ? 'true' : 'false'}" aria-label="${it ? 'Décocher' : 'Cocher'} : ${esc(t.nom)}">${it ? icon('check', 26) : ''}</button>
              <div class="info">
                <span class="nm">${esc(t.nom)}</span>
                ${t.detail ? `<span class="small muted">${esc(t.detail)}</span>` : ''}
                ${it ? `<span class="small" style="color:var(--ok)">Fait par ${esc(it.parNom)} à ${esc(hhmm(new Date(it.at)))}</span>` : ''}
              </div>
            </div>`;
          }).join('')}</div>
        </section>`;
      }).join('');
    }

    const seg = FREQ_ORDER.map((f) => `<button type="button" data-seance="${f}" class="${seance === f ? 'on' : ''}" aria-pressed="${seance === f}">${FREQS[f].court}</button>`).join('');
    const sub = seance === 'service' ? `<div class="segmented" role="group" aria-label="Service" style="width:200px">
        <button type="button" data-service="midi" class="${service === 'midi' ? 'on' : ''}" aria-pressed="${service === 'midi'}">Midi</button>
        <button type="button" data-service="soir" class="${service === 'soir' ? 'on' : ''}" aria-pressed="${service === 'soir'}">Soir</button>
      </div>` : '';
    const titre = seance === 'service' ? `Après le service du ${service}` : FREQS[seance].label;

    view.innerHTML = `
      <div class="stack" style="gap:4px">
        <h1 class="title">Nettoyage</h1>
        <span class="small muted">${esc(shortDate(dateFromKey(day)))}</span>
        <span id="savestate">${saveState()}</span>
      </div>
      ${dayPickerHtml(day, isAdmin)}
      ${pastDayBanner(day)}
      <div class="row" style="flex-wrap:wrap;gap:12px">
        <div class="segmented seg3" role="group" aria-label="Type de nettoyage">${seg}</div>
        ${sub}
      </div>
      ${tl.length ? `<section class="card pad stack" style="gap:10px">
        <div class="row between"><strong>${esc(titre)}</strong><span style="font-size:20px;font-weight:700">${done} / ${tl.length}</span></div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        ${lastDeepHtml()}
      </section>` : ''}
      <div class="clean-groups">${body}</div>
      ${tl.length ? `<section class="card pad stack" style="gap:10px">
        <label for="note"><strong>Anomalies / tâches à reprendre</strong></label>
        <textarea id="note" rows="3" class="notearea" placeholder="Ex. : joint du frigo à boissons abîmé, plus de produit vaisselle…">${esc(sess?.anomalies || '')}</textarea>
        <div><button type="button" class="btn small" data-note>Enregistrer la remarque</button></div>
      </section>` : ''}`;
  }

  function toggle(id) {
    const t = taches.find((x) => x.id === id);
    if (!t) return;
    const items = (sess && sess.items) || {};
    const base = { date: day, seance, service: seance === 'service' ? service : null, updatedAt: serverTimestamp() };
    let change;
    if (items[id]) {
      change = { ...base, items: { [id]: deleteField() } };
      const copy = { ...items }; delete copy[id];
      sess = { ...(sess || {}), items: copy };
    } else {
      const entry = {
        nom: t.nom, zone: t.zone || 'autre', par: session.user.uid, parNom: session.user.prenom, at: Date.now(), apresCoup: day !== today(),
      };
      change = { ...base, items: { [id]: entry } };
      sess = { ...(sess || {}), items: { ...items, [id]: entry } };
    }
    setDoc(ref(), change, { merge: true }).catch((e) => { console.error(e); toast('Erreur d’enregistrement. Réessayez.', 4000); });
    const tl = list();
    if (tl.length && tl.every((x) => sess.items[x.id])) toast('Tout est fait, merci !');
    draw();
  }

  function saveNote() {
    const ta = view.querySelector('#note');
    if (!ta) return;
    const anomalies = ta.value.trim();
    setDoc(ref(), {
      date: day, seance, service: seance === 'service' ? service : null, anomalies, anomaliesPar: session.user.prenom, updatedAt: serverTimestamp(),
    }, { merge: true }).catch((e) => toast(e.message));
    sess = { ...(sess || {}), anomalies };
    toast('Remarque enregistrée.');
  }

  async function seed() {
    const b = writeBatch(db);
    SEED_TACHES.forEach((t, i) => b.set(doc(collection(db, 'taches')), { ...t, ordre: i, actif: true, createdAt: serverTimestamp() }));
    try { await b.commit(); toast('Plan de nettoyage créé.'); } catch (e) { toast(`Erreur : ${e.message}`, 5000); }
  }

  function subscribe() {
    if (unSess) unSess();
    sess = null;
    unSess = onSnapshot(ref(), { includeMetadataChanges: true }, (s) => {
      sess = s.exists() ? s.data() : null;
      pending = s.metadata.hasPendingWrites;
      if (editingNote) { const el = view.querySelector('#savestate'); if (el) el.innerHTML = saveState(); } else draw();
    });
    draw();
  }

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.task) toggle(b.dataset.task);
    else if (b.dataset.day && b.dataset.day !== day) changeDay(b.dataset.day);
    else if (b.dataset.seance && b.dataset.seance !== seance) { seance = b.dataset.seance; subscribe(); }
    else if (b.dataset.service && b.dataset.service !== service) { service = b.dataset.service; subscribe(); }
    else if (b.hasAttribute('data-note')) saveNote();
    else if (b.hasAttribute('data-seed')) { b.disabled = true; seed(); }
  });
  function changeDay(d) {
    day = d;
    if (d !== today()) service = 'soir'; else service = currentService();
    subscribe();
  }
  view.addEventListener('change', (e) => {
    if (e.target.matches('[data-daypick]') && e.target.value && e.target.value <= today()) changeDay(e.target.value);
  });
  view.addEventListener('focusin', (e) => { if (e.target.id === 'note') editingNote = true; });
  view.addEventListener('focusout', (e) => {
    if (e.target.id === 'note') {
      editingNote = false;
      if (e.target.value.trim() !== (sess?.anomalies || '')) saveNote();
    }
  });
  const onNet = () => { const el = view.querySelector('#savestate'); if (el) el.innerHTML = saveState(); };
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);

  const un1 = onSnapshot(collection(db, 'taches'), (s) => {
    taches = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!editingNote) draw();
  });
  const un2 = onSnapshot(query(collection(db, 'nettoyages'), where('seance', '==', 'approfondi')), (s) => {
    derniers = s.docs.map((d) => ({ date: d.data().date, nb: Object.keys(d.data().items || {}).length }));
    if (!editingNote) draw();
  });
  subscribe();

  return () => {
    un1(); un2(); if (unSess) unSess();
    window.removeEventListener('online', onNet);
    window.removeEventListener('offline', onNet);
  };
}
