-- 003: User Admin activity log.
-- Every change a User Admin makes (accounts, approvals, profiles) is recorded so
-- admins can see who did what and when. Kept when the actor's account is deleted.

CREATE TABLE admin_audit_log (
  audit_id     SERIAL PRIMARY KEY,
  actor_id     INT REFERENCES user_accounts(account_id) ON DELETE SET NULL,
  action       VARCHAR(40)  NOT NULL,
  target_type  VARCHAR(20)  NOT NULL CHECK (target_type IN ('account', 'registration', 'profile')),
  target_id    INT,
  summary      VARCHAR(300) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON admin_audit_log (created_at DESC);
CREATE INDEX idx_audit_action ON admin_audit_log (action);
CREATE INDEX idx_audit_actor ON admin_audit_log (actor_id);
