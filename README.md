# LinguaRoute — API

The routing service behind LinguaRoute: it decides **which BD should call which
learner, based on the languages they actually share.**

Leads (learners) come in from every corner of India. Business Development
associates call them to convert. When the two have no language in common the call
is dead before it starts: BD minutes burnt, a bad first impression for the
learner, and a lost conversion. This service makes language a first-class routing
input instead of an afterthought.

Express + Mongoose + MongoDB, deployed as a Vercel serverless function. The
interface is a separate repository and a separate deployment.

---

## What it does

1. **Works out what a learner speaks.** A language declared on the form is
   treated as fact. When it is blank, the learner's state or city is used to
   infer the likely languages — and the response always says which of the two it
   was, so the client can never present a guess as a fact.

2. **Scores every BD against every lead.** A shared language is a hard gate: no
   common language means the BD is ineligible, full stop. Past that gate the
   score rewards proficiency, matching the learner's *primary* language, a
   declared language over an inferred one, spare capacity, and the same region.

3. **Refuses to make the bad call.** A lead nobody can speak to is not force-fit
   onto the nearest free BD. It is held as `unroutable` with the language
   recorded as a **coverage gap** — which turns a silent waste into a hiring
   signal.

4. **Shows its working.** `/api/leads/:id/matches` returns the whole team scored
   and sorted, with a human-readable reason for every point awarded, including
   why the BDs that were ruled out were ruled out.

5. **Measures itself.** `language_barrier` is a first-class call outcome. Logging
   one returns the lead to the pool for re-routing and moves the numbers on
   `/api/analytics/summary`.

## How the score is built

| Component | Max | Rule |
|---|---:|---|
| Shared language | 60 | scaled by proficiency — native 1.0, fluent 0.85, basic 0.6 |
| Primary-language match | 15 | the shared language is the learner's first-listed |
| Language confidence | 10 | declared = 1.0, inferred = 0.6, unknown = 0 |
| Spare capacity | 10 | scales with the BD's remaining headroom for the day |
| Same region | 5 | lead state matches BD region |

A BD is **ineligible** — not merely low-scoring — when they share no language,
are at capacity, or are marked inactive.

Assignment runs greedily with **declared-language leads first**, so the certain
cases win the scarce specialist BDs and the guesses take what is left.

## Running it locally

Needs Node 18+ and MongoDB — either a local `mongod` or an Atlas cluster.

```bash
cp .env.example .env     # set MONGODB_URI
npm install
npm run seed             # load the demo data (drops and recreates collections)
npm run dev              # http://localhost:4000
```

`npm run dev` uses `node --watch`, so edits restart the server.

The demo data is shaped to tell a story: the seeded BD roster deliberately has
**no Bengali or Odia speaker**, so those leads land in the coverage-gap bucket on
the first run. Roughly a third of leads declare no language, which exercises the
region inference, and two weeks of call history show a high language-barrier rate
before routing was switched on and a low one after.

## API

| Method | Route | |
|---|---|---|
| GET | `/api/health` | liveness + Mongo connection state |
| GET | `/api/meta` | languages, states, outcomes for the UI |
| GET POST | `/api/bds` · PATCH DELETE `/api/bds/:id` | BD roster |
| GET POST | `/api/leads` | list (filterable) and create |
| POST | `/api/leads/import` | CSV upload; per-row errors, never a failed batch |
| GET | `/api/leads/template.csv` | a blank import template |
| GET | `/api/leads/:id/matches` | the whole team ranked, with reasons |
| POST | `/api/leads/:id/assign` | manual override; flags a language mismatch |
| POST | `/api/assignments/run` | route every waiting lead |
| GET | `/api/queue/:bdId` | one BD's queue, with the language to open in |
| POST | `/api/calls` | log a call outcome |
| GET | `/api/analytics/summary` | every number the dashboard needs, in one payload |

## Layout

