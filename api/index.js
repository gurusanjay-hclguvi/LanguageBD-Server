/**
 * Vercel serverless entry point for the API deployment.
 *
 * This project is deployed on its own, with the repository's `server/` folder
 * as the Vercel root directory. Vercel treats every file in this `api/` folder
 * as a function, and an Express app is already a `(req, res)` handler, so
 * exporting it is all that is needed - no adapter library.
 *
 * `vercel.json` sends every path here, and the incoming URL keeps its original
 * path, which is what the app's `/api/...` routes expect.
 *
 * The app never calls `listen()`; the database connection is opened lazily and
 * cached across warm invocations in `src/db.js`.
 */
export { default } from '../src/app.js';
