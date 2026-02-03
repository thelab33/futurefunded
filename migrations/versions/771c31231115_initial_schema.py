"""initial schema

Revision ID: 771c31231115
Revises:
Create Date: 2025-12-27 02:47:24.998943
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "771c31231115"
down_revision = None
branch_labels = None
depends_on = None


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _jsonb(sa_json):
    # Portable: JSON on SQLite, JSONB on Postgres
    return sa_json.with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")

def upgrade():
    # --- example ---
    op.create_table(
        "example",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # --- orgs ---
    op.create_table(
        "orgs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("team_name", sa.String(length=120), nullable=True),
        sa.Column("league_name", sa.String(length=120), nullable=True),
        sa.Column("mission_statement", sa.Text(), nullable=True),
        sa.Column("brand_color", sa.String(length=20), nullable=True),
        sa.Column("goal_cents", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    with op.batch_alter_table("orgs") as batch_op:
        batch_op.create_index(batch_op.f("ix_orgs_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_orgs_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_orgs_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_orgs_slug"), ["slug"], unique=True)
        batch_op.create_index(batch_op.f("ix_orgs_updated_at"), ["updated_at"], unique=False)

    # --- shoutouts ---
    op.create_table(
        "shoutouts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("sponsor_name", sa.String(length=255), nullable=False),
        sa.Column("message", sa.String(length=512), nullable=True),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("tier", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    with op.batch_alter_table("shoutouts") as batch_op:
        batch_op.create_index(batch_op.f("ix_shoutouts_updated_at"), ["updated_at"], unique=False)

    # --- sms_logs ---
    op.create_table(
        "sms_logs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("from_number", sa.String(length=32), nullable=True),
        sa.Column("to_number", sa.String(length=32), nullable=False),
        sa.Column("message_body", sa.Text(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("ai_used", sa.Boolean(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("provider_message_id", sa.String(length=80), nullable=True),
        sa.Column("provider_error_code", sa.String(length=32), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("length(from_number) <= 32", name="ck_sms_from_len"),
        sa.CheckConstraint("length(to_number)   <= 32", name="ck_sms_to_len"),
    )
    with op.batch_alter_table("sms_logs") as batch_op:
        batch_op.create_index(batch_op.f("ix_sms_logs_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_direction"), ["direction"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_from_number"), ["from_number"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_provider"), ["provider"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_provider_message_id"), ["provider_message_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_to_number"), ["to_number"], unique=False)
        batch_op.create_index(batch_op.f("ix_sms_logs_updated_at"), ["updated_at"], unique=False)

    # --- sponsor_clicks ---
    op.create_table(
        "sponsor_clicks",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("tenant", sa.String(length=120), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("surface", sa.String(length=64), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("ua", sa.Text(), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("referrer", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    with op.batch_alter_table("sponsor_clicks") as batch_op:
        # keep your custom indexes
        batch_op.create_index("ix_clicks_created", ["created_at"], unique=False)
        batch_op.create_index("ix_clicks_name", ["name"], unique=False)
        batch_op.create_index("ix_clicks_tenant_surface", ["tenant", "surface"], unique=False)
        # and keep the auto-generated ones (yes, duplicates exist; leaving as-is preserves behavior)
        batch_op.create_index(batch_op.f("ix_sponsor_clicks_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsor_clicks_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsor_clicks_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsor_clicks_name"), ["name"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsor_clicks_surface"), ["surface"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsor_clicks_tenant"), ["tenant"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsor_clicks_updated_at"), ["updated_at"], unique=False)

    # --- stripe_events ---
    op.create_table(
        "stripe_events",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("type", sa.String(length=120), nullable=False),
        sa.Column("livemode", sa.Boolean(), nullable=False),
        sa.Column("object_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    with op.batch_alter_table("stripe_events") as batch_op:
        batch_op.create_index(batch_op.f("ix_stripe_events_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_stripe_events_event_id"), ["event_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_stripe_events_object_id"), ["object_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_stripe_events_type"), ["type"], unique=False)
        batch_op.create_index("ix_stripe_events_type_created", ["type", "created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_stripe_events_updated_at"), ["updated_at"], unique=False)

    # --- teams ---
    op.create_table(
        "teams",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("uuid", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("team_name", sa.String(length=120), nullable=False),
        sa.Column("meta_description", sa.String(length=255), nullable=True),
        sa.Column("lang_code", sa.String(length=5), nullable=False),
        sa.Column("theme", sa.String(length=30), nullable=True),
        sa.Column("theme_color", sa.String(length=7), nullable=True),
        sa.Column("og_title", sa.String(length=120), nullable=True),
        sa.Column("og_description", sa.String(length=255), nullable=True),
        sa.Column("og_image", sa.String(length=255), nullable=True),
        sa.Column("favicon", sa.String(length=255), nullable=True),
        sa.Column("apple_icon", sa.String(length=255), nullable=True),
        sa.Column("hero_image", sa.String(length=255), nullable=True),
        sa.Column("custom_css", sa.String(length=255), nullable=True),
        # FIX: Text was undefined; use sa.Text() consistently
        sa.Column("record", _jsonb(sa.JSON()), nullable=False),
        sa.Column("impact_stats", _jsonb(sa.JSON()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    with op.batch_alter_table("teams") as batch_op:
        batch_op.create_index(batch_op.f("ix_teams_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_teams_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_teams_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_teams_slug"), ["slug"], unique=True)
        batch_op.create_index(batch_op.f("ix_teams_updated_at"), ["updated_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_teams_uuid"), ["uuid"], unique=True)

    # --- campaign_goals ---
    op.create_table(
        "campaign_goals",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("uuid", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("goal_amount", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint("goal_amount >= 0", name="ck_campaign_goals_goal_amount_nonneg"),
        sa.CheckConstraint("total >= 0", name="ck_campaign_goals_total_nonneg"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="SET NULL"),
    )
    with op.batch_alter_table("campaign_goals") as batch_op:
        batch_op.create_index(batch_op.f("ix_campaign_goals_active"), ["active"], unique=False)
        batch_op.create_index(batch_op.f("ix_campaign_goals_created_at"), ["created_at"], unique=False)
        batch_op.create_index("ix_campaign_goals_org_active", ["org_id", "active"], unique=False)
        batch_op.create_index(batch_op.f("ix_campaign_goals_org_id"), ["org_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_campaign_goals_team_id"), ["team_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_campaign_goals_uuid"), ["uuid"], unique=True)

    # --- players ---
    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("uuid", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=True),
        sa.Column("photo_url", sa.String(length=255), nullable=True),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
    )
    with op.batch_alter_table("players") as batch_op:
        batch_op.create_index(batch_op.f("ix_players_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_players_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_players_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_players_name"), ["name"], unique=False)
        batch_op.create_index(batch_op.f("ix_players_team_id"), ["team_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_players_updated_at"), ["updated_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_players_uuid"), ["uuid"], unique=True)

    # --- sponsors ---
    op.create_table(
        "sponsors",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("tier", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("amount >= 0", name="ck_sponsors_amount_nonneg"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="SET NULL"),
    )
    with op.batch_alter_table("sponsors") as batch_op:
        batch_op.create_index(batch_op.f("ix_sponsors_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_name"), ["name"], unique=False)
        batch_op.create_index("ix_sponsors_org", ["org_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_org_id"), ["org_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_status"), ["status"], unique=False)
        batch_op.create_index("ix_sponsors_status_amount", ["status", "amount"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_team_id"), ["team_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_tier"), ["tier"], unique=False)
        batch_op.create_index(batch_op.f("ix_sponsors_updated_at"), ["updated_at"], unique=False)

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("uuid", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="SET NULL"),
    )
    with op.batch_alter_table("users") as batch_op:
        batch_op.create_index(batch_op.f("ix_users_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_email"), ["email"], unique=True)
        batch_op.create_index(batch_op.f("ix_users_team_id"), ["team_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_updated_at"), ["updated_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_uuid"), ["uuid"], unique=True)

    # --- donations ---
    op.create_table(
        "donations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=160), nullable=False),
        sa.Column("tier", sa.String(length=40), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("logo_path", sa.String(length=255), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("team_id", sa.Integer(), nullable=True),
        sa.Column("campaign_goal_id", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_intent_id", sa.String(length=120), nullable=True),
        sa.Column("provider_status", sa.String(length=60), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=60), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("amount_cents >= 0", name="ck_donations_amount_nonneg"),
        sa.ForeignKeyConstraint(["campaign_goal_id"], ["campaign_goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["org_id"], ["orgs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="SET NULL"),
    )
    with op.batch_alter_table("donations") as batch_op:
        batch_op.create_index(batch_op.f("ix_donations_campaign_goal_id"), ["campaign_goal_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_email"), ["email"], unique=False)
        batch_op.create_index("ix_donations_goal", ["campaign_goal_id"], unique=False)
        batch_op.create_index("ix_donations_org", ["org_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_org_id"), ["org_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_provider"), ["provider"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_provider_intent_id"), ["provider_intent_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_donations_provider_status"), ["provider_status"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_team_id"), ["team_id"], unique=False)
        batch_op.create_index("ix_donations_team_status", ["team_id", "deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_tier"), ["tier"], unique=False)
        batch_op.create_index(batch_op.f("ix_donations_updated_at"), ["updated_at"], unique=False)

    # --- transactions ---
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("uuid", sa.String(length=36), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("payment_method", sa.String(length=64), nullable=True),
        sa.Column("donor_name", sa.String(length=120), nullable=True),
        sa.Column("donor_email", sa.String(length=255), nullable=True),
        sa.Column("campaign_goal_id", sa.Integer(), nullable=True),
        sa.Column("sponsor_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("amount_cents >= 0", name="ck_tx_amount_nonneg"),
        sa.ForeignKeyConstraint(["campaign_goal_id"], ["campaign_goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sponsor_id"], ["sponsors.id"], ondelete="SET NULL"),
    )
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.create_index(batch_op.f("ix_transactions_campaign_goal_id"), ["campaign_goal_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_deleted"), ["deleted"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_donor_email"), ["donor_email"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_sponsor_id"), ["sponsor_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_updated_at"), ["updated_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_transactions_uuid"), ["uuid"], unique=True)
        batch_op.create_index("ix_tx_goal", ["campaign_goal_id"], unique=False)
        batch_op.create_index("ix_tx_sponsor", ["sponsor_id"], unique=False)
        batch_op.create_index("ix_tx_status", ["status"], unique=False)


def downgrade():
    # unchanged from your original (drop order preserved)
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_index("ix_tx_status")
        batch_op.drop_index("ix_tx_sponsor")
        batch_op.drop_index("ix_tx_goal")
        batch_op.drop_index(batch_op.f("ix_transactions_uuid"))
        batch_op.drop_index(batch_op.f("ix_transactions_updated_at"))
        batch_op.drop_index(batch_op.f("ix_transactions_status"))
        batch_op.drop_index(batch_op.f("ix_transactions_sponsor_id"))
        batch_op.drop_index(batch_op.f("ix_transactions_donor_email"))
        batch_op.drop_index(batch_op.f("ix_transactions_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_transactions_deleted"))
        batch_op.drop_index(batch_op.f("ix_transactions_created_at"))
        batch_op.drop_index(batch_op.f("ix_transactions_campaign_goal_id"))
    op.drop_table("transactions")

    with op.batch_alter_table("donations") as batch_op:
        batch_op.drop_index(batch_op.f("ix_donations_updated_at"))
        batch_op.drop_index(batch_op.f("ix_donations_tier"))
        batch_op.drop_index("ix_donations_team_status")
        batch_op.drop_index(batch_op.f("ix_donations_team_id"))
        batch_op.drop_index(batch_op.f("ix_donations_provider_status"))
        batch_op.drop_index(batch_op.f("ix_donations_provider_intent_id"))
        batch_op.drop_index(batch_op.f("ix_donations_provider"))
        batch_op.drop_index(batch_op.f("ix_donations_org_id"))
        batch_op.drop_index("ix_donations_org")
        batch_op.drop_index("ix_donations_goal")
        batch_op.drop_index(batch_op.f("ix_donations_email"))
        batch_op.drop_index(batch_op.f("ix_donations_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_donations_deleted"))
        batch_op.drop_index(batch_op.f("ix_donations_created_at"))
        batch_op.drop_index(batch_op.f("ix_donations_campaign_goal_id"))
    op.drop_table("donations")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_uuid"))
        batch_op.drop_index(batch_op.f("ix_users_updated_at"))
        batch_op.drop_index(batch_op.f("ix_users_team_id"))
        batch_op.drop_index(batch_op.f("ix_users_email"))
        batch_op.drop_index(batch_op.f("ix_users_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_users_deleted"))
        batch_op.drop_index(batch_op.f("ix_users_created_at"))
    op.drop_table("users")

    with op.batch_alter_table("sponsors") as batch_op:
        batch_op.drop_index(batch_op.f("ix_sponsors_updated_at"))
        batch_op.drop_index(batch_op.f("ix_sponsors_tier"))
        batch_op.drop_index(batch_op.f("ix_sponsors_team_id"))
        batch_op.drop_index("ix_sponsors_status_amount")
        batch_op.drop_index(batch_op.f("ix_sponsors_status"))
        batch_op.drop_index(batch_op.f("ix_sponsors_org_id"))
        batch_op.drop_index("ix_sponsors_org")
        batch_op.drop_index(batch_op.f("ix_sponsors_name"))
        batch_op.drop_index(batch_op.f("ix_sponsors_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_sponsors_deleted"))
        batch_op.drop_index(batch_op.f("ix_sponsors_created_at"))
    op.drop_table("sponsors")

    with op.batch_alter_table("players") as batch_op:
        batch_op.drop_index(batch_op.f("ix_players_uuid"))
        batch_op.drop_index(batch_op.f("ix_players_updated_at"))
        batch_op.drop_index(batch_op.f("ix_players_team_id"))
        batch_op.drop_index(batch_op.f("ix_players_name"))
        batch_op.drop_index(batch_op.f("ix_players_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_players_deleted"))
        batch_op.drop_index(batch_op.f("ix_players_created_at"))
    op.drop_table("players")

    with op.batch_alter_table("campaign_goals") as batch_op:
        batch_op.drop_index(batch_op.f("ix_campaign_goals_uuid"))
        batch_op.drop_index(batch_op.f("ix_campaign_goals_team_id"))
        batch_op.drop_index(batch_op.f("ix_campaign_goals_org_id"))
        batch_op.drop_index("ix_campaign_goals_org_active")
        batch_op.drop_index(batch_op.f("ix_campaign_goals_created_at"))
        batch_op.drop_index(batch_op.f("ix_campaign_goals_active"))
    op.drop_table("campaign_goals")

    with op.batch_alter_table("teams") as batch_op:
        batch_op.drop_index(batch_op.f("ix_teams_uuid"))
        batch_op.drop_index(batch_op.f("ix_teams_updated_at"))
        batch_op.drop_index(batch_op.f("ix_teams_slug"))
        batch_op.drop_index(batch_op.f("ix_teams_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_teams_deleted"))
        batch_op.drop_index(batch_op.f("ix_teams_created_at"))
    op.drop_table("teams")

    with op.batch_alter_table("stripe_events") as batch_op:
        batch_op.drop_index(batch_op.f("ix_stripe_events_updated_at"))
        batch_op.drop_index("ix_stripe_events_type_created")
        batch_op.drop_index(batch_op.f("ix_stripe_events_type"))
        batch_op.drop_index(batch_op.f("ix_stripe_events_object_id"))
        batch_op.drop_index(batch_op.f("ix_stripe_events_event_id"))
        batch_op.drop_index(batch_op.f("ix_stripe_events_created_at"))
    op.drop_table("stripe_events")

    with op.batch_alter_table("sponsor_clicks") as batch_op:
        batch_op.drop_index(batch_op.f("ix_sponsor_clicks_updated_at"))
        batch_op.drop_index(batch_op.f("ix_sponsor_clicks_tenant"))
        batch_op.drop_index(batch_op.f("ix_sponsor_clicks_surface"))
        batch_op.drop_index(batch_op.f("ix_sponsor_clicks_name"))
        batch_op.drop_index(batch_op.f("ix_sponsor_clicks_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_sponsor_clicks_deleted"))
        batch_op.drop_index(batch_op.f("ix_sponsor_clicks_created_at"))
        batch_op.drop_index("ix_clicks_tenant_surface")
        batch_op.drop_index("ix_clicks_name")
        batch_op.drop_index("ix_clicks_created")
    op.drop_table("sponsor_clicks")

    with op.batch_alter_table("sms_logs") as batch_op:
        batch_op.drop_index(batch_op.f("ix_sms_logs_updated_at"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_to_number"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_status"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_provider_message_id"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_provider"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_from_number"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_direction"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_deleted"))
        batch_op.drop_index(batch_op.f("ix_sms_logs_created_at"))
    op.drop_table("sms_logs")

    with op.batch_alter_table("shoutouts") as batch_op:
        batch_op.drop_index(batch_op.f("ix_shoutouts_updated_at"))
    op.drop_table("shoutouts")

    with op.batch_alter_table("orgs") as batch_op:
        batch_op.drop_index(batch_op.f("ix_orgs_updated_at"))
        batch_op.drop_index(batch_op.f("ix_orgs_slug"))
        batch_op.drop_index(batch_op.f("ix_orgs_deleted_at"))
        batch_op.drop_index(batch_op.f("ix_orgs_deleted"))
        batch_op.drop_index(batch_op.f("ix_orgs_created_at"))
    op.drop_table("orgs")

    op.drop_table("example")

