/**
 * The canonical language vocabulary for the whole system.
 * Every write path (API, CSV import, seed) funnels raw text through
 * normalizeLanguage() so that "Tamil", " TAM ", "tamizh" all collapse to `tamil`.
 * Matching is only meaningful if both sides speak the same code.
 */
export const LANGUAGES = [
  { code: 'english', label: 'English' },
  { code: 'hindi', label: 'Hindi' },
  { code: 'tamil', label: 'Tamil' },
  { code: 'telugu', label: 'Telugu' },
  { code: 'kannada', label: 'Kannada' },
  { code: 'malayalam', label: 'Malayalam' },
  { code: 'marathi', label: 'Marathi' },
  { code: 'bengali', label: 'Bengali' },
  { code: 'gujarati', label: 'Gujarati' },
  { code: 'punjabi', label: 'Punjabi' },
  { code: 'odia', label: 'Odia' },
  { code: 'urdu', label: 'Urdu' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

const LABEL_BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.label]));

const ALIASES = {
  eng: 'english', en: 'english',
  hin: 'hindi', hi: 'hindi', hindustani: 'hindi',
  tam: 'tamil', ta: 'tamil', tamizh: 'tamil', thamizh: 'tamil',
  tel: 'telugu', te: 'telugu',
  kan: 'kannada', kn: 'kannada', kannad: 'kannada',
  mal: 'malayalam', ml: 'malayalam', malayalm: 'malayalam',
  mar: 'marathi', mr: 'marathi',
  ben: 'bengali', bn: 'bengali', bangla: 'bengali',
  guj: 'gujarati', gu: 'gujarati',
  pun: 'punjabi', pa: 'punjabi', panjabi: 'punjabi',
  ori: 'odia', oriya: 'odia',
  urd: 'urdu', ur: 'urdu',
};

/** Raw text to canonical code, or null when we cannot place it. */
export function normalizeLanguage(raw) {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return null;
  if (LABEL_BY_CODE[key]) return key;
  return ALIASES[key] ?? null;
}

/**
 * Accepts an array, or a delimited string ("Tamil, English" / "tamil|english"),
 * and returns de-duplicated canonical codes in the order given. Order matters:
 * index 0 is treated as the person's primary language by the matcher.
 */
export function normalizeLanguages(input) {
  if (input == null) return [];
  const parts = Array.isArray(input) ? input : String(input).split(/[,;|/]+/);
  const out = [];
  for (const part of parts) {
    const code = normalizeLanguage(part);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export function languageLabel(code) {
  return LABEL_BY_CODE[code] ?? code;
}

export function labelList(codes = []) {
  return codes.map(languageLabel).join(', ');
}
