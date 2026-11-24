ALTER TABLE users ADD COLUMN email_verified_at timestamptz DEFAULT now();
-- statement-break
UPDATE users SET email_verified_at=created_at WHERE email_verified_at IS NOT NULL;
-- statement-break
ALTER TABLE users ADD COLUMN self_registered boolean NOT NULL DEFAULT false;
-- statement-break
ALTER TABLE organizations ADD COLUMN activation_status text NOT NULL DEFAULT 'active' CHECK(activation_status IN ('locked','active','suspended'));
-- statement-break
ALTER TABLE organizations ADD COLUMN activation_note text NOT NULL DEFAULT '';
-- statement-break
ALTER TABLE organizations ADD COLUMN activated_at timestamptz;
-- statement-break
ALTER TABLE organizations ADD COLUMN self_registered boolean NOT NULL DEFAULT false;
-- statement-break
CREATE TABLE email_verifications (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 sent_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
