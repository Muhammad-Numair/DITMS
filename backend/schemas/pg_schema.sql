-- DITMS PostgreSQL Schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS node_a;
CREATE SCHEMA IF NOT EXISTS node_b;
CREATE SCHEMA IF NOT EXISTS node_c;
CREATE SCHEMA IF NOT EXISTS node_d;
CREATE SCHEMA IF NOT EXISTS node_e;

CREATE TABLE IF NOT EXISTS public.nodes (
  node_id VARCHAR(16) PRIMARY KEY, district_name VARCHAR(64) NOT NULL,
  schema_name VARCHAR(32) NOT NULL, status VARCHAR(16) DEFAULT 'online',
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.distributed_transactions (
  txn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_type VARCHAR(32) NOT NULL, coordinator_id VARCHAR(16) NOT NULL,
  participant_ids TEXT[] NOT NULL, phase VARCHAR(16) DEFAULT 'PREPARING',
  payload JSONB, started_at TIMESTAMPTZ DEFAULT NOW(),
  committed_at TIMESTAMPTZ, aborted_at TIMESTAMPTZ, abort_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_dtxn_phase ON public.distributed_transactions(phase);

CREATE TABLE IF NOT EXISTS public.txn_votes (
  id BIGSERIAL PRIMARY KEY, txn_id UUID NOT NULL,
  node_id VARCHAR(16) NOT NULL, vote VARCHAR(8) NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(txn_id, node_id)
);

CREATE TABLE IF NOT EXISTS public.distributed_locks (
  lock_id VARCHAR(128) PRIMARY KEY, lock_type VARCHAR(16) DEFAULT 'EXCLUSIVE',
  held_by_txn UUID, held_by_node VARCHAR(16) NOT NULL,
  acquired_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ,
  resource_type VARCHAR(32), resource_id VARCHAR(16)
);

CREATE TABLE IF NOT EXISTS public.wal_log (
  lsn BIGSERIAL PRIMARY KEY, node_id VARCHAR(16) NOT NULL,
  txn_id UUID, operation VARCHAR(8) NOT NULL, table_name VARCHAR(64) NOT NULL,
  record_id VARCHAR(64), before_image JSONB, after_image JSONB,
  logged_at TIMESTAMPTZ DEFAULT NOW(), checkpointed BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_wal_node ON public.wal_log(node_id, lsn);

CREATE TABLE IF NOT EXISTS public.checkpoints (
  id BIGSERIAL PRIMARY KEY, node_id VARCHAR(16) NOT NULL,
  last_lsn BIGINT NOT NULL, snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.users (
  user_id BIGSERIAL PRIMARY KEY, username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(256) NOT NULL, role VARCHAR(32) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sessions (
  session_id VARCHAR(128) PRIMARY KEY, user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
  is_valid BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT, username VARCHAR(64),
  action VARCHAR(128) NOT NULL, resource VARCHAR(128),
  result VARCHAR(16) DEFAULT 'SUCCESS', details JSONB,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.create_node_tables(s TEXT) RETURNS VOID AS $$
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.intersections (
    intersection_id VARCHAR(8) PRIMARY KEY, name VARCHAR(64), x_coord FLOAT,
    y_coord FLOAT, district VARCHAR(16), is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW())', s);
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.traffic_signals (
    signal_id BIGSERIAL PRIMARY KEY, intersection_id VARCHAR(8),
    state VARCHAR(8) DEFAULT ''RED'', direction VARCHAR(4) DEFAULT ''NS'',
    green_duration INT DEFAULT 30, yellow_duration INT DEFAULT 5,
    red_duration INT DEFAULT 30, ai_mode BOOLEAN DEFAULT TRUE,
    manual_override BOOLEAN DEFAULT FALSE, override_state VARCHAR(8),
    queue_length INT DEFAULT 0, congestion_level FLOAT DEFAULT 0.0,
    updated_at TIMESTAMPTZ DEFAULT NOW())', s);
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I.node_state (
    node_id VARCHAR(16) PRIMARY KEY, status VARCHAR(16) DEFAULT ''online'',
    congestion_avg FLOAT DEFAULT 0.0, vehicle_count INT DEFAULT 0,
    ai_active BOOLEAN DEFAULT TRUE, last_updated TIMESTAMPTZ DEFAULT NOW())', s);
END; $$ LANGUAGE plpgsql;

SELECT public.create_node_tables('node_a');
SELECT public.create_node_tables('node_b');
SELECT public.create_node_tables('node_c');
SELECT public.create_node_tables('node_d');
SELECT public.create_node_tables('node_e');
