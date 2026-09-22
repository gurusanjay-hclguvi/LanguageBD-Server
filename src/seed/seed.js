import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db.js';
import { BD } from '../models/BD.js';
import { Lead } from '../models/Lead.js';
import { CallLog } from '../models/CallLog.js';
import { runAssignment } from '../services/routing.js';
import { LANGUAGE_CODES } from '../data/languages.js';

/**
 * Deterministic demo data.
 *
 * Shaped on purpose so the app tells its story the moment it opens:
 *   - the team has NO Bengali and NO Odia speaker, so Kolkata/Bhubaneswar
 *     leads land in the coverage-gap bucket instead of being mis-routed;
 *   - about a third of leads declare no language, exercising region inference;
 *   - two weeks of call history show a high language-barrier rate BEFORE
 *     routing was switched on and a low one after, so the analytics
 *     before-and-after is measured data rather than a guess;
 *   - a final batch of leads is left unrouted so the demo can press
 *     "Run routing" and watch the engine work.
 */

// Small deterministic PRNG so every seed run produces the same demo.
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260922);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

const BDS = [
  {
    name: 'Priya Raman', email: 'priya.raman@guvi.in', phone: '9840012001',
    region: 'tamil nadu', dailyCapacity: 14,
    languages: [{ code: 'tamil', proficiency: 'native' }, { code: 'english', proficiency: 'fluent' }],
  },
  {
    name: 'Karthik Subramanian', email: 'karthik.s@guvi.in', phone: '9840012002',
    region: 'tamil nadu', dailyCapacity: 12,
    languages: [
      { code: 'tamil', proficiency: 'native' },
      { code: 'telugu', proficiency: 'basic' },
      { code: 'english', proficiency: 'basic' },
    ],
  },
  {
    name: 'Aarti Deshpande', email: 'aarti.d@guvi.in', phone: '9840012003',
    region: 'maharashtra', dailyCapacity: 14,
    languages: [
      { code: 'marathi', proficiency: 'native' },
      { code: 'hindi', proficiency: 'fluent' },
      { code: 'english', proficiency: 'fluent' },
    ],
  },
  {
    name: 'Rahul Verma', email: 'rahul.v@guvi.in', phone: '9840012004',
    region: 'delhi', dailyCapacity: 16,
    languages: [
      { code: 'hindi', proficiency: 'native' },
      { code: 'english', proficiency: 'fluent' },
      { code: 'punjabi', proficiency: 'basic' },
    ],
  },
  {
    name: 'Sneha Reddy', email: 'sneha.r@guvi.in', phone: '9840012005',
    region: 'telangana', dailyCapacity: 13,
    languages: [
      { code: 'telugu', proficiency: 'native' },
      { code: 'hindi', proficiency: 'fluent' },
      { code: 'english', proficiency: 'fluent' },
    ],
  },
  {
    name: 'Nikhil Shetty', email: 'nikhil.s@guvi.in', phone: '9840012006',
    region: 'karnataka', dailyCapacity: 12,
    languages: [{ code: 'kannada', proficiency: 'native' }, { code: 'english', proficiency: 'fluent' }],
  },
  {
    name: 'Anjali Nair', email: 'anjali.n@guvi.in', phone: '9840012007',
    region: 'kerala', dailyCapacity: 12,
    languages: [
      { code: 'malayalam', proficiency: 'native' },
      { code: 'tamil', proficiency: 'basic' },
      { code: 'english', proficiency: 'fluent' },
    ],
  },
  {
    name: 'Meera Patel', email: 'meera.p@guvi.in', phone: '9840012008',
    region: 'gujarat', dailyCapacity: 11,
    languages: [{ code: 'gujarati', proficiency: 'native' }, { code: 'hindi', proficiency: 'fluent' }],
  },
  {
    name: 'Imran Qureshi', email: 'imran.q@guvi.in', phone: '9840012009',
    region: 'uttar pradesh', dailyCapacity: 13,
    languages: [
      { code: 'urdu', proficiency: 'native' },
      { code: 'hindi', proficiency: 'native' },
      { code: 'english', proficiency: 'basic' },
    ],
  },
  {
    name: 'Joseph Mathew', email: 'joseph.m@guvi.in', phone: '9840012010',
    region: 'karnataka', dailyCapacity: 15,
    languages: [{ code: 'english', proficiency: 'native' }, { code: 'malayalam', proficiency: 'fluent' }],
  },
  // Deliberately absent from this roster: Bengali and Odia speakers.
];

