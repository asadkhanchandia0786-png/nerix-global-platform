CREATE TABLE phone_numbers (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL, location_id uuid NOT NULL,
 e164 text NOT NULL UNIQUE CHECK (e164 ~ '^\+[1-9][0-9]{6,14}$'),
 label text NOT NULL DEFAULT '', provider text NOT NULL DEFAULT 'voipstudio',
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','released')),
 included_channels integer NOT NULL DEFAULT 2 CHECK (included_channels BETWEEN 1 AND 20),
 extra_channels integer NOT NULL DEFAULT 0 CHECK (extra_channels BETWEEN 0 AND 20),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (company_id, org_id) REFERENCES companies(id, org_id), FOREIGN KEY (location_id, org_id) REFERENCES locations(id, org_id)
);
-- statement-break
CREATE UNIQUE INDEX one_active_number_per_location ON phone_numbers(location_id) WHERE status <> 'released';
-- statement-break
CREATE TABLE reception_settings (
 org_id uuid NOT NULL, location_id uuid NOT NULL,
 assistant_name text NOT NULL DEFAULT 'Sarah', business_name text NOT NULL DEFAULT '', business_type text NOT NULL DEFAULT '',
 greeting text NOT NULL DEFAULT '', voice text NOT NULL DEFAULT 'marin', language text NOT NULL DEFAULT 'en-GB',
 about text NOT NULL DEFAULT '', knowledge text NOT NULL DEFAULT '', policies text NOT NULL DEFAULT '', emergency text NOT NULL DEFAULT '', after_hours_note text NOT NULL DEFAULT '',
 weekly_hours jsonb, fallback_phone text, public_numbers jsonb NOT NULL DEFAULT '[]', transfer_targets jsonb NOT NULL DEFAULT '[]',
 transfers_enabled boolean NOT NULL DEFAULT true, callbacks_enabled boolean NOT NULL DEFAULT true, notify_emails jsonb NOT NULL DEFAULT '[]',
 service text NOT NULL DEFAULT 'basic' CHECK (service IN ('basic','advanced')),
 configuration_version integer NOT NULL DEFAULT 1, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (org_id, location_id), FOREIGN KEY (location_id, org_id) REFERENCES locations(id, org_id)
);
-- statement-break
CREATE TABLE inbound_calls (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL, location_id uuid NOT NULL,
 phone_number_id uuid NOT NULL REFERENCES phone_numbers(id),
 provider_call_id text NOT NULL UNIQUE, caller_phone text, called_phone text NOT NULL, caller_id_source text NOT NULL DEFAULT 'withheld',
 status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','connected','transferred','completed','missed','failed')),
 outcome text, ended_reason text, after_hours boolean,
 service text NOT NULL, rate bigint NOT NULL DEFAULT 0, rate_source text NOT NULL DEFAULT '', billing_enabled boolean NOT NULL DEFAULT true,
 reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0), funded_seconds integer NOT NULL DEFAULT 0, billable_seconds integer NOT NULL DEFAULT 0,
 unfunded_seconds integer NOT NULL DEFAULT 0, charge bigint NOT NULL DEFAULT 0,
 configuration_version integer, realtime_model text, token_totals jsonb NOT NULL DEFAULT '{}',
 started_at timestamptz NOT NULL DEFAULT now(), connected_at timestamptz, sarah_left_at timestamptz, ended_at timestamptz,
 last_activity_at timestamptz NOT NULL DEFAULT now(), total_duration_ms bigint, ai_connected_ms bigint, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (company_id, org_id) REFERENCES companies(id, org_id), FOREIGN KEY (location_id, org_id) REFERENCES locations(id, org_id)
);
-- statement-break
CREATE INDEX inbound_calls_org_time ON inbound_calls(org_id, created_at DESC);
-- statement-break
CREATE INDEX inbound_calls_open ON inbound_calls(phone_number_id) WHERE ended_at IS NULL;
-- statement-break
CREATE TABLE inbound_transfers (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), call_id uuid NOT NULL REFERENCES inbound_calls(id),
 target_key text NOT NULL, target_name text NOT NULL, target_role text NOT NULL, target_phone text NOT NULL,
 caller_name text NOT NULL, reason text NOT NULL, caller_type text NOT NULL DEFAULT 'other', caller_company_name text,
 requested_target_key text, requested_target_name text, requested_target_role text,
 status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','consulting','accepted','connected','completed','failed','declined','no_answer')),
 requested_at timestamptz NOT NULL DEFAULT now(), staff_answered_at timestamptz, accepted_at timestamptz, sarah_left_at timestamptz, ended_at timestamptz,
 caller_staff_duration_ms bigint, updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE INDEX inbound_transfers_call ON inbound_transfers(call_id);
-- statement-break
CREATE TABLE callback_requests (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL, location_id uuid NOT NULL,
 call_id uuid NOT NULL UNIQUE REFERENCES inbound_calls(id), task_id uuid,
 caller_name text NOT NULL, caller_phone text NOT NULL, reason text NOT NULL, caller_type text NOT NULL DEFAULT 'other', caller_company_name text,
 requested_recipient text, requested_role text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')), notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY (company_id, org_id) REFERENCES companies(id, org_id), FOREIGN KEY (location_id, org_id) REFERENCES locations(id, org_id)
);
-- statement-break
CREATE INDEX callback_requests_org_status ON callback_requests(org_id, status, created_at DESC);
-- statement-break
CREATE TABLE gateway_events (event_id text PRIMARY KEY, request_hash text NOT NULL, call_id uuid, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE inbound_usage_events (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, call_id uuid NOT NULL REFERENCES inbound_calls(id), provider_event_id text NOT NULL,
 model text NOT NULL, usage_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (call_id, provider_event_id)
);
-- statement-break
CREATE TABLE email_outbox (
 id uuid PRIMARY KEY, org_id uuid, kind text NOT NULL, to_email text NOT NULL, subject text NOT NULL, body_text text NOT NULL DEFAULT '', body_html text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')), attempts integer NOT NULL DEFAULT 0, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
-- statement-break
CREATE INDEX email_outbox_pending ON email_outbox(next_attempt_at) WHERE status = 'pending';
-- statement-break
CREATE TABLE password_resets (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
