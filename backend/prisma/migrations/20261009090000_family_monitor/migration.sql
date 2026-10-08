-- CreateEnum
CREATE TYPE "PauseStatus" AS ENUM ('active', 'released', 'dismissed', 'expired');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "monitor_token_hash" TEXT;

-- CreateTable
CREATE TABLE "monitor_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "app_category" TEXT,
    "app_package" TEXT,
    "amount_bucket" TEXT,
    "call_enc" TEXT,
    "score" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "rules" TEXT[],
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" UUID,

    CONSTRAINT "monitor_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_pauses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "event_id" UUID,
    "status" "PauseStatus" NOT NULL,
    "rules" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "ended_by" TEXT,

    CONSTRAINT "device_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitor_events_user_id_created_at_idx" ON "monitor_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "monitor_events_severity_created_at_idx" ON "monitor_events"("severity", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "monitor_events_device_id_client_id_key" ON "monitor_events"("device_id", "client_id");

-- CreateIndex
CREATE INDEX "device_pauses_device_id_status_idx" ON "device_pauses"("device_id", "status");

-- CreateIndex
CREATE INDEX "device_pauses_user_id_status_idx" ON "device_pauses"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "devices_monitor_token_hash_key" ON "devices"("monitor_token_hash");

-- AddForeignKey
ALTER TABLE "monitor_events" ADD CONSTRAINT "monitor_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_events" ADD CONSTRAINT "monitor_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pauses" ADD CONSTRAINT "device_pauses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pauses" ADD CONSTRAINT "device_pauses_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_pauses" ADD CONSTRAINT "device_pauses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "monitor_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

