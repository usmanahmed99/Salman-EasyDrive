-- Add price_tax_mode so admins can mark a service price as tax-included or plus-tax.
-- Values: 'none' (show price as-is), 'incl' (append "Tax Incl."), 'plus' (append "+ Tax").
-- Drives the price label on the public service card and booking summary.
ALTER TABLE services ADD COLUMN price_tax_mode TEXT NOT NULL DEFAULT 'none';
