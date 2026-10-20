-- FutureFunded M3A. Apply ONLY with explicit database-administrator approval.
-- Transactional migration; no donor, payment, or existing campaign tables changed.
BEGIN;

CREATE TABLE IF NOT EXISTS ff_campaign_organizer_members (
  campaign_slug text NOT NULL,
  actor_subject text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'publisher', 'editor')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text NOT NULL,
  PRIMARY KEY (campaign_slug, actor_subject),
  CHECK (campaign_slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  CHECK (char_length(actor_subject) BETWEEN 3 AND 200)
);

CREATE TABLE IF NOT EXISTS ff_campaign_dispatch_updates (
  campaign_slug text NOT NULL,
  id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 600),
  category text NOT NULL CHECK (category IN ('practice', 'competition', 'travel', 'equipment', 'access', 'community')),
  status text NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  published_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_slug, id),
  CHECK (campaign_slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  CONSTRAINT ff_dispatch_publication_consistency CHECK (
    (status = 'draft' AND published_at IS NULL) OR
    (status = 'published' AND published_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ff_dispatch_public_list
  ON ff_campaign_dispatch_updates (campaign_slug, published_at DESC, id ASC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS ff_campaign_dispatch_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_slug text NOT NULL,
  update_id text NOT NULL,
  actor_subject text NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'edit', 'publish', 'unpublish')),
  prior_version bigint,
  resulting_version bigint NOT NULL,
  snapshot jsonb NOT NULL,
  happened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ff_dispatch_audit_by_update
  ON ff_campaign_dispatch_audit (campaign_slug, update_id, audit_id DESC);

COMMIT;
