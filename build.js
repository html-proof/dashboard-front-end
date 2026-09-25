// Vercel build step: writes config.js from the BACKEND_URL environment variable
// (e.g. https://dashboard-backend-production-e2fe.up.railway.app). Unset = same-origin API.
import { writeFileSync } from 'node:fs';

const backend = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
writeFileSync('config.js', `window.API_BASE = ${JSON.stringify(backend)};\n`);
console.log(`config.js written: API_BASE=${backend || '(same origin)'}`);
