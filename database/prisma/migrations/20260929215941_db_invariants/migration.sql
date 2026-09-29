-- ─────────────────────────────────────────────────────────────────────────────
-- CODEK database-level invariants (spec §9.3, §13.5, §19.1).
-- These protect financial/audit history even against buggy application code.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Generic guards ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION codek_forbid_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CODEK_IMMUTABLE: % on % is not allowed; use an explicit reversal/adjustment', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE OR REPLACE FUNCTION codek_forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CODEK_NO_DELETE: rows in % preserve history and cannot be deleted', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

-- TRUNCATE is only allowed when the session explicitly opts in (automated test resets).
CREATE OR REPLACE FUNCTION codek_guard_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('codek.allow_truncate', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'CODEK_NO_TRUNCATE: TRUNCATE of % is not allowed', TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;

-- ── Ledger: immutable + balanced ─────────────────────────────────────────────
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION codek_forbid_modification();
CREATE TRIGGER ledger_entry_lines_immutable BEFORE UPDATE OR DELETE ON ledger_entry_lines
  FOR EACH ROW EXECUTE FUNCTION codek_forbid_modification();

ALTER TABLE ledger_entry_lines ADD CONSTRAINT ledger_line_amount_positive CHECK (amount_minor > 0);
ALTER TABLE ledger_entry_lines ADD CONSTRAINT ledger_line_currency_iso CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entry_currency_iso CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_account_currency_iso CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_account_owner_key CHECK (
  (owner_type = 'platform' AND owner_id IS NULL AND owner_key = 'platform') OR
  (owner_type <> 'platform' AND owner_id IS NOT NULL AND owner_key = owner_id::text)
);

-- Deferred check at COMMIT: every entry has >= 2 lines, sum(debits) = sum(credits),
-- and every line/account currency equals the entry currency.
CREATE OR REPLACE FUNCTION codek_check_ledger_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_entry_id uuid;
  v_currency char(3);
  v_debit numeric;
  v_credit numeric;
  v_lines int;
  v_bad_currency int;
BEGIN
  IF TG_TABLE_NAME = 'ledger_entries' THEN
    v_entry_id := NEW.id;
  ELSE
    v_entry_id := NEW.ledger_entry_id;
  END IF;
  SELECT currency INTO v_currency FROM ledger_entries WHERE id = v_entry_id;
  SELECT count(*),
         coalesce(sum(CASE WHEN l.direction = 'debit' THEN l.amount_minor ELSE 0 END), 0),
         coalesce(sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE 0 END), 0),
         count(*) FILTER (WHERE l.currency <> v_currency OR a.currency <> v_currency)
    INTO v_lines, v_debit, v_credit, v_bad_currency
    FROM ledger_entry_lines l JOIN ledger_accounts a ON a.id = l.ledger_account_id
   WHERE l.ledger_entry_id = v_entry_id;
  IF v_lines < 2 THEN
    RAISE EXCEPTION 'CODEK_LEDGER_UNBALANCED: entry % has % lines (min 2)', v_entry_id, v_lines USING ERRCODE = 'check_violation';
  END IF;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'CODEK_LEDGER_UNBALANCED: entry % debits % <> credits %', v_entry_id, v_debit, v_credit USING ERRCODE = 'check_violation';
  END IF;
  IF v_bad_currency > 0 THEN
    RAISE EXCEPTION 'CODEK_LEDGER_CURRENCY: entry % mixes currencies', v_entry_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced_on_entry AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION codek_check_ledger_entry_balanced();
CREATE CONSTRAINT TRIGGER ledger_entry_balanced_on_line AFTER INSERT ON ledger_entry_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION codek_check_ledger_entry_balanced();

-- Account balances view (derived; never stored as a mutable field).
CREATE OR REPLACE VIEW ledger_account_balances AS
SELECT a.id AS ledger_account_id, a.owner_type, a.owner_id, a.business_id, a.account_type, a.currency,
       coalesce(sum(l.amount_minor) FILTER (WHERE l.direction = 'debit'), 0)::bigint AS debits_minor,
       coalesce(sum(l.amount_minor) FILTER (WHERE l.direction = 'credit'), 0)::bigint AS credits_minor
  FROM ledger_accounts a LEFT JOIN ledger_entry_lines l ON l.ledger_account_id = a.id
 GROUP BY a.id;

