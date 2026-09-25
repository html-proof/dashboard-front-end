// Vercel build step: writes config.js. API calls go same-origin to /api/* (proxied to the backend by
// api/[...path].js); BACKEND_URL is only exposed for browser redirects such as Shopify OAuth.
import { writeFileSync } from 'node:fs';

const backend = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
writeFileSync('config.js', `window.API_BASE = "";\nwindow.BACKEND_URL = ${JSON.stringify(backend)};\n`);
console.log(`config.js written: BACKEND_URL=${backend || '(same origin)'}`);
