-- Dedicated schema. Never alters organizer, authentication, campaign or payment tables.
CREATE SCHEMA IF NOT EXISTS ff_newsletter;
CREATE TABLE IF NOT EXISTS ff_newsletter.schema_version (version integer PRIMARY KEY CHECK (version = 1));
INSERT INTO ff_newsletter.schema_version VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ff_newsletter.requests (
  id uuid PRIMARY KEY,
  token_hash char(64) UNIQUE NOT NULL,
  campaign_slug text NOT NULL,
  organization text NOT NULL,
  email text NOT NULL,
  consent_version text NOT NULL,
  consent_text text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  mail_accepted boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  outcome text CHECK (outcome IN ('subscribed', 'suppressed')),
  CHECK ((confirmed_at IS NULL) = (outcome IS NULL))
);
CREATE INDEX IF NOT EXISTS newsletter_request_expiry ON ff_newsletter.requests (expires_at) WHERE confirmed_at IS NULL;
CREATE TABLE IF NOT EXISTS ff_newsletter.rate_limits (
  key text PRIMARY KEY,
  starts_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0)
);
REVOKE ALL ON SCHEMA ff_newsletter FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ff_newsletter FROM PUBLIC;
