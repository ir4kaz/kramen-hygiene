// Relevé des températures : liste des appareils + pavé numérique.
import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {
  esc, icon, today, shortDate, currentMoment, fmtTemp, parseTemp, rangeLabel, isOut, toast,
  dayPickerHtml, pastDayBanner, dateFromKey,
  TYPES, TYPE_ORDER,
} from '../util.js';

export function renderTemperatures(view, { session }) {
  let day = today();
  const isAdmin = session.user.role === 'admin';
  let un2 = null;
  let moment = currentMoment();
  let appareils = [];
  let releves = []; // relevés du jour (matin + soir)
  let selected = null; // id de l'appareil en cours de saisie
  let buffer = '';
  let pending = false;

  const byApp = () => {
    const m = {};
    for (const r of releves) if (r.moment === moment) m[r.appareilId] = r;
    return m;
  };
  const ordered = () => appareils
    .filter((a) => a.actif !== false)
    .sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || ((a.ordre ?? 0) - (b.ordre ?? 0)) || a.nom.localeCompare(b.nom));

  function rowHtml(a, r) {
    const out = r ? isOut(r.valeur, a.min, a.max) : false;
    const badge = !r ? '<span class="badge todo">À faire</span>'
      : out ? `<span class="badge alert">Trop ${out}</span>` : '<span class="badge ok">OK</span>';
    const cls = !r ? 'empty' : out ? 'alert' : '';
    const val = r ? fmtTemp(r.valeur) : 'Saisir';
    return `<div class="trow ${selected === a.id ? 'sel' : ''}">
      <div class="info"><span class="nm">${esc(a.nom)}</span>${badge}</div>
      <button type="button" class="valbtn ${cls}" data-pick="${esc(a.id)}" aria-label="Saisir la température de ${esc(a.nom)}">${esc(val)}</button>
    </div>`;
  }

  function groupsHtml() {
    const map = byApp();
    const list = ordered();
    if (!list.length) return '<div class="card pad muted">Aucun appareil. La responsable peut en ajouter dans Admin.</div>';
    return TYPE_ORDER.map((t) => {
      const items = list.filter((a) => (a.type || 'autre') === t);
      if (!items.length) return '';
      const ranges = [...new Set(items.map((a) => rangeLabel(a.min, a.max)))];
      return `<section class="group stack">
        <div class="row between"><h2>${TYPES[t].label}</h2><span class="small muted">${esc(ranges.length === 1 ? ranges[0] : '')}</span></div>
        <div class="card list">${items.map((a) => rowHtml(a, map[a.id])).join('')}</div>
      </section>`;
    }).join('');
  }

  function keypadHtml() {
    const a = appareils.find((x) => x.id === selected);
    if (!a) {
      return `<aside class="keypad-panel card pad stack desktop-only" style="gap:10px">
        <strong>Pavé numérique</strong>
        <span class="muted small">Touchez un appareil dans la liste pour saisir sa température.</span>
      </aside>`;
    }
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '0', ','];
    return `<div class="sheet-backdrop" data-close></div>
    <aside class="keypad-panel card pad stack" style="gap:12px" aria-label="Pavé numérique">
      <div class="row between">
        <div class="stack" style="gap:2px">
          <span class="small muted">Saisie en cours</span>
          <strong style="font-size:18px">${esc(a.nom)}</strong>
          <span class="small muted">Attendu : ${esc(rangeLabel(a.min, a.max))}</span>
        </div>
        <button type="button" class="iconbtn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="display" id="disp"></div>
      <div class="keys">${keys.map((k) => `<button type="button" data-key="${k}">${k}</button>`).join('')}</div>
      <div class="grid2" style="gap:8px">
        <button type="button" class="btn" data-key="back" aria-label="Effacer le dernier chiffre">${icon('backspace', 22)}</button>
        <button type="button" class="btn primary" data-ok>Valider</button>
      </div>
    </aside>`;
  }

  function saveStateHtml() {
    if (!navigator.onLine) return `<span class="savestate off">${icon('cloudoff', 16)} Hors ligne : les saisies seront envoyées au retour du réseau</span>`;
    if (pending) return '<span class="savestate off">Envoi en cours…</span>';
    return `<span class="savestate ok">${icon('check', 16)} Enregistré automatiquement</span>`;
  }

  function draw() {
    const map = byApp();
    const list = ordered();
    const done = list.filter((a) => map[a.id]).length;
    view.innerHTML = `
      <div class="row between" style="flex-wrap:wrap;gap:12px">
        <div class="stack" style="gap:4px">
          <h1 class="title">Températures</h1>
          <span class="small muted">Relevé du ${moment} · ${esc(shortDate(dateFromKey(day)))} · ${done} / ${list.length}</span>
          <span id="savestate">${saveStateHtml()}</span>
        </div>
        <div class="segmented" role="group" aria-label="Moment du relevé" style="width:220px">
          <button type="button" data-moment="matin" class="${moment === 'matin' ? 'on' : ''}" aria-pressed="${moment === 'matin'}">Matin</button>
          <button type="button" data-moment="soir" class="${moment === 'soir' ? 'on' : ''}" aria-pressed="${moment === 'soir'}">Soir</button>
        </div>
      </div>
      ${dayPickerHtml(day, true)}
      ${pastDayBanner(day)}
      <div class="temp-layout">
        <div class="temp-groups">${groupsHtml()}</div>
        ${keypadHtml()}
      </div>`;
    updateDisplay();
  }

  function updateDisplay() {
    const d = view.querySelector('#disp');
    if (d) d.innerHTML = `${esc(buffer || ' ')} <span class="muted" style="font-weight:500">°C</span>`;
  }

  function open(id) {
    selected = id;
    const r = byApp()[id];
    buffer = r ? String(r.valeur).replace('.', ',').replace('-', '−') : '';
    draw();
  }

  function close() { selected = null; buffer = ''; draw(); }

  function press(k) {
    if (k === 'back') buffer = buffer.slice(0, -1);
    else if (k === '−') buffer = buffer.startsWith('−') ? buffer.slice(1) : `−${buffer}`;
    else if (k === ',') { if (!buffer.includes(',')) buffer = `${buffer.replace(/^−?$/, (m) => `${m}0`)},`; }
    else if (buffer.replace(/[−,]/g, '').length < 3) {
      const dec = buffer.split(',')[1];
      if (dec === undefined || dec.length < 1) buffer += k;
    }
    updateDisplay();
  }

  function validate() {
    const a = appareils.find((x) => x.id === selected);
    if (!a) return;
    const value = parseTemp(buffer);
    if (value === null || buffer === '' || buffer === '−') { toast('Tapez une température.'); return; }
    if (value < -40 || value > 40) { toast('Valeur bizarre : vérifiez le chiffre.'); return; }
    const prev = byApp()[a.id];
    const out = isOut(value, a.min, a.max);
    const data = {
      appareilId: a.id,
      appareilNom: a.nom,
      type: a.type || 'autre',
      valeur: value,
      min: a.min ?? null,
      max: a.max ?? null,
      horsNorme: !!out,
      sens: out || null,
      date: day,
      moment,
      at: serverTimestamp(),
      par: session.user.uid,
      parNom: session.user.prenom,
      apresCoup: day !== today(),
    };
    if (prev && prev.valeur !== value) {
      // On garde une trace de l'ancienne valeur (important en cas de contrôle).
      data.historique = arrayUnion({ valeur: prev.valeur, parNom: prev.parNom || '', le: new Date().toISOString() });
    }
    // Pas d'« await » : hors ligne, la promesse n'aboutit qu'au retour du réseau.
    setDoc(doc(db, 'releves', `${day}_${moment}_${a.id}`), data, { merge: true })
      .catch((e) => { console.error(e); toast('Erreur d’enregistrement. Réessayez.', 4000); });

    if (out) toast(out === 'chaud' ? `${a.nom} : trop chaud ! Déplacez les produits et prévenez la responsable.` : `${a.nom} : trop froid ! Vérifiez le réglage et prévenez la responsable.`, 5500);

    // Passe à l'appareil suivant qui n'a pas encore de valeur.
    const map = { ...byApp(), [a.id]: { valeur: value } };
    const list = ordered();
    const start = list.findIndex((x) => x.id === a.id);
    const next = [...list.slice(start + 1), ...list.slice(0, start)].find((x) => !map[x.id]);
    if (next) {
      selected = next.id; buffer = '';
      releves = [...releves.filter((r) => !(r.moment === moment && r.appareilId === a.id)), { ...data, valeur: value }];
      draw();
    } else {
      releves = [...releves.filter((r) => !(r.moment === moment && r.appareilId === a.id)), { ...data, valeur: value }];
      if (!out) toast('Relevé terminé, merci !');
      close();
    }
  }

  // ---- Événements ----
  view.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-close]');
    if (!t) return;
    if (t.dataset.pick) open(t.dataset.pick);
    else if (t.dataset.key) press(t.dataset.key);
    else if (t.hasAttribute('data-ok')) validate();
    else if (t.hasAttribute('data-close')) close();
    else if (t.dataset.day && t.dataset.day !== day) { changeDay(t.dataset.day); }
    else if (t.dataset.moment && t.dataset.moment !== moment) { moment = t.dataset.moment; selected = null; buffer = ''; draw(); }
  });

  const onKey = (e) => {
    if (!selected) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === ',' || e.key === '.') press(',');
    else if (e.key === '-') press('−');
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter') validate();
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
  };
  view.addEventListener('change', (e) => {
    if (e.target.matches('[data-daypick]') && e.target.value && e.target.value <= today()) changeDay(e.target.value);
  });
  document.addEventListener('keydown', onKey);
  const onNet = () => { const s = view.querySelector('#savestate'); if (s) s.innerHTML = saveStateHtml(); };
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);

  draw();
  const un1 = onSnapshot(collection(db, 'appareils'), (s) => {
    appareils = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    draw();
  });
  function subscribeDay() {
    if (un2) un2();
    un2 = onSnapshot(query(collection(db, 'releves'), where('date', '==', day)), { includeMetadataChanges: true }, (s) => {
    releves = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    pending = s.metadata.hasPendingWrites;
    // On ne redessine pas tout pendant une saisie (évite de perdre le pavé).
    if (selected) onNet(); else draw();
  });
  }
  function changeDay(d) {
    day = d; selected = null; buffer = '';
    if (d !== today()) moment = 'soir'; else moment = currentMoment();
    releves = []; draw(); subscribeDay();
  }
  subscribeDay();

  return () => {
    un1(); if (un2) un2();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('online', onNet);
    window.removeEventListener('offline', onNet);
  };
}
