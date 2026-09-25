// Vercel server function: forwards /api/* to the Railway backend and adds DASHBOARD_API_KEY
// server-side, so the key never reaches the browser and no CORS is needed.
// Env (Vercel project settings): BACKEND_URL, DASHBOARD_API_KEY.
const backend = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.DASHBOARD_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');

async function proxy(request) {
  if (!backend) return Response.json({ error: 'BACKEND_URL is not set in Vercel.' }, { status: 500 });
  if (!key) return Response.json({ error: 'DASHBOARD_API_KEY is not set in Vercel (Settings > Environment Variables), then redeploy.' }, { status: 500 });
  // vercel.json rewrites /api/<rest> to /api/proxy?__path=<rest>; rebuild the original path + query.
  const url = new URL(request.url);
  const rest = url.searchParams.get('__path') || '';
  url.searchParams.delete('__path');
  url.pathname = `/api/${rest}`;
  const headers = { accept: 'application/json' };
  const type = request.headers.get('content-type');
  if (type) headers['content-type'] = type;
  if (key) headers.authorization = `Bearer ${key}`;
  const init = { method: request.method, headers };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
  try {
    const upstream = await fetch(backend + url.pathname + url.search, init);
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: `Backend unreachable: ${error.message}` }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
