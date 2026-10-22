-- FutureFunded organizer permission audit.
-- Apply explicitly to the approved Neon development branch only.
-- Do not run against operational main.

BEGIN;

CREATE TABLE ff_organizer_dispatch.ff_campaign_membership_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_slug text NOT NULL,
  actor_subject text NOT NULL,
  target_subject text NOT NULL,
  action text NOT NULL CHECK (
    action IN ('grant', 'change_role', 'remove')
  ),
  previous_role text CHECK (
    previous_role IN ('owner', 'publisher', 'editor')
  ),
  new_role text CHECK (
    new_role IN ('owner', 'publisher', 'editor')
  ),
  happened_at timestamptz NOT NULL DEFAULT now(),

  CHECK (actor_subject <> ''),
  CHECK (target_subject <> ''),
  CHECK (campaign_slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  CHECK (
    (action = 'grant'
      AND previous_role IS NULL AND new_role IS NOT NULL)
    OR
    (action = 'change_role'
      AND previous_role IS NOT NULL AND new_role IS NOT NULL
      AND previous_role <> new_role)
    OR
    (action = 'remove'
      AND previous_role IS NOT NULL AND new_role IS NULL)
  )
);

CREATE INDEX ff_campaign_membership_audit_campaign
  ON ff_organizer_dispatch.ff_campaign_membership_audit
  (campaign_slug, happened_at DESC, audit_id DESC);

COMMIT;
