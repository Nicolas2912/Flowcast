"""transaction workspace foundation"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_000003"
down_revision = "20260515_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("is_excluded", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "transactions",
        sa.Column("category_assignment_method", sa.String(length=30), nullable=True),
    )
    op.create_table(
        "merchant_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("pattern_type", sa.String(length=20), nullable=False),
        sa.Column("pattern", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("merchant_rules")
    op.drop_column("transactions", "category_assignment_method")
    op.drop_column("categories", "is_excluded")
