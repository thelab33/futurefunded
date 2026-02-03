-- Premium features migration (SQLite-friendly)

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT,
  team_id TEXT,
  player_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  donor_email TEXT,
  status TEXT NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sponsor_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  benefits TEXT,
  max_slots INTEGER,
  sold_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT,
  package_id INTEGER,
  business_name TEXT NOT NULL,
  logo_path TEXT,
  website_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  org_id TEXT PRIMARY KEY,
  stripe_account_id TEXT NOT NULL,
  charges_enabled INTEGER DEFAULT 0,
  payouts_enabled INTEGER DEFAULT 0,
  details_submitted INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_campaign ON sponsors(campaign_id);