const PLACES = [
  { city: 'Chennai', state: 'Tamil Nadu', langs: ['tamil'], weight: 9 },
  { city: 'Coimbatore', state: 'Tamil Nadu', langs: ['tamil'], weight: 5 },
  { city: 'Madurai', state: 'Tamil Nadu', langs: ['tamil'], weight: 3 },
  { city: 'Bengaluru', state: 'Karnataka', langs: ['kannada', 'english'], weight: 8 },
  { city: 'Mysuru', state: 'Karnataka', langs: ['kannada'], weight: 3 },
  { city: 'Hyderabad', state: 'Telangana', langs: ['telugu'], weight: 7 },
  { city: 'Vijayawada', state: 'Andhra Pradesh', langs: ['telugu'], weight: 3 },
  { city: 'Kochi', state: 'Kerala', langs: ['malayalam'], weight: 4 },
  { city: 'Thiruvananthapuram', state: 'Kerala', langs: ['malayalam'], weight: 3 },
  { city: 'Mumbai', state: 'Maharashtra', langs: ['marathi', 'hindi'], weight: 7 },
  { city: 'Pune', state: 'Maharashtra', langs: ['marathi'], weight: 5 },
  { city: 'Delhi', state: 'Delhi', langs: ['hindi'], weight: 6 },
  { city: 'Noida', state: 'Uttar Pradesh', langs: ['hindi'], weight: 4 },
  { city: 'Lucknow', state: 'Uttar Pradesh', langs: ['hindi', 'urdu'], weight: 3 },
  { city: 'Jaipur', state: 'Rajasthan', langs: ['hindi'], weight: 3 },
  { city: 'Ahmedabad', state: 'Gujarat', langs: ['gujarati'], weight: 4 },
  { city: 'Surat', state: 'Gujarat', langs: ['gujarati'], weight: 3 },
  { city: 'Ludhiana', state: 'Punjab', langs: ['punjabi'], weight: 3 },
  // The uncovered corner of the map:
  { city: 'Kolkata', state: 'West Bengal', langs: ['bengali'], weight: 7 },
  { city: 'Howrah', state: 'West Bengal', langs: ['bengali'], weight: 3 },
  { city: 'Bhubaneswar', state: 'Odisha', langs: ['odia'], weight: 4 },
  { city: 'Cuttack', state: 'Odisha', langs: ['odia'], weight: 2 },
];

const WEIGHTED_PLACES = PLACES.flatMap((p) => Array(p.weight).fill(p));

const FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Sneha', 'Arjun',
  'Meghna', 'Harish', 'Lakshmi', 'Nandini', 'Pranav', 'Rithika', 'Sandeep', 'Swathi', 'Varun', 'Yamini',
  'Farhan', 'Zoya', 'Gaurav', 'Neha', 'Manish', 'Pooja', 'Suresh', 'Tanvi', 'Ajay', 'Bhavna',
  'Deepak', 'Elakkiya', 'Girish', 'Hina', 'Jayanth', 'Keerthi', 'Mohit', 'Nitya', 'Omkar', 'Preethi',
];
const LAST = [
  'Sharma', 'Iyer', 'Reddy', 'Nair', 'Patel', 'Das', 'Banerjee', 'Kulkarni', 'Gowda', 'Menon',
  'Rao', 'Singh', 'Shah', 'Mishra', 'Pillai', 'Chatterjee', 'Joshi', 'Mahapatra', 'Sundaram', 'Khan',
];
const COURSES = [
  'Full Stack Development', 'Data Science', 'AI and Machine Learning', 'Cloud and DevOps',
  'Java Programming', 'Python for Beginners', 'Digital Marketing', 'UI UX Design',
];
const SOURCES = ['web', 'webinar', 'referral', 'campaign', 'walk-in'];

