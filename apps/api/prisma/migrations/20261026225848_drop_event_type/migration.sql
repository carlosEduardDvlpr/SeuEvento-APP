-- O tipo de evento sai da reserva, a pedido do dono: a pergunta não fazia
-- sentido no pedido. Nenhum índice ou constraint usa a coluna, e o enum só
-- existia para ela. O tipo das reservas já gravadas se perde junto.

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "eventType";

-- DropEnum
DROP TYPE "EventType";
