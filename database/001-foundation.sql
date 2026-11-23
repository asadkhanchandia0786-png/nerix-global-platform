CREATE TABLE users (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL, platform_role text CHECK (platform_role IN ('owner','operations','support','closer','partner')), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE industries (id text PRIMARY KEY, name text NOT NULL, rates jsonb NOT NULL);
-- statement-break
INSERT INTO industries VALUES ('general','General services','{"outbound":300000,"basic":500000,"advanced":750000}'),('dental','Dental & healthcare','{"outbound":300000,"basic":500000,"advanced":750000}'),('property','Property & real estate','{"outbound":300000,"basic":500000,"advanced":750000}');
-- statement-break
CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL, industry text NOT NULL REFERENCES industries(id), is_demo boolean NOT NULL DEFAULT true, paused boolean NOT NULL DEFAULT false, rates jsonb NOT NULL DEFAULT '{}', settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE companies (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, monthly_cap bigint CHECK (monthly_cap>=0), UNIQUE(id,org_id));
-- statement-break
CREATE TABLE locations (id uuid PRIMARY KEY, org_id uuid NOT NULL, company_id uuid NOT NULL, name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Karachi', monthly_cap bigint CHECK (monthly_cap>=0), UNIQUE(id,org_id), FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id));
-- statement-break
CREATE TABLE memberships (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL CHECK(role IN ('owner','manager','staff','viewer')), company_id uuid, location_id uuid, active boolean NOT NULL DEFAULT true, UNIQUE(org_id,user_id), FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id), FOREIGN KEY(location_id,org_id) REFERENCES locations(id,org_id));
-- statement-break
CREATE TABLE support_assignments (user_id uuid NOT NULL REFERENCES users(id), org_id uuid NOT NULL REFERENCES organizations(id), PRIMARY KEY(user_id,org_id));
-- statement-break
CREATE TABLE invitations (id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, email text NOT NULL, org_id uuid REFERENCES organizations(id), role text NOT NULL, company_id uuid, location_id uuid, expires_at timestamptz NOT NULL, used_at timestamptz, created_by uuid NOT NULL REFERENCES users(id));
-- statement-break
CREATE TABLE audit (id uuid PRIMARY KEY, org_id uuid REFERENCES organizations(id), actor_id uuid REFERENCES users(id), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE INDEX audit_org_time ON audit(org_id,created_at DESC);
-- statement-break
CREATE TABLE wallets (org_id uuid PRIMARY KEY REFERENCES organizations(id), paid bigint NOT NULL DEFAULT 0 CHECK(paid>=0), bonus bigint NOT NULL DEFAULT 0 CHECK(bonus>=0), reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0), CHECK(reserved<=paid+bonus));
-- statement-break
CREATE TABLE ledger (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), event_key text NOT NULL, kind text NOT NULL, amount bigint NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,event_key));
-- statement-break
CREATE TABLE payments (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), reference text UNIQUE NOT NULL, usd bigint NOT NULL CHECK(usd>0), remaining bigint NOT NULL CHECK(remaining>=0), currency text NOT NULL, original_minor bigint NOT NULL CHECK(original_minor>0), refunded_minor bigint NOT NULL DEFAULT 0, refunded_usd bigint NOT NULL DEFAULT 0, test_mode boolean NOT NULL, status text NOT NULL, settlement jsonb NOT NULL DEFAULT '{}', quote jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE payment_quotes (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), usd bigint NOT NULL, currency text NOT NULL, charge_minor bigint NOT NULL, rate numeric NOT NULL, expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false, exception_id uuid, test_mode boolean NOT NULL);
-- statement-break
CREATE TABLE deposit_exceptions (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), usd bigint NOT NULL CHECK(usd>0), currency text NOT NULL, reason text NOT NULL, expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false);
-- statement-break
CREATE TABLE refunds (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), amount bigint NOT NULL CHECK(amount>0), status text NOT NULL CHECK(status IN ('requested','approved','completed','rejected')), reason text NOT NULL, reference text UNIQUE, allocations jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE UNIQUE INDEX one_pending_refund ON refunds(org_id) WHERE status IN ('requested','approved');
-- statement-break
CREATE TABLE leads (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL, location_id uuid NOT NULL, business text NOT NULL, phone text NOT NULL, original_phone text NOT NULL, followup_phone text, email text NOT NULL DEFAULT '', contacts jsonb NOT NULL DEFAULT '[]', timezone text NOT NULL, disposition text NOT NULL DEFAULT 'New', notes text NOT NULL DEFAULT '', previous_caller text NOT NULL DEFAULT '', next_call_at timestamptz, last_called_at timestamptz, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,company_id,phone), FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id), FOREIGN KEY(location_id,org_id) REFERENCES locations(id,org_id));
-- statement-break
CREATE TABLE lead_history (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), lead_id uuid NOT NULL REFERENCES leads(id), kind text NOT NULL, body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE suppression (org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL, phone text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,company_id,phone), FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id));
-- statement-break
CREATE TABLE agents (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), service text NOT NULL, name text NOT NULL, tone text NOT NULL CHECK(tone IN ('alex','sarah')), language text NOT NULL DEFAULT 'en-GB', voice text NOT NULL DEFAULT 'marin', model text NOT NULL DEFAULT 'gpt-realtime-2.1-mini', knowledge text NOT NULL DEFAULT '', instructions text NOT NULL DEFAULT '', UNIQUE(org_id,service));
-- statement-break
CREATE TABLE campaigns (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL, location_id uuid NOT NULL, name text NOT NULL, mode text NOT NULL CHECK(mode IN ('leadgen','followup')), service text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','paused')), rules jsonb NOT NULL, "authorization" boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id), FOREIGN KEY(location_id,org_id) REFERENCES locations(id,org_id));
-- statement-break
CREATE TABLE calls (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), campaign_id uuid NOT NULL REFERENCES campaigns(id), lead_id uuid NOT NULL REFERENCES leads(id), request_key text NOT NULL, service text NOT NULL, rate bigint NOT NULL, rate_source text NOT NULL, reserved bigint NOT NULL DEFAULT 0, seconds integer NOT NULL DEFAULT 0, charge bigint NOT NULL DEFAULT 0, status text NOT NULL CHECK(status IN ('reserved','completed','cancelled')), outcome text NOT NULL DEFAULT '', simulated boolean NOT NULL DEFAULT true, script_snapshot text NOT NULL, timeline jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, UNIQUE(org_id,request_key));
-- statement-break
CREATE TABLE tasks (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL, location_id uuid NOT NULL, lead_id uuid REFERENCES leads(id), kind text NOT NULL, title text NOT NULL, notes text NOT NULL DEFAULT '', due_at timestamptz, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id), FOREIGN KEY(location_id,org_id) REFERENCES locations(id,org_id));
-- statement-break
CREATE TABLE tickets (id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), created_by uuid NOT NULL REFERENCES users(id), subject text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')), replies jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE referrals (id uuid PRIMARY KEY, partner_id uuid NOT NULL REFERENCES users(id), business text NOT NULL, email text NOT NULL, normalized_email text UNIQUE NOT NULL, org_id uuid UNIQUE REFERENCES organizations(id), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','qualified','paid','cancelled','reversed')), verified boolean NOT NULL DEFAULT false, contribution_pkr integer NOT NULL DEFAULT 0, payout_reference text UNIQUE, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
