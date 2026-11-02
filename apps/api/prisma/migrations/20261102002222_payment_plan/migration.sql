-- §9.11: plano de pagamento da reserva, com o sinal e as parcelas.
--
-- É controle do dono, não pagamento online: o cliente paga por fora (Pix,
-- dinheiro) e o dono anota aqui o que vence e o dia em que recebeu. Cada linha é
-- um recebimento, e a reserva não muda: o total contratado continua no snapshot
-- dela (§2.1), e o plano só divide esse total no tempo.

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'INSTALLMENT');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_dueDate_idx" ON "Payment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_number_key" ON "Payment"("bookingId", "number");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O Prisma não expressa CHECK constraint, então as três abaixo são manuais, como
-- a exclusion constraint da §8.1. A API confere tudo isso antes de gravar; aqui
-- fica a última linha de defesa, para que nenhum outro caminho (script, console,
-- bug) grave um plano que o painel não saberia mostrar.

-- Recebimento de zero ou negativo não existe: seria uma parcela vazia na soma
-- que precisa bater com o total da reserva.
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK ("amountCents" > 0);

-- O sinal é o 0, e as parcelas vão de 1 a 12 (`MAX_INSTALLMENTS`).
ALTER TABLE "Payment" ADD CONSTRAINT payment_number_range CHECK ("number" BETWEEN 0 AND 12);

-- O número 0 é do sinal, e só dele. Junto com o índice único de
-- ("bookingId", "number"), isso também garante no máximo um sinal por reserva.
ALTER TABLE "Payment" ADD CONSTRAINT payment_deposit_is_number_zero CHECK (("kind" = 'DEPOSIT') = ("number" = 0));
