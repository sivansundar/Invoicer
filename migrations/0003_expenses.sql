-- A purchase invoice uploaded for a brand. The file itself lives in R2 under
-- `file_key`; `data` holds the extracted (and possibly corrected) fields.
CREATE TABLE expenses (
  id TEXT PRIMARY KEY NOT NULL,
  brand_id TEXT NOT NULL,
  status TEXT NOT NULL,
  expense_date TEXT,
  total REAL NOT NULL DEFAULT 0,
  file_key TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX expenses_brand_id_idx ON expenses (brand_id);
