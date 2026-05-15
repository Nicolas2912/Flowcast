"""initial schema"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("account_type", sa.String(length=50), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="EUR"),
        sa.Column("opening_balance", sa.Float(), nullable=False, server_default="0"),
        sa.Column("current_balance_manual", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("behavior_type", sa.String(length=50), nullable=False),
        sa.Column("is_essential", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_variable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_income", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_saving", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
    )
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("source_path", sa.String(length=500), nullable=True),
        sa.Column("file_hash", sa.String(length=128), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.Column("transaction_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "savings_buckets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("bucket_type", sa.String(length=50), nullable=False),
        sa.Column("current_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("target_amount", sa.Float(), nullable=True),
        sa.Column("monthly_contribution", sa.Float(), nullable=False, server_default="0"),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("is_protected", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allow_scenario_withdrawal", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("target_amount", sa.Float(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )
    op.create_table(
        "planned_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("payment_type", sa.String(length=50), nullable=False),
        sa.Column("frequency", sa.String(length=50), nullable=False),
        sa.Column("exact_date", sa.Date(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("month_of_year", sa.Integer(), nullable=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "spending_assumptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False, unique=True),
        sa.Column("calculation_method", sa.String(length=50), nullable=False),
        sa.Column("auto_monthly_amount", sa.Float(), nullable=True),
        sa.Column("manual_monthly_amount", sa.Float(), nullable=True),
        sa.Column("effective_monthly_amount", sa.Float(), nullable=False),
        sa.Column("last_recalculated_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "transactions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("booking_date", sa.Date(), nullable=False),
        sa.Column("value_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="EUR"),
        sa.Column("payee", sa.String(length=255), nullable=True),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column("original_text", sa.Text(), nullable=True),
        sa.Column("normalized_text", sa.Text(), nullable=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("source_import_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=True),
        sa.Column("is_internal_transfer", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_excluded_from_forecast", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("transactions")
    op.drop_table("spending_assumptions")
    op.drop_table("planned_payments")
    op.drop_table("app_settings")
    op.drop_table("goals")
    op.drop_table("savings_buckets")
    op.drop_table("import_batches")
    op.drop_table("categories")
    op.drop_table("accounts")
