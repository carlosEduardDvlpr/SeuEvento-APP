CREATE TYPE "reservation_status" AS ENUM ('ORCAMENTO', 'AGUARDANDO_SINAL', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO');

CREATE TABLE "clients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(30) NOT NULL,
  "email" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clients_phone_key" ON "clients"("phone");

CREATE TABLE "reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "check_in" DATE NOT NULL,
  "check_out" DATE NOT NULL,
  "guests" SMALLINT NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" "reservation_status" NOT NULL DEFAULT 'ORCAMENTO',
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reservations_dates_valid" CHECK ("check_in" < "check_out"),
  CONSTRAINT "reservations_guests_positive" CHECK ("guests" > 0),
  CONSTRAINT "reservations_total_nonnegative" CHECK ("total" >= 0),
  CONSTRAINT "reservations_deposit_nonnegative" CHECK ("deposit" >= 0)
);

CREATE INDEX "reservations_dates_idx" ON "reservations"("check_in", "check_out");
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (daterange("check_in", "check_out", '[)') WITH &&)
  WHERE ("status" <> 'CANCELADO');
