import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  createRun,
  processRun,
  runs,
  stored,
  eraseAll,
  purge
} from './pipeline.js';
import type { RawPage } from './types.js';
import { liveState, controlLive, recordSkip, observeFrame } from './live.js';
await mkdir('artifacts', { recursive: true });
// Retain the local pairing secret across starts so previously consented Chrome can resume.
let savedToken = '';
try { savedToken = (await readFile('artifacts/server-token.txt', 'utf8')).trim(); } catch {}
const token = process.env.POC_TOKEN || (/^[a-f0-9]{64}$/.test(savedToken) ? savedToken : randomBytes(32).toString('hex'));
const rawSchema = z
  .object({
    url: z.url().max(1500),
    title: z.string().max(180),
    domain: z.string().max(255),
    text: z.string().max(2000),
    jsonld: z.array(z.unknown()).max(20),
    meta: z.record(z.string().max(80), z.string().max(1000)),
    candidates: z.record(
      z.string().max(80),
      z.array(z.string().max(1000)).max(8)
    ),
    signals: z
      .object({
        password: z.boolean(),
        sensitive: z.boolean(),
        purchase: z.boolean(),
        price: z.boolean(),
        product: z.boolean()
      })
      .strict(),
    roi: z
      .object({
        left: z.number().min(0),
        top: z.number().min(0),
        width: z.number().positive().max(10000),
        height: z.number().positive().max(10000)
      })
      .nullable()
  })
  .strict();