-- ── Commission calculations: frozen amounts, monotonic adjustments ─────────────
ALTER TABLE commission_calculations
  ADD CONSTRAINT commission_amounts_non_negative CHECK (
    base_minor >= 0 AND commission_minor >= 0 AND fee_minor >= 0 AND reversed_minor >= 0 AND fee_reversed_minor >= 0 AND clawback_minor >= 0),
  ADD CONSTRAINT commission_reversal_bounded CHECK (reversed_minor + clawback_minor <= commission_minor AND fee_reversed_minor <= fee_minor),
  ADD CONSTRAINT commission_currency_iso CHECK (currency ~ '^[A-Z]{3}$');

CREATE OR REPLACE FUNCTION codek_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversion_id IS DISTINCT FROM OLD.conversion_id OR NEW.base_minor IS DISTINCT FROM OLD.base_minor
     OR NEW.commission_minor IS DISTINCT FROM OLD.commission_minor OR NEW.fee_minor IS DISTINCT FROM OLD.fee_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.rule_snapshot IS DISTINCT FROM OLD.rule_snapshot
     OR NEW.fee_plan_snapshot IS DISTINCT FROM OLD.fee_plan_snapshot
     OR NEW.commission_rule_id IS DISTINCT FROM OLD.commission_rule_id
     OR NEW.commission_rule_version IS DISTINCT FROM OLD.commission_rule_version
     OR NEW.terms_snapshot_id IS DISTINCT FROM OLD.terms_snapshot_id
     OR NEW.rate IS DISTINCT FROM OLD.rate OR NEW.fixed_minor IS DISTINCT FROM OLD.fixed_minor THEN
    RAISE EXCEPTION 'CODEK_IMMUTABLE: calculated commission amounts and snapshots cannot change' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.reversed_minor < OLD.reversed_minor OR NEW.clawback_minor < OLD.clawback_minor OR NEW.fee_reversed_minor < OLD.fee_reversed_minor THEN
    RAISE EXCEPTION 'CODEK_IMMUTABLE: reversal totals can only increase' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commission_calculations_guard BEFORE UPDATE ON commission_calculations
  FOR EACH ROW EXECUTE FUNCTION codek_commission_guard();

-- ── Snapshots, decisions: immutable ──────────────────────────────────────────
CREATE TRIGGER partnership_terms_snapshots_immutable BEFORE UPDATE OR DELETE ON partnership_terms_snapshots
  FOR EACH ROW EXECUTE FUNCTION codek_forbid_modification();
CREATE TRIGGER attribution_decisions_immutable BEFORE UPDATE OR DELETE ON attribution_decisions
  FOR EACH ROW EXECUTE FUNCTION codek_forbid_modification();

-- Commission rules: rows referenced by calculations are never edited (new version instead).
CREATE OR REPLACE FUNCTION codek_commission_rule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.type, NEW.rate, NEW.fixed_minor, NEW.base_type, NEW.include_tax, NEW.include_shipping, NEW.excluded_items::text,
      NEW.min_minor, NEW.max_minor, NEW.currency, NEW.rounding_mode, NEW.refund_behavior, NEW.version)
     IS DISTINCT FROM
     (OLD.type, OLD.rate, OLD.fixed_minor, OLD.base_type, OLD.include_tax, OLD.include_shipping, OLD.excluded_items::text,
      OLD.min_minor, OLD.max_minor, OLD.currency, OLD.rounding_mode, OLD.refund_behavior, OLD.version) THEN
    RAISE EXCEPTION 'CODEK_IMMUTABLE: commission rule versions are immutable; create a new version' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commission_rules_guard BEFORE UPDATE ON commission_rules FOR EACH ROW EXECUTE FUNCTION codek_commission_rule_guard();
CREATE TRIGGER commission_rules_no_delete BEFORE DELETE ON commission_rules FOR EACH ROW EXECUTE FUNCTION codek_forbid_delete();
ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rule_rate_range CHECK (rate IS NULL OR (rate >= 0 AND rate <= 1)),
  ADD CONSTRAINT commission_rule_amounts CHECK ((fixed_minor IS NULL OR fixed_minor > 0) AND (min_minor IS NULL OR min_minor >= 0) AND (max_minor IS NULL OR max_minor >= 0)),
  ADD CONSTRAINT commission_rule_min_max CHECK (min_minor IS NULL OR max_minor IS NULL OR min_minor <= max_minor);

