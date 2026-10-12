ALTER TABLE dashboards ADD COLUMN last_accessed_at INTEGER NOT NULL DEFAULT 0;
UPDATE dashboards SET last_accessed_at = created_at;
CREATE INDEX dashboards_last_accessed ON dashboards(last_accessed_at);
