-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'deleted');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('android', 'ios', 'web');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin', 'analyst');

-- CreateEnum
CREATE TYPE "GuardianLinkStatus" AS ENUM ('pending_activation', 'active', 'pending_removal', 'removed', 'cancelled');

-- CreateEnum
CREATE TYPE "SensitiveAction" AS ENUM ('add_device', 'add_passkey', 'remove_guardian', 'change_phone', 'change_email', 'raise_transfer_limit', 'add_payee', 'transfer_above_limit', 'view_recovery_codes', 'delete_account');

-- CreateEnum
CREATE TYPE "StepupStatus" AS ENUM ('pending_user', 'pending_guardians', 'cooloff', 'ready_to_confirm', 'approved', 'completed', 'denied', 'cancelled', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "Decision" AS ENUM ('approve', 'deny');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('pending_approvals', 'cancel_window', 'ready', 'completed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "RecoveryApprovalMethod" AS ENUM ('guardian_passkey', 'recovery_code');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "display_name_enc" TEXT NOT NULL,
    "webauthn_user_id" BYTEA NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "email_enc" TEXT,
    "email_hash" TEXT,
    "phone_enc" TEXT,
    "phone_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "aaguid" TEXT,
    "nickname" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "name_enc" TEXT NOT NULL,
    "push_token_enc" TEXT,
    "app_version" TEXT,
    "sim_hash" TEXT,
    "sim_changed_at" TIMESTAMP(3),
    "integrity_verdict" TEXT,
    "integrity_at" TIMESTAMP(3),
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "webauthn_user_id" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_credentials" (
    "id" TEXT NOT NULL,
    "admin_id" UUID NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "admin_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invites" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "issued_by_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by_admin" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_refresh_tokens" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "admin_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "invite_id" UUID,
    "status" "GuardianLinkStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activates_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "removal_requested_at" TIMESTAMP(3),
    "removes_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "guardian_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_id" UUID,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_signals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "context" TEXT NOT NULL,
    "payload_enc" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "matched_rules" TEXT[],
    "stepup_request_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_rule_sets" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "guardian_threshold" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stepup_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "action" "SensitiveAction" NOT NULL,
    "params_enc" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "rule_set_version" INTEGER NOT NULL,
    "needs_guardian" BOOLEAN NOT NULL,
    "status" "StepupStatus" NOT NULL,
    "nonce" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "user_verified_at" TIMESTAMP(3),
    "cool_off_until" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "result_enc" TEXT,
    "failure_code" TEXT,

    CONSTRAINT "stepup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_decisions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "decision" "Decision" NOT NULL,
    "credential_id" TEXT NOT NULL,
    "response_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recoveries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "poll_token_hash" TEXT NOT NULL,
    "status" "RecoveryStatus" NOT NULL,
    "required_approvals" INTEGER NOT NULL,
    "nonce" TEXT NOT NULL,
    "new_device_platform" "Platform" NOT NULL,
    "new_device_name_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "threshold_reached_at" TIMESTAMP(3),
    "completes_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_device" UUID,
    "completed_at" TIMESTAMP(3),
    "new_device_id" UUID,

    CONSTRAINT "recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_approvals" (
    "id" UUID NOT NULL,
    "recovery_id" UUID NOT NULL,
    "guardian_id" UUID,
    "method" "RecoveryApprovalMethod" NOT NULL,
    "credential_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "balance_minor" BIGINT NOT NULL,
    "transfer_limit_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payees" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "payee_user_id" UUID NOT NULL,
    "nickname" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "memo_enc" TEXT,
    "status" "TransferStatus" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "initiated_by_id" UUID NOT NULL,
    "stepup_request_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "payload" JSONB NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "users_webauthn_user_id_key" ON "users"("webauthn_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_hash_key" ON "users"("phone_hash");

-- CreateIndex
CREATE INDEX "credentials_user_id_idx" ON "credentials"("user_id");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_handle_key" ON "admins"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "admins_webauthn_user_id_key" ON "admins"("webauthn_user_id");

-- CreateIndex
CREATE INDEX "admin_credentials_admin_id_idx" ON "admin_credentials"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invites_token_hash_key" ON "admin_invites"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refresh_tokens_token_hash_key" ON "admin_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "admin_refresh_tokens_family_id_idx" ON "admin_refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_links_invite_id_key" ON "guardian_links"("invite_id");

-- CreateIndex
CREATE INDEX "guardian_links_user_id_status_idx" ON "guardian_links"("user_id", "status");

-- CreateIndex
CREATE INDEX "guardian_links_guardian_id_status_idx" ON "guardian_links"("guardian_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "invites_code_hash_key" ON "invites"("code_hash");

-- CreateIndex
CREATE INDEX "invites_inviter_id_idx" ON "invites"("inviter_id");

-- CreateIndex
CREATE INDEX "risk_signals_user_id_created_at_idx" ON "risk_signals"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_signals_created_at_idx" ON "risk_signals"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "risk_rule_sets_version_key" ON "risk_rule_sets"("version");

-- CreateIndex
CREATE INDEX "stepup_requests_user_id_status_idx" ON "stepup_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "stepup_requests_status_expires_at_idx" ON "stepup_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "stepup_requests_status_cool_off_until_idx" ON "stepup_requests"("status", "cool_off_until");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_decisions_request_id_guardian_id_key" ON "guardian_decisions"("request_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "recoveries_poll_token_hash_key" ON "recoveries"("poll_token_hash");

-- CreateIndex
CREATE INDEX "recoveries_user_id_status_idx" ON "recoveries"("user_id", "status");

-- CreateIndex
CREATE INDEX "recoveries_status_completes_at_idx" ON "recoveries"("status", "completes_at");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_approvals_recovery_id_guardian_id_key" ON "recovery_approvals"("recovery_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_code_hash_key" ON "recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_key" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payees_owner_id_payee_user_id_key" ON "payees"("owner_id", "payee_user_id");

-- CreateIndex
CREATE INDEX "transfers_from_account_id_created_at_idx" ON "transfers"("from_account_id", "created_at");

-- CreateIndex
CREATE INDEX "transfers_to_account_id_created_at_idx" ON "transfers"("to_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_initiated_by_id_idempotency_key_key" ON "transfers"("initiated_by_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "consents_user_id_purpose_created_at_idx" ON "consents"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_hash_key" ON "audit_events"("hash");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_subject_type_subject_id_idx" ON "audit_events"("subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_credentials" ADD CONSTRAINT "admin_credentials_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_refresh_tokens" ADD CONSTRAINT "admin_refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_rule_sets" ADD CONSTRAINT "risk_rule_sets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stepup_requests" ADD CONSTRAINT "stepup_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stepup_requests" ADD CONSTRAINT "stepup_requests_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_decisions" ADD CONSTRAINT "guardian_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "stepup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_decisions" ADD CONSTRAINT "guardian_decisions_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_approvals" ADD CONSTRAINT "recovery_approvals_recovery_id_fkey" FOREIGN KEY ("recovery_id") REFERENCES "recoveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_approvals" ADD CONSTRAINT "recovery_approvals_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_payee_user_id_fkey" FOREIGN KEY ("payee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints that Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------

-- Ledger invariants.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_balance_non_negative" CHECK ("balance_minor" >= 0);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_limit_non_negative" CHECK ("transfer_limit_minor" >= 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_amount_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_accounts" CHECK ("from_account_id" <> "to_account_id");

-- A guardian can hold at most one live link to the same user.
CREATE UNIQUE INDEX "guardian_links_live_pair" ON "guardian_links" ("user_id", "guardian_id")
  WHERE "status" IN ('pending_activation', 'active', 'pending_removal');

-- At most one open recovery per account.
CREATE UNIQUE INDEX "recoveries_one_open_per_user" ON "recoveries" ("user_id")
  WHERE "status" IN ('pending_approvals', 'cancel_window', 'ready');

-- audit_events is append-only. Rows can be inserted but never changed or removed.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_no_update" BEFORE UPDATE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER "audit_events_no_delete" BEFORE DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER "audit_events_no_truncate" BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
