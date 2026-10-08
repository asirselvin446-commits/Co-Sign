-- Guardian-assisted sign-in: a person asks a guardian to sign them in to an app or website. The
-- answer is sealed to a one-time key on the asking phone; this table only ever holds ciphertext,
-- which is wiped once delivered or expired.

-- CreateEnum
CREATE TYPE "SigninStatus" AS ENUM ('pending', 'filled', 'denied', 'cancelled', 'expired', 'delivered');

-- CreateEnum
CREATE TYPE "SigninMode" AS ENUM ('fill', 'show');

-- CreateTable
CREATE TABLE "signin_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "mode" "SigninMode" NOT NULL,
    "target_package" TEXT,
    "target_host" TEXT,
    "registrable_domain" TEXT,
    "app_label" TEXT NOT NULL,
    "link_verdict" TEXT NOT NULL,
    "brand" TEXT,
    "public_key" TEXT NOT NULL,
    "risk_reasons" TEXT[],
    "status" "SigninStatus" NOT NULL DEFAULT 'pending',
    "answered_by" UUID,
    "ciphertext" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "signin_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signin_requests_user_id_created_at_idx" ON "signin_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "signin_requests_status_expires_at_idx" ON "signin_requests"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "signin_requests" ADD CONSTRAINT "signin_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signin_requests" ADD CONSTRAINT "signin_requests_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep the hosted data APIs locked out of the new table, like every other Co-Sign table.
ALTER TABLE "signin_requests" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.signin_requests FROM %I', r);
    END IF;
  END LOOP;
END
$$;
