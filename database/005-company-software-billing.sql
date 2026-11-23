CREATE TABLE software_company_subscriptions (
 company_id uuid PRIMARY KEY, org_id uuid NOT NULL,
 plan_name text NOT NULL DEFAULT 'Custom monthly plan',
 amount_cents integer NOT NULL DEFAULT 0 CHECK(amount_cents>=0), currency text NOT NULL DEFAULT 'USD',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','trial','active','cancelled')),
 period_start timestamptz, period_end timestamptz, legacy_access boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,org_id),
 FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id)
);
-- statement-break
CREATE TABLE software_company_invoices (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, company_id uuid NOT NULL,
 plan_name text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents>0), currency text NOT NULL,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL CHECK(period_end>period_start),
 status text NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid','void')),
 payment_reference text, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,org_id) REFERENCES software_company_subscriptions(company_id,org_id),
 UNIQUE(org_id,payment_reference)
);
-- statement-break
CREATE UNIQUE INDEX software_company_one_open_invoice ON software_company_invoices(company_id) WHERE status='unpaid';
-- statement-break
INSERT INTO software_company_subscriptions(company_id,org_id,plan_name,amount_cents,currency,status,period_start,period_end,legacy_access)
 SELECT c.id,c.org_id,s.plan_name,0,s.currency,s.status,s.period_start,s.period_end,true
 FROM companies c JOIN software_subscriptions s ON s.org_id=c.org_id
 ON CONFLICT(company_id) DO NOTHING;
