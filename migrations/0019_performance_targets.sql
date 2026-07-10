-- Manual performance goals for the executive Dashboard. The Dashboard shows month-to-date counts
-- and revenue against a target ("Goal" / "% of goal" / progress bars). Targets are entered by an
-- owner/admin rather than derived from history, so they live here.
--
-- A target is keyed by (scope, scope_id, metric, period_month):
--   * scope        — 'service' (goal per service), 'center' (per centre), or 'overall'
--                     (the single monthly revenue goal that drives the month-end Forecast %).
--   * scope_id     — the service_id / center_id the goal applies to; NULL for 'overall'.
--   * metric       — 'count' (number of bookings) or 'revenue' (CAD cents).
--   * period_month — 'YYYY-MM' pins the goal to one calendar month; NULL is the recurring default
--                     used for any month with no month-specific override. The Dashboard resolves the
--                     month-specific row first and falls back to the NULL-month default.
--   * target_value — the goal itself: an integer count, or revenue in integer CAD cents.
--
-- No backfill: a scope with no matching row simply renders as "—" with no progress bar.
CREATE TABLE performance_targets (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('service', 'center', 'overall')),
  scope_id TEXT,
  metric TEXT NOT NULL CHECK (metric IN ('count', 'revenue')),
  period_month TEXT,
  target_value INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (scope, scope_id, metric, period_month)
);

-- Dashboard reads all targets for a resolved month in one pass (month-specific + NULL default).
CREATE INDEX idx_targets_scope ON performance_targets(scope, metric, period_month);
