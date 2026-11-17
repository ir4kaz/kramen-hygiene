// Petits outils partagés.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const PATHS = {
  thermo: '<path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
  clean: '<path d="M3 21h18"/><path d="M7 21V11h10v10"/><path d="M9 11V5l6-2v8"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  history: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  admin: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  cloudoff: '<path d="M3 3l18 18"/><path d="M8 8a5 5 0 0 0-1 9.9h10"/><path d="M17.5 17.5A4 4 0 0 0 16 10h-1.3A6 6 0 0 0 10 6.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
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
