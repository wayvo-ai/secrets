-- Run daily using wrangler d1 execute. Times are Unix milliseconds.
DELETE FROM rate_limits WHERE expires_at < unixepoch('now') * 1000;
DELETE FROM secrets WHERE created_at < (unixepoch('now') - 365 * 86400) * 1000;
DELETE FROM dashboards WHERE last_accessed_at <= (unixepoch('now') - 365 * 86400) * 1000 AND NOT EXISTS (SELECT 1 FROM secrets WHERE secrets.dashboard_id = dashboards.id);
