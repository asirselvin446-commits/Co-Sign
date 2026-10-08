-- Co-Sign no longer has an in-app wallet: it protects people while they use their own banking,
-- payment and email apps. Remove the wallet tables and the wallet-only safety-check actions.

-- Safety checks for the removed actions cannot be completed any more (their guardian decisions
-- cascade). The audit log keeps the record of what happened.
DELETE FROM "stepup_requests" WHERE "action"::text IN ('raise_transfer_limit', 'add_payee', 'transfer_above_limit');

-- AlterEnum
BEGIN;
CREATE TYPE "SensitiveAction_new" AS ENUM ('add_device', 'add_passkey', 'remove_guardian', 'change_phone', 'change_email', 'view_recovery_codes', 'delete_account');
ALTER TABLE "stepup_requests" ALTER COLUMN "action" TYPE "SensitiveAction_new" USING ("action"::text::"SensitiveAction_new");
ALTER TYPE "SensitiveAction" RENAME TO "SensitiveAction_old";
ALTER TYPE "SensitiveAction_new" RENAME TO "SensitiveAction";
DROP TYPE "public"."SensitiveAction_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payees" DROP CONSTRAINT "payees_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "payees" DROP CONSTRAINT "payees_payee_user_id_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_from_account_id_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_initiated_by_id_fkey";

-- DropForeignKey
ALTER TABLE "transfers" DROP CONSTRAINT "transfers_to_account_id_fkey";

-- AlterTable
ALTER TABLE "monitor_events" ADD COLUMN     "detail" JSONB;

-- DropTable
DROP TABLE "accounts";

-- DropTable
DROP TABLE "payees";

-- DropTable
DROP TABLE "transfers";

-- DropEnum
DROP TYPE "TransferStatus";

