"""add import provenance"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_000002"
down_revision = "20260515_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("import_batches", sa.Column("provider", sa.String(length=50), nullable=False, server_default="c24"))
    op.add_column("import_batches", sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"))
    op.add_column("import_batches", sa.Column("delimiter", sa.String(length=5), nullable=True))
    op.add_column("import_batches", sa.Column("row_checksum_summary", sa.String(length=128), nullable=True))
    op.add_column("import_batches", sa.Column("inserted_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("import_batches", sa.Column("duplicate_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("import_batches", sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("import_batches", sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("import_batches", sa.Column("error_summary", sa.Text(), nullable=True))

    op.add_column("transactions", sa.Column("source_row_number", sa.Integer(), nullable=True))
    op.add_column("transactions", sa.Column("raw_row_json", sa.Text(), nullable=True))

    op.create_table(
        "import_failures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("import_batch_id", sa.Integer(), sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("raw_row_json", sa.Text(), nullable=False),
    )

def downgrade() -> None:
    op.drop_table("import_failures")
    op.drop_column("transactions", "raw_row_json")
    op.drop_column("transactions", "source_row_number")
    op.drop_column("import_batches", "error_summary")
    op.drop_column("import_batches", "failed_count")
    op.drop_column("import_batches", "skipped_count")
    op.drop_column("import_batches", "duplicate_count")
    op.drop_column("import_batches", "inserted_count")
    op.drop_column("import_batches", "row_checksum_summary")
    op.drop_column("import_batches", "delimiter")
    op.drop_column("import_batches", "status")
    op.drop_column("import_batches", "provider")
