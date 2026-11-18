// Petits outils partagés.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const PATHS = {
  thermo: '<path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
  clean: '<path d="M12 2v9"/><path d="M8 11h8a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1Z"/><path d="M7 14l-2 7h14l-2-7"/><path d="M10 17v4"/><path d="M14 17v4"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',
  snow: '<path d="M12 2v20"/><path d="M4.5 6.5l15 11"/><path d="M19.5 6.5l-15 11"/><path d="M9 3.5l3 2.5 3-2.5"/><path d="M9 20.5l3-2.5 3 2.5"/>',
  pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M2 10h20"/><path d="M9 6c0-1 1-1.5 1-2.5"/><path d="M14 6c0-1 1-1.5 1-2.5"/>',
  open: '<path d="M7 8h10l-1 13H8Z"/><path d="M6 8l1-3h10l1 3"/><path d="M10 3.5l4-1.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  history: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  admin: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  cloudoff: '<path d="M3 3l18 18"/><path d="M8 8a5 5 0 0 0-1 9.9h10"/><path d="M17.5 17.5A4 4 0 0 0 16 10h-1.3A6 6 0 0 0 10 6.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
  chat: '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5Z"/>',
  sms: '<path d="M4 5h16v11H8l-4 4Z"/><path d="M8 10h8"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4Z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 8H6.5"/>',
  heures: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5h4"/>',
  backspace: '<path d="M21 5H8l-6 7 6 7h13Z"/><path d="M12 9l6 6"/><path d="M18 9l-6 6"/>',
};

export function icon(name, size = 24) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

// Date du jour au format AAAA-MM-JJ (heure locale de l'appareil).
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function longDate(d = new Date()) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function shortDate(d = new Date()) {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function hhmm(d = new Date()) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
}

// Avant 16h : relevé du matin, après : relevé du soir.
export const currentMoment = (d = new Date()) => (d.getHours() < 16 ? 'matin' : 'soir');

// « Élodie » -> « elodie » (sert d'identifiant de connexion).
export function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const fmtTemp = (v) => (v === null || v === undefined || v === '' ? '' : `${String(v).replace('.', ',').replace('-', '−')} °C`);