```
api/index.js                serverless entry - exports the Express app
public/index.html           landing page for the API host
vercel.json                 routes every /api/* path to the function
src/
├─ app.js                   the Express app, with no listen()
├─ index.js                 local dev server (listen + connect)
├─ db.js                    connection cached across warm invocations
├─ data/languages.js        canonical language codes + messy-input normaliser
├─ data/regionLanguages.js  state/city -> likely languages (the inference table)
├─ services/languageInference.js  declared vs inferred vs unknown, with confidence
├─ services/matcher.js      scoring + the eligibility gate + greedy assignment
├─ services/routing.js      the DB-facing routing operations
├─ services/analytics.js    every dashboard number, in one payload
├─ routes/                  bds, leads, import, assignments, calls, queue, analytics
└─ seed/seed.js             deterministic demo data
```

`app.js` exports the Express app without calling `listen()`. That is what lets
the same app run two ways: `index.js` starts a real server for local
development, and `api/index.js` hands the app straight to Vercel.

## Deploying to Vercel

| Setting | Value |
|---|---|
| Root Directory | repository root (this folder) |
| Framework preset | Other |
| Environment variables | `MONGODB_URI`, and `CORS_ORIGIN` once the client exists |

`vercel.json` rewrites every `/api/*` path to the single function in
`api/index.js`. The project root serves a small page listing the endpoints.

Deploy this **before** the client — the client bakes this service's URL into its
bundle at build time.

**MongoDB Atlas is required in production.** A serverless function cannot reach a
database on your laptop, and it has no fixed outbound IP, so *Network Access*
must allow `0.0.0.0/0`.

Check `https://<your-api>.vercel.app/api/health` returns
`{"ok":true,"db":"connected"}`.

> **Turn Deployment Protection off.** By default Vercel may protect deployments
> with Vercel Authentication, which answers *every* request — including
> `/api/health` — with a `302` to `vercel.com/sso-api` instead of reaching this
> code. A browser fetch then fails with an opaque `NetworkError`. Fix it under
> **Settings → Deployment Protection → Vercel Authentication → Disabled**.
> Verify with curl, which shows the redirect plainly:
>
> ```bash
> curl -i https://<your-api>.vercel.app/api/health | head -5
> # 302 + "Location: https://vercel.com/sso-api?..."  => still protected
> # 200 + {"ok":true,...}                             => good
> ```

Use the project's **production domain**, not the long per-deployment URL that
contains a build hash (`<project>-<hash>-<scope>.vercel.app`). That hashed URL
changes with every deployment, so anything pointed at it breaks on your next
deploy.

### CORS

`CORS_ORIGIN` is a comma-separated allowlist of origins permitted to call this
API from a browser. Set it to the deployed client URL:

```
CORS_ORIGIN=https://<your-client>.vercel.app
```

Left unset, any origin is accepted — convenient while wiring things up, worth
tightening afterwards. Vercel preview deployments get their own domains, so add
them to the list or leave the variable unset for previews.

### Seeding production

There is no seed step in the build. Run it from your machine against Atlas:

```bash
MONGODB_URI="<your-atlas-uri>" npm run seed
```

This **drops and recreates** the leads, BDs and call log, so only run it against
a database you are happy to reset.

## Honest limits

This is an MVP built to demonstrate the routing idea, not a production service:

- **There is no authentication.** The client sends an `x-role` header and this
  service trusts it. Anyone who can reach the deployed API can read and change
  everything in it. A real deployment replaces this with a session or JWT.
- **Region inference is a heuristic**, and a coarse one — a lookup table of
  states and major cities. It is reported as a low-confidence guess for exactly
  that reason, never as fact.
- **"Wasted calls avoided" is a model**, not a measurement. It assumes
  round-robin assignment as the baseline, and the response carries the measured
  barrier rate alongside it so the two are never confused.
- **CSV uploads are capped at 4 MB**, just under Vercel's 4.5 MB limit on a
  serverless request body.
- Assignment is greedy rather than globally optimal, and capacity is a simple
  daily count with no working-hours or timezone logic.
- Never log `MONGODB_URI` directly — it carries a password. Use `redactUri()`
  from `src/db.js`.
