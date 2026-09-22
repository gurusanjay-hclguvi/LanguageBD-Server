import { normalizeLanguages } from './languages.js';

/**
 * Region to likely spoken languages, used ONLY when a lead arrives with no
 * declared language. This is a heuristic and the app always labels it as one:
 * an inferred language never carries the same confidence as a declared one.
 * Order matters - the first entry is treated as the likely primary language.
 */
export const STATE_LANGUAGES = {
  'tamil nadu': ['tamil', 'english'],
  puducherry: ['tamil', 'english'],
  karnataka: ['kannada', 'english', 'hindi'],
  kerala: ['malayalam', 'english'],
  telangana: ['telugu', 'hindi', 'urdu'],
  'andhra pradesh': ['telugu', 'english'],
  maharashtra: ['marathi', 'hindi', 'english'],
  goa: ['marathi', 'english'],
  'west bengal': ['bengali', 'hindi'],
  odisha: ['odia', 'hindi'],
  gujarat: ['gujarati', 'hindi'],
  punjab: ['punjabi', 'hindi'],
  chandigarh: ['punjabi', 'hindi', 'english'],
  haryana: ['hindi', 'punjabi'],
  delhi: ['hindi', 'english', 'punjabi'],
  'uttar pradesh': ['hindi', 'urdu'],
  uttarakhand: ['hindi'],
  'madhya pradesh': ['hindi'],
  bihar: ['hindi'],
  jharkhand: ['hindi'],
  chhattisgarh: ['hindi'],
  rajasthan: ['hindi'],
  'himachal pradesh': ['hindi'],
  'jammu and kashmir': ['urdu', 'hindi'],
  assam: ['bengali', 'hindi'],
};

const STATE_ALIASES = {
  tn: 'tamil nadu',
  ka: 'karnataka',
  kl: 'kerala',
  ts: 'telangana',
  tg: 'telangana',
  ap: 'andhra pradesh',
  mh: 'maharashtra',
  wb: 'west bengal',
  od: 'odisha',
  gj: 'gujarat',
  pb: 'punjab',
  hr: 'haryana',
  dl: 'delhi',
  'new delhi': 'delhi',
  ncr: 'delhi',
  up: 'uttar pradesh',
  mp: 'madhya pradesh',
  br: 'bihar',
  rj: 'rajasthan',
  hp: 'himachal pradesh',
  jk: 'jammu and kashmir',
  pondicherry: 'puducherry',
};

/** Cities common enough in lead forms that the state field is often left blank. */
export const CITY_TO_STATE = {
  chennai: 'tamil nadu',
  coimbatore: 'tamil nadu',
  madurai: 'tamil nadu',
  salem: 'tamil nadu',
  trichy: 'tamil nadu',
  tiruchirappalli: 'tamil nadu',
  erode: 'tamil nadu',
  bengaluru: 'karnataka',
  bangalore: 'karnataka',
  mysuru: 'karnataka',
  mysore: 'karnataka',
  mangaluru: 'karnataka',
  hubli: 'karnataka',
  kochi: 'kerala',
  cochin: 'kerala',
  thiruvananthapuram: 'kerala',
  trivandrum: 'kerala',
  kozhikode: 'kerala',
  thrissur: 'kerala',
  hyderabad: 'telangana',
  warangal: 'telangana',
  vijayawada: 'andhra pradesh',
  visakhapatnam: 'andhra pradesh',
  vizag: 'andhra pradesh',
  guntur: 'andhra pradesh',
  tirupati: 'andhra pradesh',
  mumbai: 'maharashtra',
  pune: 'maharashtra',
  nagpur: 'maharashtra',
  nashik: 'maharashtra',
  thane: 'maharashtra',
  kolkata: 'west bengal',
  howrah: 'west bengal',
  siliguri: 'west bengal',
  durgapur: 'west bengal',
  bhubaneswar: 'odisha',
  cuttack: 'odisha',
  rourkela: 'odisha',
  ahmedabad: 'gujarat',
  surat: 'gujarat',
  vadodara: 'gujarat',
  rajkot: 'gujarat',
  ludhiana: 'punjab',
  amritsar: 'punjab',
  jalandhar: 'punjab',
  gurugram: 'haryana',
  gurgaon: 'haryana',
  faridabad: 'haryana',
  noida: 'uttar pradesh',
  lucknow: 'uttar pradesh',
  kanpur: 'uttar pradesh',
  varanasi: 'uttar pradesh',
  agra: 'uttar pradesh',
  indore: 'madhya pradesh',
  bhopal: 'madhya pradesh',
  jabalpur: 'madhya pradesh',
  patna: 'bihar',
  ranchi: 'jharkhand',
  raipur: 'chhattisgarh',
  jaipur: 'rajasthan',
  jodhpur: 'rajasthan',
  udaipur: 'rajasthan',
  kota: 'rajasthan',
  dehradun: 'uttarakhand',
  shimla: 'himachal pradesh',
  guwahati: 'assam',
  delhi: 'delhi',
  'new delhi': 'delhi',
};

const clean = (raw) => (raw == null ? '' : String(raw).trim().toLowerCase().replace(/\s+/g, ' '));

export function normalizeState(raw) {
  const key = clean(raw);
  if (!key) return null;
  if (STATE_LANGUAGES[key]) return key;
  return STATE_ALIASES[key] ?? null;
}

export function stateForCity(raw) {
  const key = clean(raw);
  if (!key) return null;
  return CITY_TO_STATE[key] ?? null;
}

/**
 * Resolve a state (or a city that implies one) to its likely languages.
 * Returns the region it matched on so the UI can explain the guess.
 */
export function languagesForRegion({ state, city } = {}) {
  const resolved = normalizeState(state) ?? stateForCity(city);
  if (!resolved) return { region: null, languages: [] };
  return { region: resolved, languages: normalizeLanguages(STATE_LANGUAGES[resolved] ?? []) };
}

export function regionLabel(region) {
  if (!region) return null;
  return region.replace(/\b\w/g, (c) => c.toUpperCase());
}