export function parseTemp(str) {
  const n = Number(String(str).replace(',', '.').replace('−', '-'));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function rangeLabel(min, max) {
  const f = (v) => String(v).replace('.', ',').replace('-', '−');
  if (min !== null && min !== undefined && max !== null && max !== undefined) return `${f(min)} à ${f(max)} °C`;
  if (max !== null && max !== undefined) return `${f(max)} °C ou moins`;
  if (min !== null && min !== undefined) return `${f(min)} °C ou plus`;
  return '';
}

export function isOut(value, min, max) {
  if (value === null || value === undefined) return false;
  if (max !== null && max !== undefined && value > max) return 'chaud';
  if (min !== null && min !== undefined && value < min) return 'froid';
  return false;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const TYPES = {
  frigo: { label: 'Réfrigérateurs', one: 'Réfrigérateur', min: 0, max: 4 },
  congel: { label: 'Congélateurs', one: 'Congélateur', min: null, max: -18 },
  saladette: { label: 'Saladettes', one: 'Saladette', min: 0, max: 4 },
  chambre: { label: 'Chambres froides', one: 'Chambre froide', min: 0, max: 3 },
  autre: { label: 'Autres', one: 'Appareil', min: 0, max: 4 },
};
export const TYPE_ORDER = ['frigo', 'congel', 'saladette', 'chambre', 'autre'];

// ---------- Nettoyage ----------
export const ZONES = {
  bar: 'Bar / salle',
  cuisine: 'Cuisine',
};
export const ZONE_ORDER = ['bar', 'cuisine'];
// Anciennes zones (salle, sanitaires…) rangées avec le bar.
export const zoneOf = (z) => (z === 'cuisine' ? 'cuisine' : 'bar');

// Fréquences des tâches et « séances » correspondantes.
export const FREQS = {
  service: { label: 'Après chaque service', court: 'Après service' },
  jour: { label: 'Une fois par jour', court: 'Chaque jour' },
  approfondi: { label: 'Nettoyage approfondi (toutes les 2 semaines)', court: 'Approfondi' },
  exceptionnel: { label: 'Nettoyage exceptionnel (hotte, dégivrage…)', court: 'Exceptionnel' },
};
export const FREQ_ORDER = ['service', 'jour', 'approfondi', 'exceptionnel'];

// Avant 16h : service du midi, après : service du soir.
export const currentService = (d = new Date()) => (d.getHours() < 16 ? 'midi' : 'soir');

// Plan de départ : fiche « nettoyage approfondi » du bar + ajouts de la patronne + entretien quotidien.
export const SEED_TACHES = [
  { zone: 'bar', frequence: 'service', nom: 'Surfaces en contact avec les aliments', detail: 'Nettoyer et désinfecter.' },
  { zone: 'bar', frequence: 'service', nom: 'Matériel utilisé', detail: 'Laver, rincer, sécher et ranger.' },
  { zone: 'bar', frequence: 'service', nom: 'Points de contact', detail: 'Poignées, interrupteurs, tireuses, caisse.' },
  { zone: 'bar', frequence: 'service', nom: 'Poubelles', detail: 'Vider et remettre un sac.' },
  { zone: 'bar', frequence: 'service', nom: 'Sols', detail: 'Balayer et laver.' },
  { zone: 'bar', frequence: 'service', nom: 'Sanitaires', detail: 'Nettoyer, désinfecter, recharger papier et savon.' },
  { zone: 'bar', frequence: 'jour', nom: 'Rincer les citrons', detail: '' },
  { zone: 'bar', frequence: 'jour', nom: 'Désinfecter la menthe', detail: '5 minutes dans le vinaigre.' },
  { zone: 'bar', frequence: 'jour', nom: 'Machine à glaçons', detail: 'Nettoyer et désinfecter au vinaigre.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Bar et comptoirs', detail: 'Dégager les surfaces ; nettoyer dessus, rebords, façades et crédences.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Étagères du bar et porte-verres', detail: 'Retirer les objets ; nettoyer tablettes, supports et recoins ; sécher et ranger.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Évier, robinetterie et égouttoir', detail: 'Nettoyer bacs, bondes et pourtour ; retirer les dépôts et détartrer si nécessaire.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Meubles et rangements sous le bar', detail: 'Vider par zone ; nettoyer fonds, parois, portes et poignées ; trier puis ranger.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Appareils du bar', detail: 'Surfaces extérieures et dessous accessible : machine à café, blender, cuiseur à riz.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Réfrigérateur à boissons', detail: 'Clayettes, parois, joints, poignées et vitres ; vérifier les dates et ranger.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Congélateur coffre', detail: 'Couvercles vitrés, rails, joints et façades. Signaler le givre ; ne pas dégivrer sans accord.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Vitrine réfrigérée à garnitures', detail: 'Retirer les bacs ; nettoyer couvercle, supports, surfaces accessibles et extérieur ; sécher.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Buffet et zone libre-service', detail: 'Plans, porte-ustensiles, supports de vaisselle, façades et niches de rangement.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Étagères à ramen et présentoirs', detail: 'Retirer les paquets ; nettoyer chaque case ; vérifier les dates et remettre en ordre.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Poubelles et zone déchets', detail: 'Vider ; nettoyer et désinfecter intérieur, extérieur, couvercles et emplacement.' },
  { zone: 'bar', frequence: 'approfondi', nom: 'Sols, plinthes et recoins', detail: 'Déplacer les objets légers ; nettoyer sous les meubles, angles et plinthes ; laver le sol.' },
];

// ---------- Choix du jour (aujourd'hui / hier, ou n'importe quel jour pour la responsable) ----------
export function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return today(d); }
export function dateFromKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }

export function dayPickerHtml(day, isAdmin, future = false) {
  const t = today();
  const y = yesterday();
  const d = addDaysKey(t, 1);
  return `<div class="row" style="gap:8px;flex-wrap:wrap">
    <div class="segmented ${future ? 'seg3' : ''}" role="group" aria-label="Jour" style="width:${future ? 330 : 240}px;max-width:100%">
      <button type="button" data-day="${y}" class="${day === y ? 'on' : ''}" aria-pressed="${day === y}">Hier</button>
      <button type="button" data-day="${t}" class="${day === t ? 'on' : ''}" aria-pressed="${day === t}">Aujourd’hui</button>
      ${future ? `<button type="button" data-day="${d}" class="${day === d ? 'on' : ''}" aria-pressed="${day === d}">Demain</button>` : ''}
    </div>
    ${isAdmin ? `<input type="date" class="dateinput" data-daypick ${future ? '' : `max="${t}"`} value="${day}" aria-label="Choisir un autre jour">` : ''}
  </div>`;
}

export function pastDayBanner(day) {
  if (day === today()) return '';
  const txt = longDate(dateFromKey(day));
  return `<div class="warnbox">Vous complétez le <strong>${esc(txt)}</strong> (jour passé).</div>`;
}

// ---------- Réception marchandise ----------
// Températures maximales à la livraison (valeurs courantes du guide d'hygiène, modifiables plus tard).
export const CATEGORIES = {
  frais: { label: 'Frais', max: 4, aide: '4 °C maximum' },
  surgele: { label: 'Surgelé', max: -18, aide: '−18 °C ou moins' },
  sec: { label: 'Sec', max: null, aide: 'pas de température' },
};
export const CAT_ORDER = ['frais', 'surgele', 'sec'];

// Compresse une photo : côté max `maxSide` px, JPEG, et vise moins de `maxBytes`.
export async function compressImage(file, maxSide = 1600, maxBytes = 300 * 1024, q0 = 0.72) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let img = bmp;
  if (!img) {
    img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file);
    });
  }
  const w0 = img.width; const h0 = img.height;
  let side = maxSide; let q = q0; let blob;
  for (let tries = 0; tries < 6; tries += 1) {
    const r = Math.min(1, side / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * r); c.height = Math.round(h0 * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
    if (blob.size <= maxBytes) break;
    if (q > 0.5) q -= 0.1; else side = Math.round(side * 0.8);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export function bytesToUrl(bytes) {
  const u8 = bytes && typeof bytes.toUint8Array === 'function' ? bytes.toUint8Array() : bytes;
  return u8 ? URL.createObjectURL(new Blob([u8], { type: 'image/jpeg' })) : '';
}

// ---------- Documents ----------
export const DOC_CATS = {
  pms: { label: 'Plan de maîtrise sanitaire (PMS)', prive: false },
  fiches: { label: 'Fiches techniques des produits', prive: false },
  notices: { label: 'Notices des appareils', prive: false },
  agrement: { label: 'Agrément et autorisations', prive: false },
  formation: { label: 'Formations hygiène', prive: false },
  nuisibles: { label: 'Lutte contre les nuisibles', prive: false },
  controles: { label: 'Rapports de contrôle', prive: false },
  admin: { label: 'Papiers administratifs', prive: true },
  contrats: { label: 'Contrats de travail', prive: true },
  autre: { label: 'Autres documents', prive: false },
};
export const DOC_ORDER = ['pms', 'fiches', 'notices', 'agrement', 'formation', 'nuisibles', 'controles', 'admin', 'contrats', 'autre'];

export const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

// ---------- Dates (DLC) ----------
export function addDaysKey(key, n) { const d = dateFromKey(key); d.setDate(d.getDate() + n); return today(d); }
export function daysUntil(key) { return Math.round((dateFromKey(key) - dateFromKey(today())) / 86400000); }