let nameCounter = 0;
function makeName() {
  nameCounter += 1;
  return pick(FIRST) + ' ' + LAST[(nameCounter * 7) % LAST.length];
}

/**
 * Build one lead. Three language provenances, mirroring real form data:
 * about 55% declare a language, 30% leave it blank (region inference kicks
 * in), and 15% leave both language and state blank (the unknown case).
 */
function makeLead(i) {
  const place = pick(WEIGHTED_PLACES);
  const roll = rand();
  const base = {
    name: makeName(),
    phone: '98' + String(10000000 + Math.floor(rand() * 89999999)),
    email: 'learner' + i + '@example.com',
    course: pick(COURSES),
    source: pick(SOURCES),
  };

  if (roll < 0.55) {
    // Declared. Most declare their regional language; some add English, and a
    // few declare only English or Hindi regardless of where they live.
    // Bengali and Odia speakers here mostly declare only their mother tongue,
    // which is exactly what exposes the hole in the BD roster.
    const motherTongueOnly = ['bengali', 'odia'].includes(place.langs[0]);
    let langs = [...place.langs];
    if (!motherTongueOnly && chance(0.35)) langs.push('english');
    if (!motherTongueOnly) {
      if (chance(0.12)) langs = ['english'];
      else if (chance(0.1)) langs = ['hindi'];
    }
    return { ...base, city: place.city, state: place.state, preferredLanguages: langs };
  }

  if (roll < 0.85) {
    // Blank language, region present, so inference does the work.
    return { ...base, city: place.city, state: place.state, preferredLanguages: [] };
  }

  // Blank language AND blank state. The city sometimes rescues it via the
  // city-to-state table; sometimes there is nothing to go on at all.
  return {
    ...base,
    city: chance(0.5) ? place.city : '',
    state: '',
    preferredLanguages: [],
  };
}

const daysAgo = (d, hour = 11) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(hour, Math.floor(rand() * 59), 0, 0);
  return date;
};

