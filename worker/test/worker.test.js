import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLead, sheetPayload } from '../src/index.js';

test('accepts an incomplete lead after the first typed field', () => {
  const result = normalizeLead({
    leadId: 'lead_12345678',
    status: 'partial',
    nome: 'Maria'
  });

  assert.equal(result.ok, true);
  assert.equal(result.lead.name, 'Maria');
  assert.equal(result.lead.status, 'partial');
});

test('rejects an empty incomplete lead', () => {
  const result = normalizeLead({
    leadId: 'lead_12345678',
    status: 'partial'
  });

  assert.deepEqual(result, { ok: false, error: 'empty_lead' });
});

test('requires all mandatory fields for a completed lead', () => {
  const result = normalizeLead({
    leadId: 'lead_12345678',
    status: 'complete',
    nome: 'Maria',
    email: 'maria@example.com'
  });

  assert.deepEqual(result, { ok: false, error: 'missing_required_fields' });
});

test('normalizes a valid completed lead', () => {
  const result = normalizeLead({
    id: 'lead_12345678',
    status: 'complete',
    nome: ' Maria Silva ',
    email: 'MARIA@EXAMPLE.COM',
    tel: '(21) 99999-9999',
    unidade: 'Barra',
    serie: '1º ano'
  });

  assert.equal(result.ok, true);
  assert.equal(result.lead.name, 'Maria Silva');
  assert.equal(result.lead.email, 'maria@example.com');
});

test('maps the durable record to the existing Apps Script vocabulary', () => {
  const payload = sheetPayload({
    lead_id: 'lead_12345678', status: 'complete', name: 'Maria',
    email: 'maria@example.com', phone: '(21) 99999-9999', unit: 'Barra',
    grade: '1º ano', created_at: '2026-09-15T12:00:00.000Z',
    updated_at: '2026-09-15T12:01:00.000Z', completed_at: '2026-09-15T12:01:00.000Z',
    utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'matriculas',
    utm_content: '', utm_term: '', gclid: 'g-1', fbclid: '',
    page_url: 'https://matriculas.colegionos.com/', referrer: ''
  }, 'secret');

  assert.equal(payload.id, 'lead_12345678');
  assert.equal(payload.status, 'completo');
  assert.equal(payload.syncSecret, 'secret');
});
