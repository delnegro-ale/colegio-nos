CREATE TABLE IF NOT EXISTS leads (
  lead_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('partial', 'complete')),
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  gclid TEXT NOT NULL DEFAULT '',
  fbclid TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  sheet_synced_at TEXT,
  last_sync_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_sync
  ON leads (sync_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads (status, updated_at);

CREATE TABLE IF NOT EXISTS lead_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead
  ON lead_events (lead_id, received_at);

CREATE TABLE IF NOT EXISTS lead_conversions (
  lead_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads (lead_id)
);

CREATE TABLE IF NOT EXISTS request_limits (
  key_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key_hash, bucket)
);
