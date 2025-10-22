-- time_entry_audit table to track modifications to time_entries
CREATE TABLE IF NOT EXISTS time_entry_audit (
  id SERIAL PRIMARY KEY,
  time_entry_id INTEGER NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- who performed the change
  action VARCHAR(30) NOT NULL, -- create|update|fallback-flag|approve|deny
  previous_clock_in TIMESTAMP,
  previous_clock_out TIMESTAMP,
  new_clock_in TIMESTAMP,
  new_clock_out TIMESTAMP,
  previous_approval_status VARCHAR(20),
  new_approval_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_time_entry_audit_entry_id ON time_entry_audit(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_audit_user_id ON time_entry_audit(user_id);