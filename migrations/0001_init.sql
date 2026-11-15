CREATE TABLE brands (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX brands_owner_id_idx ON brands (owner_id);

CREATE TABLE clients (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX clients_owner_id_idx ON clients (owner_id);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);
CREATE UNIQUE INDEX invoices_brand_id_invoice_number_key ON invoices (brand_id, invoice_number);
CREATE INDEX invoices_owner_id_idx ON invoices (owner_id);
