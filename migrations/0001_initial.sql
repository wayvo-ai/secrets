PRAGMA foreign_keys = ON;
CREATE TABLE dashboards (id TEXT PRIMARY KEY, capability_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE secrets (
 id TEXT PRIMARY KEY, dashboard_id TEXT NOT NULL REFERENCES dashboards(id), label TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE, redeem_capability_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','claimed')), claimed_at INTEGER, accessed_at INTEGER
);
CREATE INDEX secrets_dashboard_created ON secrets(dashboard_id, created_at DESC, id DESC);
CREATE INDEX secrets_expiry ON secrets(expires_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
-- Atomic INSERTs enforce the dashboard quota even across concurrent creators.
CREATE TRIGGER secret_quota BEFORE INSERT ON secrets
WHEN (SELECT count(*) FROM secrets WHERE dashboard_id = NEW.dashboard_id) >= 100
BEGIN SELECT RAISE(ABORT, 'dashboard quota'); END;
