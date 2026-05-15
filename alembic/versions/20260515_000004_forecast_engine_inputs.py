"""expand goals for forecast engine inputs"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_000004"
down_revision = "20260515_000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("goals", sa.Column("current_saved_amount", sa.Float(), nullable=False, server_default="0"))
    op.add_column(
        "goals",
        sa.Column("goal_type", sa.String(length=50), nullable=False, server_default="lifestyle"),
    )
    op.add_column(
        "goals",
        sa.Column("funding_strategy", sa.String(length=50), nullable=False, server_default="priority"),
    )
    op.add_column("goals", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("goals", sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))


def downgrade() -> None:
    op.drop_column("goals", "updated_at")
    op.drop_column("goals", "notes")
    op.drop_column("goals", "funding_strategy")
    op.drop_column("goals", "goal_type")
    op.drop_column("goals", "current_saved_amount")