const inputSchema = z
  .object({
    raw: rawSchema,
    image: z
      .string()
      .max(6_000_000)
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    capture_ms: z.number().min(0).max(60000).optional(),
    capture_error: z.string().max(100).optional()
  })
  .strict();
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/server-token.txt', token);
let busy = false;
let lastStart = 0;
const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"
  };
  if (
    origin === 'http://127.0.0.1:8787' ||
    /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
  )
    headers['Access-Control-Allow-Origin'] = origin;
  const send = (status: number, body: unknown) => {
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
  };
  if (host !== '127.0.0.1:8787') {
    send(403, { error: 'HOST_REJECTED' });
    return;
  }
  if (origin && !headers['Access-Control-Allow-Origin']) {
    send(403, { error: 'ORIGIN_REJECTED' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...headers,
      'Access-Control-Allow-Methods': 'GET,POST,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    res.end();
    return;
  }
  const assets: Record<string, [string, string]> = {
    '/live': ['src/live.html', 'text/html; charset=utf-8'],
    '/live.js': ['dist/live-ui.js', 'text/javascript; charset=utf-8'],
    '/demo': ['src/demo.html', 'text/html; charset=utf-8'],
    '/demo-objects.jpg': ['.tools/test-assets/objects.jpg', 'image/jpeg'],
  };
  if (req.method === 'GET' && req.url && assets[req.url]) {
    const [path, type] = assets[req.url];
    try { const data = await readFile(path); headers['Content-Type'] = type; res.writeHead(200, headers); res.end(data); }
    catch { send(404, { error: 'RUN_BUILD_AND_PREPARE_VISION' }); }
    return;
  }
  if (req.url === '/' && req.method === 'GET') {
    headers['Content-Type'] = 'text/html; charset=utf-8';
    res.writeHead(200, headers);
    res.end(await readFile('src/dashboard.html'));
    return;
  }
  if (req.url === '/dashboard.js' && req.method === 'GET') {
    headers['Content-Type'] = 'text/javascript';
    res.writeHead(200, headers);
    res.end(await readFile('src/dashboard.js'));
    return;
  }
  const provided = Buffer.from(
    (req.headers.authorization || '').replace(/^Bearer /, '')
  );
  const expectedToken = Buffer.from(token);
  if (
    provided.length !== expectedToken.length ||
    !timingSafeEqual(provided, expectedToken)
  ) {
    send(401, { error: 'AUTH_REQUIRED' });
    return;
  }
  purge();
  if (req.url === '/live/state' && req.method === 'GET') { send(200, liveState()); return; }
  if (['/live/control', '/live/skip', '/live/frame'].includes(req.url || '') && req.method === 'POST') {
    try {
      if (!req.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'JSON_REQUIRED' }); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (req.url === '/live/frame' ? 6_500_000 : 1024)) { send(413, { error: 'PAYLOAD_TOO_LARGE' }); return; }
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (req.url === '/live/control') send(200, controlLive(input));
      else if (req.url === '/live/skip') send(200, recordSkip(input));
      else { const result = await observeFrame(input); send(result.status, result.body); }
    } catch { if (!res.headersSent) send(400, { error: 'INVALID_LIVE_INPUT' }); }
    return;
  }
  if (req.url === '/health') {
    send(200, {
      ok: true,
      session_count: runs.size,
      storage_count: stored.size,
      memory_mb: process.memoryUsage().rss / 1048576
    });
    return;
  }
  if (req.url === '/runs' && req.method === 'GET') {
    send(200, [...runs.values()]);
    return;
  }
  if (req.url === '/metrics' && req.method === 'POST') {
    try {
      let data = '';
      for await (const chunk of req) {
        data += chunk.toString();
        if (data.length > 1024) {
          send(413, { error: 'PAYLOAD_TOO_LARGE' });
          return;
        }
      }
      const m = z
        .object({
          id: z.uuid(),
          render_ms: z.number().min(0).max(60000),
          client_total_ms: z.number().min(0).max(180000)
        })
        .strict()
        .parse(JSON.parse(data));
      const r = runs.get(m.id);
      if (!r) {
        send(404, { error: 'NOT_FOUND' });
        return;
      }
      r.timings.render_latency = m.render_ms;
      r.timings.client_total_latency = m.client_total_ms;
      send(200, { ok: true });
    } catch {
      send(400, { error: 'INVALID_METRICS' });
    }
    return;
  }
  if (req.url === '/runs' && req.method === 'DELETE') {
    if (busy) {
      send(409, { error: 'BUSY' });
      return;
    }
    eraseAll();
    send(200, { deleted: true });
    return;
  }
  if (req.url?.startsWith('/runs/') && req.method === 'GET') {
    const run = runs.get(req.url.slice(6));
    send(run ? 200 : 404, run || { error: 'NOT_FOUND' });
    return;
  }
  if (req.url === '/analyze' && req.method === 'POST') {
    if (busy || Date.now() - lastStart < 300) {
      send(429, { error: 'BUSY_OR_RATE_LIMIT' });
      return;
    }
    busy = true;
    try {
      if (!req.headers['content-type']?.startsWith('application/json')) {
        send(415, { error: 'JSON_REQUIRED' });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 6_500_000) {
          send(413, { error: 'PAYLOAD_TOO_LARGE' });
          return;
        }
        chunks.push(chunk);
      }
      const parsed = inputSchema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString('utf8'))
      );
      if (!parsed.success) {
        send(400, { error: 'INVALID_INPUT' });
        return;
      }
      lastStart = Date.now();
      const run = createRun(parsed.data.raw as RawPage);
      send(202, { session_id: run.session_id });
      await processRun(run, parsed.data);
      return;
    } catch {
      if (!res.headersSent) send(400, { error: 'INVALID_REQUEST' });
      return;
    } finally {
      busy = false;
    }
  }
  send(404, { error: 'NOT_FOUND' });
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(8787, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      stage: 'server',
      port: 8787,
      token_file: 'artifacts/server-token.txt',
      dashboard: 'http://127.0.0.1:8787',
      storage: 'RAM only'
    })
  )
);
const cleanup = setInterval(purge, 30000);
cleanup.unref();
process.on('SIGINT', () => {
  eraseAll();
  server.close();
  process.exit(0);
});
