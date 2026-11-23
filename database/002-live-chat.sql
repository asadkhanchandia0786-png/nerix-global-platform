CREATE TABLE chat_sites (
  id uuid PRIMARY KEY, public_key text UNIQUE NOT NULL, org_id uuid REFERENCES organizations(id),
  company_id uuid, location_id uuid, name text NOT NULL, business_name text NOT NULL,
  agent_name text NOT NULL DEFAULT 'Sarah', purpose text NOT NULL DEFAULT 'support' CHECK(purpose IN ('support','sales')),
  origins jsonb NOT NULL DEFAULT '[]', knowledge text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,org_id) REFERENCES companies(id,org_id),
  FOREIGN KEY(location_id,org_id) REFERENCES locations(id,org_id),
  CHECK(location_id IS NULL OR company_id IS NOT NULL), CHECK(org_id IS NOT NULL OR company_id IS NULL)
);
-- statement-break
INSERT INTO chat_sites(id,public_key,name,business_name,origins)
VALUES('70110000-0000-4000-8000-000000000001','nerix-global','Nerix Global website','Nerix Global','["https://nerixglobal.com","https://www.nerixglobal.com"]');
-- statement-break
CREATE TABLE chat_conversations (
  id uuid PRIMARY KEY, site_id uuid NOT NULL REFERENCES chat_sites(id), token_hash text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'ai' CHECK(status IN ('ai','waiting','human','follow_up','closed')),
  assigned_to uuid REFERENCES users(id), contact jsonb NOT NULL DEFAULT '{}', reason text NOT NULL DEFAULT '',
  queued_at timestamptz, ai_busy_until timestamptz, ai_request_id uuid, visitor_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE INDEX chat_queue ON chat_conversations(site_id,status,updated_at DESC);
-- statement-break
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY, sequence bigserial UNIQUE NOT NULL, conversation_id uuid NOT NULL REFERENCES chat_conversations(id),
  sender text NOT NULL CHECK(sender IN ('visitor','assistant','human','system')), sender_name text NOT NULL,
  user_id uuid REFERENCES users(id), body text NOT NULL, kind text NOT NULL DEFAULT 'system',
  event_key text NOT NULL, usage jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,event_key)
);
-- statement-break
CREATE TABLE chat_followups (
  id uuid PRIMARY KEY, conversation_id uuid UNIQUE NOT NULL REFERENCES chat_conversations(id),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')), completed_by uuid REFERENCES users(id),
  note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
-- statement-break
CREATE TABLE chat_presence (
  site_id uuid NOT NULL REFERENCES chat_sites(id), user_id uuid NOT NULL REFERENCES users(id),
  available boolean NOT NULL DEFAULT false, capacity integer NOT NULL DEFAULT 3 CHECK(capacity BETWEEN 1 AND 10),
  seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(site_id,user_id)
);
-- statement-break
CREATE TABLE chat_ai_budget (day date PRIMARY KEY, count integer NOT NULL DEFAULT 0);
-- statement-break
CREATE TABLE chat_ai_usage (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES chat_conversations(id), outcome text NOT NULL CHECK(outcome IN ('applied','discarded','unavailable')), usage jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