async function seed() {
  await connectDB();

  await Promise.all([BD.deleteMany({}), Lead.deleteMany({}), CallLog.deleteMany({})]);
  console.log('[seed] cleared existing collections');

  const bds = await BD.create(BDS);
  console.log('[seed] inserted ' + bds.length + ' BDs (no Bengali/Odia speaker - that gap is intentional)');

  // --- historical leads, routed, with two weeks of call history ------------
  const historical = [];
  for (let i = 1; i <= 58; i += 1) historical.push(makeLead(i));
  const historicalDocs = await Lead.create(historical);
  // Backdate them so the call history that follows makes chronological sense.
  await Promise.all(
    historicalDocs.map((doc, i) =>
      Lead.updateOne(
        { _id: doc._id },
        { $set: { createdAt: daysAgo(14 - Math.floor(i / 5)) } },
        { timestamps: false },
      ),
    ),
  );
  console.log('[seed] inserted ' + historicalDocs.length + ' historical leads');

  const routing = await runAssignment();
  console.log('[seed] routed: ' + routing.assigned + ' assigned, ' + routing.unroutable + ' unroutable', routing.gaps);

  // --- call history --------------------------------------------------------
  // Before routing existed (days 14-8) callers hit the language wall often.
  // After it was switched on (days 7-0) that rate collapses. Both halves are
  // real CallLog rows, so the analytics page reports measured history.
  const assigned = await Lead.find({ status: 'assigned' }).lean();
  const calls = [];
  const contacted = [];
  const barriers = [];

  assigned.forEach((lead, i) => {
    if (i % 5 === 4) return; // leave some leads not yet called
    const day = 14 - Math.floor((i / assigned.length) * 14);
    const preRouting = day > 7;
    const barrier = preRouting ? chance(0.34) : chance(0.05);

    let outcome;
    if (barrier) outcome = 'language_barrier';
    else if (chance(0.18)) outcome = 'converted';
    else if (chance(0.25)) outcome = 'no_answer';
    else if (chance(0.2)) outcome = 'not_interested';
    else outcome = 'connected';

    /*
     * A barrier call is where the BD learns what the learner really speaks.
     * Most of the time that matches what we had on file; sometimes it does not,
     * and those are the rows that make the inference-accuracy report worth
     * reading rather than a flat 100%.
     */
    let observed = [];
    if (outcome === 'language_barrier') {
      const onFile = lead.preferredLanguages?.[0] ?? lead.inferredLanguages?.[0] ?? 'english';
      // A third of the time the learner turns out to speak something the region
      // guess never listed. Those are the rows that make inference accuracy a
      // real measurement instead of a guaranteed 100%.
      const outside = LANGUAGE_CODES.filter((c) => !(lead.inferredLanguages ?? []).includes(c));
      observed = chance(0.35) && outside.length ? [pick(outside)] : [onFile];
    }

    const when = daysAgo(day, 10 + (i % 8));
    calls.push({
      lead: lead._id,
      bd: lead.assignedBD,
      outcome,
      observedLanguages: observed,
      durationSec: outcome === 'no_answer' ? 0 : 60 + Math.floor(rand() * 540),
      notes:
        outcome === 'language_barrier'
          ? 'Learner could not follow the call - language mismatch, call ended early'
          : '',
      createdAt: when,
      updatedAt: when,
    });

    if (outcome === 'language_barrier') {
      // Mirror what the live handler does: record the confirmed language and the
      // BD who failed, and put the lead back in the pool for re-routing.
      barriers.push({
        leadId: lead._id,
        bdId: lead.assignedBD,
        observed,
        when,
      });
    } else {
      contacted.push(lead._id);
    }
  });

  await CallLog.insertMany(calls, { timestamps: false });
  await Lead.updateMany({ _id: { $in: contacted } }, { $set: { status: 'contacted' } });

  await Promise.all(
    barriers.map((b) =>
      Lead.updateOne(
        { _id: b.leadId },
        {
          $set: {
            confirmedLanguages: b.observed,
            languageSource: 'confirmed',
            languageConfidence: 1,
            languageBasis: 'Confirmed on a call, ' + b.when.toISOString().slice(0, 10),
            status: 'new',
            assignedBD: null,
            matchScore: null,
            matchReasons: [],
            assignmentMode: null,
            unroutableReason: 'Returned to the pool after a language-barrier call',
            failedBDs: [{ bd: b.bdId, at: b.when, reason: 'Language barrier' }],
          },
        },
        { timestamps: false },
      ),
    ),
  );

  const barrierCount = calls.filter((c) => c.outcome === 'language_barrier').length;
  console.log('[seed] logged ' + calls.length + ' calls (' + barrierCount + ' language barriers)');
  console.log('[seed] ' + barriers.length + ' leads carry a confirmed language + a failed BD');

  // --- a fresh unrouted batch, so the demo has something to route ----------
  const fresh = [];
  for (let i = 59; i <= 74; i += 1) fresh.push(makeLead(i));
  const freshDocs = await Lead.create(fresh);
  console.log('[seed] inserted ' + freshDocs.length + ' fresh leads left unrouted for the demo');

  const summary = await Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log('[seed] final lead status:', Object.fromEntries(summary.map((s) => [s._id, s.count])));

  await mongoose.disconnect();
  console.log('[seed] done');
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
