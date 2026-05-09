"""Initial schema for Trading AI Agent

Revision ID: 001_initial
Revises: 
Create Date: 2024-02-26 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create symbols table
    op.create_table(
        'symbols',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('symbol')
    )
    op.create_index(op.f('ix_symbols_symbol'), 'symbols', ['symbol'], unique=False)

    # Create candles table
    op.create_table(
        'candles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('symbol_id', sa.Integer(), nullable=True),
        sa.Column('timeframe', sa.String(length=10), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.Column('open', sa.Float(), nullable=True),
        sa.Column('high', sa.Float(), nullable=True),
        sa.Column('low', sa.Float(), nullable=True),
        sa.Column('close', sa.Float(), nullable=True),
        sa.Column('volume', sa.Float(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['symbol_id'], ['symbols.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_candles_symbol_id'), 'candles', ['symbol_id'], unique=False)
    op.create_index(op.f('ix_candles_timeframe'), 'candles', ['timeframe'], unique=False)
    op.create_index(op.f('ix_candles_timestamp'), 'candles', ['timestamp'], unique=False)

    # Create trades table
    op.create_table(
        'trades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('symbol_id', sa.Integer(), nullable=True),
        sa.Column('direction', sa.String(length=10), nullable=True),
        sa.Column('status', sa.String(length=10), nullable=True, server_default='OPEN'),
        sa.Column('entry_price', sa.Float(), nullable=True),
        sa.Column('exit_price', sa.Float(), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=True),
        sa.Column('stop_loss', sa.Float(), nullable=True),
        sa.Column('take_profit', sa.Float(), nullable=True),
        sa.Column('pnl', sa.Float(), nullable=True),
        sa.Column('pnl_percent', sa.Float(), nullable=True),
        sa.Column('executed_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['symbol_id'], ['symbols.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trades_symbol_id'), 'trades', ['symbol_id'], unique=False)
    op.create_index(op.f('ix_trades_executed_at'), 'trades', ['executed_at'], unique=False)

    # Create daily_risk_states table
    op.create_table(
        'daily_risk_states',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.DateTime(), nullable=False),
        sa.Column('starting_capital', sa.Float(), nullable=True),
        sa.Column('current_capital', sa.Float(), nullable=True),
        sa.Column('daily_pnl', sa.Float(), nullable=True, server_default='0'),
        sa.Column('daily_loss', sa.Float(), nullable=True, server_default='0'),
        sa.Column('daily_trades', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('open_positions', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('trading_halted', sa.Boolean(), nullable=True, server_default='0'),
        sa.Column('halt_reason', sa.String(length=100), nullable=True),
        sa.Column('daily_loss_limit', sa.Float(), nullable=True, server_default='0.05'),
        sa.Column('trade_limit_hit', sa.Boolean(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date')
    )
    op.create_index(op.f('ix_daily_risk_states_date'), 'daily_risk_states', ['date'], unique=False)

    # Create learning_records table
    op.create_table(
        'learning_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('setup_type', sa.String(length=30), nullable=True),
        sa.Column('trend_direction', sa.String(length=10), nullable=True),
        sa.Column('regime', sa.String(length=20), nullable=True),
        sa.Column('result', sa.String(length=10), nullable=True),
        sa.Column('pnl_percent', sa.Float(), nullable=True),
        sa.Column('hold_time', sa.Integer(), nullable=True),
        sa.Column('setup_score', sa.Float(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_learning_records_setup_type'), 'learning_records', ['setup_type'], unique=False)

    # Create probability_tables table
    op.create_table(
        'probability_tables',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('setup_type', sa.String(length=30), nullable=True),
        sa.Column('regime', sa.String(length=20), nullable=True),
        sa.Column('trend_direction', sa.String(length=10), nullable=True),
        sa.Column('total_trades', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('wins', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('losses', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('win_rate', sa.Float(), nullable=True, server_default='0'),
        sa.Column('avg_pnl', sa.Float(), nullable=True, server_default='0'),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )

    # Create system_logs table
    op.create_table(
        'system_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('level', sa.String(length=10), nullable=True),
        sa.Column('category', sa.String(length=20), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('symbol', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_logs_symbol'), 'system_logs', ['symbol'], unique=False)
    op.create_index(op.f('ix_system_logs_created_at'), 'system_logs', ['created_at'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index(op.f('ix_system_logs_created_at'), table_name='system_logs')
    op.drop_index(op.f('ix_system_logs_symbol'), table_name='system_logs')
    op.drop_table('system_logs')

    op.drop_table('probability_tables')

    op.drop_index(op.f('ix_learning_records_setup_type'), table_name='learning_records')
    op.drop_table('learning_records')

    op.drop_index(op.f('ix_daily_risk_states_date'), table_name='daily_risk_states')
    op.drop_table('daily_risk_states')

    op.drop_index(op.f('ix_trades_executed_at'), table_name='trades')
    op.drop_index(op.f('ix_trades_symbol_id'), table_name='trades')
    op.drop_table('trades')

    op.drop_index(op.f('ix_candles_timestamp'), table_name='candles')
    op.drop_index(op.f('ix_candles_timeframe'), table_name='candles')
    op.drop_index(op.f('ix_candles_symbol_id'), table_name='candles')
    op.drop_table('candles')

    op.drop_index(op.f('ix_symbols_symbol'), table_name='symbols')
    op.drop_table('symbols')
