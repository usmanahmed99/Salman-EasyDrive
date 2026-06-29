-- Packages: admin-defined bundles of "N sessions of service A, M of service B, …".
-- A client books a package by picking a slot for every session; each session is created as an
-- ordinary row in `bookings` carrying `package_booking_id`, so reschedule/cancel/calendar/resource
-- logic all operate per single session with no special-casing. `package_bookings` is only the
-- parent that links siblings, holds the shared public token, and gives the package one reference.

CREATE TABLE packages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '',
  description_fr TEXT NOT NULL DEFAULT '',
  price_display TEXT,                                  -- the package's own price (bundle price)
  price_tax_mode TEXT NOT NULL DEFAULT 'none',         -- 'none' | 'incl' | 'plus' (matches services)
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

-- Line items: which services, and how many sessions of each, make up the package.
CREATE TABLE package_items (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES packages(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_package_items_package ON package_items(package_id);

-- Per-center availability, mirroring service_centers.
CREATE TABLE package_centers (
  package_id TEXT NOT NULL REFERENCES packages(id),
  center_id TEXT NOT NULL REFERENCES centers(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(package_id, center_id)
);

-- Parent record linking the per-session child bookings of one package purchase.
CREATE TABLE package_bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,                      -- PKG-XXXXXX
  package_id TEXT NOT NULL REFERENCES packages(id),
  center_id TEXT NOT NULL REFERENCES centers(id),
  public_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A package session is a normal booking pointing back at its parent.
ALTER TABLE bookings ADD COLUMN package_booking_id TEXT REFERENCES package_bookings(id);
CREATE INDEX idx_bookings_package ON bookings(package_booking_id);
