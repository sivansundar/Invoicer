-- One row per person a brand is shared with. `user_id` is filled in the first
-- time someone signs in with that (verified) email.
CREATE TABLE brand_access (
  brand_id TEXT NOT NULL,
  email TEXT NOT NULL,
  user_id TEXT,
  invoices TEXT NOT NULL DEFAULT 'view',
  expenses TEXT NOT NULL DEFAULT 'view',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (brand_id, email)
);
CREATE INDEX brand_access_user_id_idx ON brand_access (user_id);
CREATE INDEX brand_access_email_idx ON brand_access (email);
