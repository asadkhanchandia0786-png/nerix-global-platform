ALTER TABLE organizations ADD COLUMN services jsonb NOT NULL DEFAULT '{"voice":true,"chat":true}';
-- statement-break
ALTER TABLE memberships ADD COLUMN service_access jsonb NOT NULL DEFAULT '{"voice":true,"chat":true,"software":"none"}';
-- statement-break
ALTER TABLE invitations ADD COLUMN service_access jsonb NOT NULL DEFAULT '{"voice":true,"chat":true,"software":"none"}';
-- statement-break
CREATE TABLE software_subscriptions (
 org_id uuid PRIMARY KEY REFERENCES organizations(id), plan_name text NOT NULL DEFAULT 'Custom monthly plan',
 amount_cents integer NOT NULL DEFAULT 0 CHECK(amount_cents>=0), currency text NOT NULL DEFAULT 'USD',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','trial','active','cancelled')),
 period_start timestamptz, period_end timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE TABLE software_invoices (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id),
 plan_name text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents>0), currency text NOT NULL,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL CHECK(period_end>period_start),
 status text NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid','void')),
 payment_reference text, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,payment_reference)
);
-- statement-break
CREATE UNIQUE INDEX software_one_open_invoice ON software_invoices(org_id) WHERE status='unpaid';
-- statement-break
CREATE TABLE business_modules (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL,
 name text NOT NULL, description text NOT NULL DEFAULT '', fields jsonb NOT NULL DEFAULT '[]',
 stages jsonb NOT NULL DEFAULT '["New","In progress","Done"]', workflows jsonb NOT NULL DEFAULT '[]',
 template_key text, version integer NOT NULL DEFAULT 1, archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,org_id,company_id),
 FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id), UNIQUE(org_id,company_id,template_key)
);
-- statement-break
CREATE TABLE business_records (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, company_id uuid NOT NULL, location_id uuid NOT NULL,
 module_id uuid NOT NULL, title text NOT NULL, status text NOT NULL, data jsonb NOT NULL DEFAULT '{}',
 assignee_id uuid REFERENCES users(id), due_date date, archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,org_id), FOREIGN KEY(module_id,org_id,company_id) REFERENCES business_modules(id,org_id,company_id),
 FOREIGN KEY(location_id,org_id) REFERENCES locations(id,org_id)
);
-- statement-break
CREATE INDEX business_records_scope ON business_records(org_id,company_id,location_id,module_id,archived,updated_at);
-- statement-break
CREATE TABLE business_history (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, record_id uuid NOT NULL, actor_id uuid REFERENCES users(id),
 kind text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(record_id,org_id) REFERENCES business_records(id,org_id)
);
-- statement-break
CREATE TABLE business_tasks (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, record_id uuid NOT NULL, title text NOT NULL,
 assignee_id uuid REFERENCES users(id), due_date date NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(record_id,event_key),
 FOREIGN KEY(record_id,org_id) REFERENCES business_records(id,org_id)
);