-- ── Webhook raw events: payload and verification facts are immutable ──────────
CREATE OR REPLACE FUNCTION codek_webhook_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.raw_payload IS DISTINCT FROM OLD.raw_payload OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
     OR NEW.signature_valid IS DISTINCT FROM OLD.signature_valid OR NEW.replay_check_passed IS DISTINCT FROM OLD.replay_check_passed
     OR NEW.received_at IS DISTINCT FROM OLD.received_at OR NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'CODEK_IMMUTABLE: raw webhook evidence cannot change' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER webhook_events_guard BEFORE UPDATE ON webhook_events FOR EACH ROW EXECUTE FUNCTION codek_webhook_guard();

-- ── No-delete history tables ─────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_events','conversion_events','conversions','commission_calculations','merchant_fundings',
    'payouts','payout_attempts','payout_items','payment_provider_transactions','reconciliations','reconciliation_items',
    'promotion_codes','promotion_code_redemptions','referral_links','qr_assets','partnerships','campaign_applications',
    'campaign_invitations','campaigns','attribution_touchpoints','tracking_clicks','disputes','dispute_evidence',
    'fraud_flags','fraud_cases','admin_actions','legal_documents','legal_acceptances','content_submissions',
    'verification_cases','ledger_accounts','partnership_events','businesses','creators','catalog_items']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION codek_forbid_delete()', t || '_no_delete', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ledger_entries','ledger_entry_lines','ledger_accounts','audit_logs','commission_calculations',
    'conversions','payouts','payout_attempts','merchant_fundings','webhook_events','partnership_terms_snapshots','attribution_decisions']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION codek_guard_truncate()', t || '_truncate_guard', t);
  END LOOP;
END $$;

-- ── Promotion codes: normalized code immutable; concurrency-safe usage limit ────
CREATE OR REPLACE FUNCTION codek_promotion_code_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.normalized_code IS DISTINCT FROM OLD.normalized_code OR NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.partnership_id IS DISTINCT FROM OLD.partnership_id THEN
    RAISE EXCEPTION 'CODEK_IMMUTABLE: promotion code identity cannot change' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'revoked' AND NEW.status <> 'revoked' THEN
    RAISE EXCEPTION 'CODEK_IMMUTABLE: revoked codes cannot be reactivated' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER promotion_codes_guard BEFORE UPDATE ON promotion_codes FOR EACH ROW EXECUTE FUNCTION codek_promotion_code_guard();
ALTER TABLE promotion_codes
  ADD CONSTRAINT promotion_code_usage CHECK (usage_count >= 0 AND (usage_limit IS NULL OR (usage_limit > 0 AND usage_count <= usage_limit))),
  ADD CONSTRAINT promotion_code_per_customer CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  ADD CONSTRAINT promotion_code_normalized CHECK (normalized_code = upper(normalized_code) AND length(normalized_code) BETWEEN 4 AND 32),
  ADD CONSTRAINT promotion_code_window CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at);

-- ── Money / domain checks ────────────────────────────────────────────────────
ALTER TABLE conversions
  ADD CONSTRAINT conversion_amounts_non_negative CHECK (
    coalesce(gross_minor, 0) >= 0 AND coalesce(discount_minor, 0) >= 0 AND coalesce(tax_minor, 0) >= 0 AND
    coalesce(shipping_fee_minor, 0) >= 0 AND coalesce(other_fee_minor, 0) >= 0 AND coalesce(net_minor, 0) >= 0 AND
    coalesce(commissionable_minor, 0) >= 0 AND refunded_minor >= 0),
  ADD CONSTRAINT conversion_currency_iso CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
