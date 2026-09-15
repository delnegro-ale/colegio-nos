const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_PER_10_MINUTES = 120;
const ALLOWED_UNITS = new Set(['Barra', 'Pechincha', 'Recreio']);

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncPendingLeads(env));
    ctx.waitUntil(pruneOldRateLimits(env));
  }
};

export async function handleRequest(request, env, ctx = { waitUntil() {} }) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(origin, env.ALLOWED_ORIGINS || '');

  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS || '')) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403);
    }
    return new Response(null, { status: 204, headers: cors });
  }

  if (url.pathname === '/health' && request.method === 'GET') {
    return json({
      ok: true,
      service: 'colegio-nos-leads',
      sheetsConfigured: Boolean(env.SHEETS_WEBHOOK_URL && env.SHEETS_SYNC_SECRET)
    }, 200, cors);
  }

  if (url.pathname !== '/api/leads' || request.method !== 'POST') {
    return json({ ok: false, error: 'not_found' }, 404, cors);
  }

  if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS || '')) {
    return json({ ok: false, error: 'origin_not_allowed' }, 403);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'payload_too_large' }, 413, cors);
  }

  if (!(await allowRequest(request, env))) {
    return json({ ok: false, error: 'rate_limited' }, 429, cors);
  }

  let raw;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'payload_too_large' }, 413, cors);
    }
    raw = JSON.parse(body);
  } catch (_error) {
    return json({ ok: false, error: 'invalid_json' }, 400, cors);
  }

  // Honeypot: bots receive a neutral response, but nothing is persisted.
  if (cleanString(raw.company, 200)) {
    return json({ ok: true, persisted: false }, 200, cors);
  }

  const validation = normalizeLead(raw);
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400, cors);
  }

  const lead = validation.lead;
  const now = new Date().toISOString();
  const completedAt = lead.status === 'complete' ? now : null;

  const upsert = env.DB.prepare(`
    INSERT INTO leads (
      lead_id, status, name, email, phone, unit, grade,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      gclid, fbclid, page_url, referrer,
      created_at, updated_at, completed_at, sync_status, last_sync_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL)
    ON CONFLICT(lead_id) DO UPDATE SET
      status = CASE WHEN leads.status = 'complete' THEN 'complete' ELSE excluded.status END,
      name = CASE WHEN leads.status = 'complete' AND excluded.status = 'partial' THEN leads.name ELSE excluded.name END,
      email = CASE WHEN leads.status = 'complete' AND excluded.status = 'partial' THEN leads.email ELSE excluded.email END,
      phone = CASE WHEN leads.status = 'complete' AND excluded.status = 'partial' THEN leads.phone ELSE excluded.phone END,
      unit = CASE WHEN leads.status = 'complete' AND excluded.status = 'partial' THEN leads.unit ELSE excluded.unit END,
      grade = CASE WHEN leads.status = 'complete' AND excluded.status = 'partial' THEN leads.grade ELSE excluded.grade END,
      utm_source = CASE WHEN leads.utm_source = '' THEN excluded.utm_source ELSE leads.utm_source END,
      utm_medium = CASE WHEN leads.utm_medium = '' THEN excluded.utm_medium ELSE leads.utm_medium END,
      utm_campaign = CASE WHEN leads.utm_campaign = '' THEN excluded.utm_campaign ELSE leads.utm_campaign END,
      utm_content = CASE WHEN leads.utm_content = '' THEN excluded.utm_content ELSE leads.utm_content END,
      utm_term = CASE WHEN leads.utm_term = '' THEN excluded.utm_term ELSE leads.utm_term END,
      gclid = CASE WHEN leads.gclid = '' THEN excluded.gclid ELSE leads.gclid END,
      fbclid = CASE WHEN leads.fbclid = '' THEN excluded.fbclid ELSE leads.fbclid END,
      page_url = excluded.page_url,
      referrer = CASE WHEN leads.referrer = '' THEN excluded.referrer ELSE leads.referrer END,
      updated_at = excluded.updated_at,
      completed_at = COALESCE(leads.completed_at, excluded.completed_at),
      sync_status = 'pending',
      sync_attempts = 0,
      last_sync_error = NULL
  `).bind(
    lead.leadId, lead.status, lead.name, lead.email, lead.phone, lead.unit, lead.grade,
    lead.utmSource, lead.utmMedium, lead.utmCampaign, lead.utmContent, lead.utmTerm,
    lead.gclid, lead.fbclid, lead.pageUrl, lead.referrer,
    now, now, completedAt
  );

  const event = env.DB.prepare(`
    INSERT INTO lead_events (lead_id, event_type, status, received_at)
    VALUES (?, ?, ?, ?)
  `).bind(lead.leadId, lead.eventType, lead.status, now);

  const statements = [upsert, event];
  if (lead.status === 'complete') {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO lead_conversions (lead_id, created_at)
      VALUES (?, ?)
    `).bind(lead.leadId, now));
  }

  const results = await env.DB.batch(statements);
  const firstCompletion = lead.status === 'complete'
    ? Number(results[2]?.meta?.changes || 0) === 1
    : false;

  ctx.waitUntil(syncLeadById(env, lead.leadId));

  return json({
    ok: true,
    persisted: true,
    leadId: lead.leadId,
    status: lead.status,
    conversionId: lead.leadId,
    firstCompletion
  }, 200, cors);
}

export function normalizeLead(raw = {}) {
  const lead = {
    leadId: cleanString(raw.leadId || raw.id, 80),
    status: cleanString(raw.status, 20),
    eventType: cleanString(raw.eventType, 40) || 'field_update',
    name: cleanString(raw.name || raw.nome, 160),
    email: cleanString(raw.email, 254).toLowerCase(),
    phone: cleanString(raw.phone || raw.tel, 40),
    unit: cleanString(raw.unit || raw.unidade, 40),
    grade: cleanString(raw.grade || raw.serie, 100),
    utmSource: cleanString(raw.utmSource || raw.utm_source, 120),
    utmMedium: cleanString(raw.utmMedium || raw.utm_medium, 120),
    utmCampaign: cleanString(raw.utmCampaign || raw.utm_campaign, 200),
    utmContent: cleanString(raw.utmContent || raw.utm_content, 200),
    utmTerm: cleanString(raw.utmTerm || raw.utm_term, 200),
    gclid: cleanString(raw.gclid, 300),
    fbclid: cleanString(raw.fbclid, 300),
    pageUrl: cleanString(raw.pageUrl || raw.pagina, 1000),
    referrer: cleanString(raw.referrer, 1000)
  };

  if (!/^[A-Za-z0-9_-]{8,80}$/.test(lead.leadId)) {
    return { ok: false, error: 'invalid_lead_id' };
  }
  if (!['partial', 'complete'].includes(lead.status)) {
    return { ok: false, error: 'invalid_status' };
  }
  if (!lead.name && !lead.email && !lead.phone && !lead.unit && !lead.grade) {
    return { ok: false, error: 'empty_lead' };
  }
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (lead.unit && !ALLOWED_UNITS.has(lead.unit)) {
    return { ok: false, error: 'invalid_unit' };
  }
  if (lead.status === 'complete') {
    if (!lead.name || !lead.email || !lead.phone || !lead.unit) {
      return { ok: false, error: 'missing_required_fields' };
    }
    const phoneDigits = lead.phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      return { ok: false, error: 'invalid_phone' };
    }
  }

  return { ok: true, lead };
}

export function sheetPayload(lead, secret) {
  return {
    syncSecret: secret,
    id: lead.lead_id,
    status: lead.status === 'complete' ? 'completo' : 'parcial',
    nome: lead.name,
    email: lead.email,
    tel: lead.phone,
    unidade: lead.unit,
    serie: lead.grade,
    primeiro_registro: lead.created_at,
    ultima_atualizacao: lead.updated_at,
    concluido_em: lead.completed_at || '',
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_content: lead.utm_content,
    utm_term: lead.utm_term,
    gclid: lead.gclid,
    fbclid: lead.fbclid,
    pagina: lead.page_url,
    referencia: lead.referrer
  };
}

async function syncLeadById(env, leadId) {
  if (!env.SHEETS_WEBHOOK_URL || !env.SHEETS_SYNC_SECRET) return;
  const lead = await env.DB.prepare('SELECT * FROM leads WHERE lead_id = ?')
    .bind(leadId).first();
  if (!lead) return;
  await syncOneLead(env, lead);
}

async function syncPendingLeads(env) {
  if (!env.SHEETS_WEBHOOK_URL || !env.SHEETS_SYNC_SECRET) return;
  const result = await env.DB.prepare(`
    SELECT * FROM leads
    WHERE sync_status IN ('pending', 'failed')
      AND sync_attempts < 20
    ORDER BY updated_at ASC
    LIMIT 50
  `).all();

  for (const lead of result.results || []) {
    await syncOneLead(env, lead);
  }
}

async function syncOneLead(env, lead) {
  const version = lead.updated_at;
  try {
    const response = await fetch(env.SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(sheetPayload(lead, env.SHEETS_SYNC_SECRET))
    });
    if (!response.ok) throw new Error(`sheets_http_${response.status}`);
    const result = await response.json();
    if (!result || result.ok !== true) {
      throw new Error(`sheets_rejected_${cleanString(result?.error || 'unknown', 120)}`);
    }

    await env.DB.prepare(`
      UPDATE leads
      SET sync_status = 'synced', sheet_synced_at = ?, last_sync_error = NULL
      WHERE lead_id = ? AND updated_at = ?
    `).bind(new Date().toISOString(), lead.lead_id, version).run();
  } catch (error) {
    await env.DB.prepare(`
      UPDATE leads
      SET sync_status = 'failed',
          sync_attempts = sync_attempts + 1,
          last_sync_error = ?
      WHERE lead_id = ? AND updated_at = ?
    `).bind(cleanString(error?.message || 'sync_failed', 300), lead.lead_id, version).run();
  }
}

async function allowRequest(request, env) {
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bucket = Math.floor(Date.now() / 600000);
  const material = `${env.RATE_LIMIT_SALT || 'colegio-nos'}:${address}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const keyHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');

  const row = await env.DB.prepare(`
    INSERT INTO request_limits (key_hash, bucket, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(key_hash, bucket)
    DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(keyHash, bucket).first();

  return Number(row?.request_count || 1) <= RATE_LIMIT_PER_10_MINUTES;
}

async function pruneOldRateLimits(env) {
  const oldestBucket = Math.floor(Date.now() / 600000) - 12;
  await env.DB.prepare('DELETE FROM request_limits WHERE bucket < ?')
    .bind(oldestBucket).run();
}

function allowedOrigins(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, configured) {
  return Boolean(origin) && allowedOrigins(configured).includes(origin);
}

function corsHeaders(origin, configured) {
  if (!isAllowedOrigin(origin, configured)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}
