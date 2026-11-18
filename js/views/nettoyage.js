// Nettoyage : cocher les tâches après chaque service, chaque jour et lors du nettoyage approfondi.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, today, shortDate, hhmm, toast,
  ZONES, ZONE_ORDER, zoneOf, FREQS, FREQ_ORDER, currentService, SEED_TACHES,
  dayPickerHtml, pastDayBanner, dateFromKey, longDate, addDaysKey,
} from '../util.js';

// Une « séance » = un jour + une zone (bar ou cuisine) + un type de nettoyage.
export const sessionId = (date, seance, service, zone) => `${date}_${zone}_${seance === 'service' ? `service-${service}` : seance}`;

const daysBetween = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
};

// « À faire absolument » : une tâche cochée sur un jour à venir devient une obligation pour ce jour-là.
// Elle s'affiche en alerte (accueil + nettoyage) jusqu'à ce qu'elle soit faite, même si le jour est passé.
export const aFaireId = (date, seance, service, zone, tacheId) => `${sessionId(date, seance, service, zone)}__${tacheId}`;
export const seanceLabel = (x) => (x.seance === 'service' ? `après le service du ${x.service}` : FREQS[x.seance]?.court.toLowerCase() || x.seance);

export function renderNettoyage(view, { session }) {
  let day = today();
  let seance = 'service';
  let zone = (() => { try { return localStorage.getItem('kr_zone') === 'cuisine' ? 'cuisine' : 'bar'; } catch (e) { return 'bar'; } })();
  let service = currentService();
  let taches = [];
  let sess = null; // document de la séance affichée
  let derniers = []; // dates des nettoyages approfondis
  let pending = false;
  let unSess = null;
  let editingNote = false;
  let aFaire = []; // toutes les tâches « à faire absolument »
  const isFuture = () => day > today();

  const isAdmin = session.user.role === 'admin';
  const ref = () => doc(db, 'nettoyages', sessionId(day, seance, service, zone));
  const list = () => taches.filter((t) => t.actif !== false && t.frequence === seance && zoneOf(t.zone) === zone)
    .sort((a, b) => (ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone)) || ((a.ordre ?? 0) - (b.ordre ?? 0)));

  function saveState() {
    if (!navigator.onLine) return `<span class="savestate off">${icon('cloudoff', 16)} Hors ligne : envoi au retour du réseau</span>`;
    if (pending) return '<span class="savestate off">Envoi en cours…</span>';
    return `<span class="savestate ok">${icon('check', 16)} Enregistré automatiquement</span>`;
  }

  function lastDeepHtml() {
    if (seance !== 'approfondi') return '';
    const prev = derniers.filter((d) => d.zone === zone && d.date < day && d.nb > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!prev) return '<p class="small muted" style="margin:0">Aucun nettoyage approfondi enregistré avant aujourd’hui.</p>';
    const n = daysBetween(prev.date, day);
    const [y, m, d] = prev.date.split('-').map(Number);
    return `<p class="small muted" style="margin:0">Dernier nettoyage approfondi : ${esc(shortDate(new Date(y, m - 1, d)))} (il y a ${n} jour${n > 1 ? 's' : ''}).</p>`;
  }

  function draw() {
    const items = (sess && sess.items) || {};
    const fut = isFuture();
    // Tâches « à faire absolument » qui concernent l'écran affiché.
    const sameSess = (x) => x.zone === zone && x.seance === seance && (seance !== 'service' || x.service === service);
    const prevues = new Set(aFaire.filter((x) => !x.fait && x.date === day && sameSess(x)).map((x) => x.tacheId));
    const urgentes = new Set(aFaire.filter((x) => !x.fait && x.date <= day && sameSess(x)).map((x) => x.tacheId));
    const tl = list().sort((a, b) => (fut ? 0 : (urgentes.has(b.id) - urgentes.has(a.id))));
    const done = tl.filter((t) => items[t.id]).length;
    const pct = tl.length ? Math.round((done / tl.length) * 100) : 0;

    let body;
    if (!taches.length) {
      body = true
        ? `<div class="card pad stack" style="gap:12px"><strong>Aucune tâche de nettoyage pour l’instant.</strong>
            <span class="muted small">Créez le plan de départ (fiche du bar, entretien après service, citrons, menthe, machine à glaçons). Vous pourrez en ajouter d’autres dans Réglages.</span>
            <button type="button" class="btn primary" data-seed style="align-self:flex-start">Créer le plan de nettoyage de départ</button></div>`
        : '<div class="card pad muted">Aucune tâche de nettoyage. La responsable doit créer le plan dans Admin.</div>';
    } else if (!tl.length) {
      body = `<div class="card pad muted">Aucune tâche « ${esc(FREQS[seance].court)} » pour ${esc(ZONES[zone])}. Ajoutez-en dans Réglages > Nettoyage.</div>`;
    } else {
      body = [zone].map(() => {
        const zt = tl;
        return `<section class="group stack">
          <div class="card list">${zt.map((t) => {
            if (fut) {
              const on = prevues.has(t.id);
              return `<div class="crow ${on ? 'planned' : ''}">
              <button type="button" class="checkbtn plan" data-task="${esc(t.id)}" aria-pressed="${on}" aria-label="${on ? 'Retirer' : 'Rendre obligatoire'} : ${esc(t.nom)}">${on ? '!' : ''}</button>
              <div class="info">
                <span class="nm">${esc(t.nom)}</span>
                ${t.detail ? `<span class="small muted">${esc(t.detail)}</span>` : ''}
                ${on ? '<span class="badge alert">À faire absolument</span>' : ''}
              </div>
            </div>`;
            }
            const it = items[t.id];
            const urg = !it && urgentes.has(t.id);
            return `<div class="crow ${it ? 'done' : ''} ${urg ? 'urgent' : ''}">
              <button type="button" class="checkbtn" data-task="${esc(t.id)}" aria-pressed="${it ? 'true' : 'false'}" aria-label="${it ? 'Décocher' : 'Cocher'} : ${esc(t.nom)}">${it ? icon('check', 26) : ''}</button>
              <div class="info">
                <span class="nm">${esc(t.nom)}</span>
                ${urg ? '<span class="badge alert">À faire absolument</span>' : ''}
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
      <div class="segmented zonesel" role="group" aria-label="Zone">
        ${ZONE_ORDER.map((z) => `<button type="button" data-zone="${z}" class="${zone === z ? 'on' : ''}" aria-pressed="${zone === z}">${esc(ZONES[z])}</button>`).join('')}
      </div>
      ${dayPickerHtml(day, true, true)}
      ${fut ? `<div class="warnbox"><strong>Vous préparez le ${esc(longDate(dateFromKey(day)))}.</strong><br>
        <span class="small">Touchez une tâche pour la rendre <strong>« à faire absolument »</strong> ce jour-là. Elle s’affichera en alerte sur l’accueil jusqu’à ce qu’elle soit faite.</span></div>` : pastDayBanner(day)}
      ${resteHtml()}
      <div class="row" style="flex-wrap:wrap;gap:12px">
        <div class="segmented seg4" role="group" aria-label="Type de nettoyage">${seg}</div>
        ${sub}
      </div>
      ${tl.length && fut ? `<section class="card pad"><strong>${esc(titre)} : ${prevues.size} tâche${prevues.size > 1 ? 's' : ''} à faire absolument</strong></section>` : ''}
      ${tl.length && !fut ? `<section class="card pad stack" style="gap:10px">
        <div class="row between"><strong>${esc(titre)}</strong><span style="font-size:20px;font-weight:700">${done} / ${tl.length}</span></div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        ${lastDeepHtml()}
      </section>` : ''}
      <div class="clean-groups">${body}</div>
      ${tl.length && !fut ? `<section class="card pad stack" style="gap:10px">
        <label for="note"><strong>Anomalies / tâches à reprendre</strong></label>
        <textarea id="note" rows="3" class="notearea" placeholder="Ex. : joint du frigo à boissons abîmé, plus de produit vaisselle…">${esc(sess?.anomalies || '')}</textarea>
        <div><button type="button" class="btn small" data-note>Enregistrer la remarque</button></div>
      </section>` : ''}`;
  }

  // Encadré : toutes les tâches « à faire absolument » en attente (toutes zones et types), pour s'y rendre d'un geste.
  function resteHtml() {
    const fut = isFuture();
    const l = aFaire.filter((x) => !x.fait && (fut ? x.date === day : x.date <= day))
      .sort((a, b) => a.date.localeCompare(b.date) || a.zone.localeCompare(b.zone));
    if (!l.length) return '';
    return `<div class="alertbox"><span class="ic">${icon('alert', 22)}</span><div class="stack" style="gap:8px;flex:1">
      <strong>${fut ? 'Prévu ce jour-là' : 'À faire absolument'} (${l.length})</strong>
      ${l.map((x) => `<button type="button" class="linkrow" data-goto="${esc(x.id)}">
        <strong>${esc(x.nom)}</strong> <span class="small muted">· ${esc(ZONES[x.zone] || x.zone)} · ${esc(seanceLabel(x))}${x.date < day ? ` · <span class="txt-alert">prévu le ${esc(shortDate(dateFromKey(x.date)))}</span>` : ''}</span>
      </button>`).join('')}
    </div></div>`;
  }

  function goTo(id) {
    const x = aFaire.find((a) => a.id === id); if (!x) return;
    if (x.date > day) day = x.date;
    zone = x.zone; seance = x.seance; if (x.service) service = x.service;
    try { localStorage.setItem('kr_zone', zone); } catch (er) { /* rien */ }
    subscribe();
    window.scrollTo(0, 0);
  }

  function togglePlan(t) {
    const id = aFaireId(day, seance, service, zone, t.id);
    const ex = aFaire.find((x) => x.id === id);
    if (ex && !ex.fait) {
      aFaire = aFaire.filter((x) => x.id !== id);
      deleteDoc(doc(db, 'a_faire', id)).catch((e) => toast(e.message));
    } else {
      const entry = {
        date: day, zone, seance, service: seance === 'service' ? service : null, tacheId: t.id, nom: t.nom,
        fait: false, par: session.user.uid, parNom: session.user.prenom, at: Date.now(),
      };
      aFaire = [...aFaire.filter((x) => x.id !== id), { id, ...entry }];
      setDoc(doc(db, 'a_faire', id), entry).catch((e) => toast(e.message));
      toast('Ajouté : à faire absolument ce jour-là.');
    }
    draw();
  }

  // Quand une tâche est cochée (ou décochée), on met à jour ses « à faire absolument ».
  function syncAFaire(t, coche) {
    const sid = sessionId(day, seance, service, zone);
    const same = (x) => x.tacheId === t.id && x.zone === zone && x.seance === seance && (seance !== 'service' || x.service === service);
    aFaire.forEach((x) => {
      if (coche && !x.fait && same(x) && x.date <= day) {
        x.fait = true; x.faitSession = sid;
        updateDoc(doc(db, 'a_faire', x.id), { fait: true, faitLe: day, faitSession: sid, faitPar: session.user.prenom }).catch((e) => console.error(e));
      } else if (!coche && x.fait && x.faitSession === sid && x.tacheId === t.id) {
        x.fait = false; x.faitSession = null;
        updateDoc(doc(db, 'a_faire', x.id), { fait: false, faitLe: deleteField(), faitSession: deleteField(), faitPar: deleteField() }).catch((e) => console.error(e));
      }
    });
  }

  function toggle(id) {
    const t = taches.find((x) => x.id === id);
    if (!t) return;
    if (isFuture()) { togglePlan(t); return; }
    const items = (sess && sess.items) || {};
    const base = { date: day, zone, seance, service: seance === 'service' ? service : null, updatedAt: serverTimestamp() };
    let change;
    if (items[id]) {
      change = { ...base, items: { [id]: deleteField() } };
      const copy = { ...items }; delete copy[id];
      sess = { ...(sess || {}), items: copy };
      syncAFaire(t, false);
    } else {
      const entry = {
        nom: t.nom, zone: t.zone || 'autre', par: session.user.uid, parNom: session.user.prenom, at: Date.now(), apresCoup: day !== today(),
      };
      change = { ...base, items: { [id]: entry } };
      sess = { ...(sess || {}), items: { ...items, [id]: entry } };
      syncAFaire(t, true);
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
      date: day, zone, seance, service: seance === 'service' ? service : null, anomalies, anomaliesPar: session.user.prenom, updatedAt: serverTimestamp(),
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
    else if (b.dataset.goto) goTo(b.dataset.goto);
    else if (b.dataset.day && b.dataset.day !== day) changeDay(b.dataset.day);
    else if (b.dataset.zone && b.dataset.zone !== zone) {
      zone = b.dataset.zone;
      try { localStorage.setItem('kr_zone', zone); } catch (er) { /* rien */ }
      subscribe();
    } else if (b.dataset.seance && b.dataset.seance !== seance) { seance = b.dataset.seance; subscribe(); }
    else if (b.dataset.service && b.dataset.service !== service) { service = b.dataset.service; subscribe(); }
    else if (b.hasAttribute('data-note')) saveNote();
    else if (b.hasAttribute('data-seed')) { b.disabled = true; seed(); }
  });
  function changeDay(d) {
    day = d;
    if (d === today()) service = currentService(); else if (d < today()) service = 'soir';
    subscribe();
  }
  view.addEventListener('change', (e) => {
    if (e.target.matches('[data-daypick]') && e.target.value) changeDay(e.target.value);
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
    derniers = s.docs.map((d) => ({ date: d.data().date, zone: d.data().zone || 'bar', nb: Object.keys(d.data().items || {}).length }));
    if (!editingNote) draw();
  });
  let menage = false;
  const un3 = onSnapshot(collection(db, 'a_faire'), (s) => {
    aFaire = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Ménage : on efface les tâches faites depuis plus de 30 jours.
    if (!menage) {
      menage = true;
      const lim = addDaysKey(today(), -30);
      aFaire.filter((x) => x.fait && (x.faitLe || x.date) < lim).forEach((x) => deleteDoc(doc(db, 'a_faire', x.id)).catch(() => {}));
    }
    if (!editingNote) draw();
  });
  subscribe();

  return () => {
    un1(); un2(); un3(); if (unSess) unSess();
    window.removeEventListener('online', onNet);
    window.removeEventListener('offline', onNet);
  };
}