ALTER TABLE merchant_fundings ADD CONSTRAINT funding_amount_positive CHECK (amount_minor > 0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE payouts ADD CONSTRAINT payout_amount_positive CHECK (amount_minor > 0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE payout_items ADD CONSTRAINT payout_item_amount_positive CHECK (amount_minor > 0);
ALTER TABLE catalog_items ADD CONSTRAINT catalog_price_non_negative CHECK (price_minor IS NULL OR price_minor >= 0),
  ADD CONSTRAINT catalog_currency_iso CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
ALTER TABLE campaigns
  ADD CONSTRAINT campaign_caps_positive CHECK ((participant_cap IS NULL OR participant_cap > 0) AND (creator_capacity IS NULL OR creator_capacity > 0)),
  ADD CONSTRAINT campaign_hold_period CHECK (hold_period_days BETWEEN 0 AND 365),
  ADD CONSTRAINT campaign_window CHECK (end_at IS NULL OR start_at IS NULL OR end_at > start_at),
  ADD CONSTRAINT campaign_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT campaign_fixed_fee CHECK (fixed_fee_minor IS NULL OR fixed_fee_minor > 0),
  ADD CONSTRAINT campaign_approval_mode CHECK (conversion_approval_mode IN ('auto_verified', 'manual'));
ALTER TABLE social_accounts ADD CONSTRAINT social_metrics_non_negative CHECK (
  coalesce(follower_count, 0) >= 0 AND coalesce(average_views, 0) >= 0 AND coalesce(likes_avg, 0) >= 0 AND coalesce(comments_avg, 0) >= 0
  AND (engagement_rate IS NULL OR engagement_rate >= 0));
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
ALTER TABLE businesses ADD CONSTRAINT business_country_iso CHECK (country ~ '^[A-Z]{2}$');
ALTER TABLE campaign_applications ADD CONSTRAINT application_waitlist_position CHECK (
  (status = 'waitlisted' AND waitlist_position IS NOT NULL AND waitlist_position > 0) OR (status <> 'waitlisted'));
ALTER TABLE payout_attempts ADD CONSTRAINT payout_attempt_number_positive CHECK (attempt_number > 0);

-- ── Audit log: append-only, hash-chained (tamper-evident) ─────────────────────
CREATE OR REPLACE FUNCTION codek_audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('codek_audit_logs_chain'));
  SELECT hash INTO v_prev FROM audit_logs ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := v_prev;
  NEW.hash := encode(sha256(convert_to(
    coalesce(v_prev, '') || '|' || NEW.id::text || '|' || coalesce(NEW.actor_user_id::text, '') || '|' || NEW.actor_type || '|' ||
    coalesce(NEW.tenant_business_id::text, '') || '|' || NEW.action || '|' || NEW.object_type || '|' ||
    coalesce(NEW.object_id::text, '') || '|' || coalesce(NEW.before_json::text, '') || '|' || coalesce(NEW.after_json::text, '') || '|' ||
    coalesce(NEW.reason, '') || '|' || to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION codek_audit_chain();
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION codek_forbid_modification();

-- Recompute the chain to detect tampering. Returns the first broken seq, or NULL if intact.
CREATE OR REPLACE FUNCTION codek_verify_audit_chain() RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r record; v_prev text := NULL; v_expected text;
BEGIN
  FOR r IN SELECT * FROM audit_logs ORDER BY seq LOOP
    v_expected := encode(sha256(convert_to(
      coalesce(v_prev, '') || '|' || r.id::text || '|' || coalesce(r.actor_user_id::text, '') || '|' || r.actor_type || '|' ||
      coalesce(r.tenant_business_id::text, '') || '|' || r.action || '|' || r.object_type || '|' ||
      coalesce(r.object_id::text, '') || '|' || coalesce(r.before_json::text, '') || '|' || coalesce(r.after_json::text, '') || '|' ||
      coalesce(r.reason, '') || '|' || to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex');
    IF r.prev_hash IS DISTINCT FROM v_prev OR r.hash IS DISTINCT FROM v_expected THEN
      RETURN r.seq;
    END IF;
    v_prev := r.hash;
  END LOOP;
  RETURN NULL;
END $$;

-- Useful partial indexes
CREATE INDEX webhook_events_pending_idx ON webhook_events (received_at) WHERE processing_state IN ('received', 'queued', 'failed');
CREATE INDEX outbox_events_pending_idx ON outbox_events (next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX commission_available_candidates_idx ON commission_calculations (hold_until) WHERE status = 'funded';
