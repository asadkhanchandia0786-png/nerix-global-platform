ALTER TABLE organizations ADD COLUMN billing_mode text NOT NULL DEFAULT 'customer'
  CHECK(billing_mode IN ('customer','internal'));
-- statement-break
ALTER TABLE organizations ADD CONSTRAINT internal_is_not_demo CHECK(billing_mode<>'internal' OR is_demo=false);
