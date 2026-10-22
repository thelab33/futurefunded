-- Additive, test-only ledger. No organizer, authentication, newsletter or live-payment tables altered.
CREATE SCHEMA IF NOT EXISTS ff_donations_test;
CREATE TABLE IF NOT EXISTS ff_donations_test.schema_version(version integer PRIMARY KEY CHECK(version=1));
INSERT INTO ff_donations_test.schema_version VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ff_donations_test.campaigns(
 tenant_id text NOT NULL, campaign_slug text NOT NULL, stripe_account text NOT NULL,
 PRIMARY KEY(tenant_id,campaign_slug), UNIQUE(campaign_slug)
);
CREATE TABLE IF NOT EXISTS ff_donations_test.attempts(
 id uuid PRIMARY KEY, tenant_id text NOT NULL, campaign_slug text NOT NULL, stripe_account text NOT NULL,
 request_token uuid NOT NULL, details_hash char(64) NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 100 AND 1000000),
 donor_name text NOT NULL, donor_email text NOT NULL, anonymous boolean NOT NULL,
 origin text NOT NULL, stripe_form text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), stripe_session_id text UNIQUE, checkout_url text,
 payment_intent_id text UNIQUE, charge_id text UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','expired','failed','refunded','disputed')),
 gross_cents integer NOT NULL DEFAULT 0 CHECK(gross_cents>=0),
 refunded_cents integer NOT NULL DEFAULT 0 CHECK(refunded_cents>=0 AND refunded_cents<=gross_cents),
 disputed_cents integer NOT NULL DEFAULT 0 CHECK(disputed_cents>=0 AND disputed_cents<=gross_cents-refunded_cents), verified_at timestamptz,
 UNIQUE(tenant_id,campaign_slug,request_token),
 FOREIGN KEY(tenant_id,campaign_slug) REFERENCES ff_donations_test.campaigns(tenant_id,campaign_slug),
 CHECK((gross_cents=0 AND state IN ('pending','expired','failed')) OR (gross_cents>0 AND ((state='paid' AND gross_cents>refunded_cents AND disputed_cents=0) OR (state='refunded' AND gross_cents=refunded_cents AND disputed_cents=0) OR (state='disputed' AND disputed_cents>0)))),
 CHECK(gross_cents=0 OR gross_cents=amount_cents)
);
CREATE INDEX IF NOT EXISTS donation_test_campaign ON ff_donations_test.attempts(tenant_id,campaign_slug);
CREATE TABLE IF NOT EXISTS ff_donations_test.events(
 stripe_account text NOT NULL,event_id text NOT NULL,event_type text NOT NULL,object_id text NOT NULL,
 attempt_id uuid NOT NULL REFERENCES ff_donations_test.attempts(id),processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(stripe_account,event_id)
);
CREATE TABLE IF NOT EXISTS ff_donations_test.rate_limits(key text PRIMARY KEY,starts_at timestamptz NOT NULL,hits integer NOT NULL CHECK(hits>0));
CREATE OR REPLACE VIEW ff_donations_test.campaign_totals AS
 SELECT tenant_id,campaign_slug,
 COALESCE(SUM(CASE WHEN state IN ('paid','disputed') AND verified_at IS NOT NULL THEN gross_cents-refunded_cents-disputed_cents ELSE 0 END),0)::bigint AS net_cents,
 COUNT(*) FILTER(WHERE state IN ('paid','disputed') AND verified_at IS NOT NULL AND gross_cents-refunded_cents-disputed_cents>0)::bigint AS gifts
 FROM ff_donations_test.attempts GROUP BY tenant_id,campaign_slug;
REVOKE ALL ON SCHEMA ff_donations_test FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ff_donations_test FROM PUBLIC;
