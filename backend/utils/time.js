// Time utilities for consistent timestamp handling

/** Serialize a PG timestamp/timestamptz value to ISO 8601 UTC string */
function toIso(ts) {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toISOString();
}

module.exports = { toIso };
