-- Novembro de 2026, a pedido da dona: cada item do catálogo passa a ser uma
-- decoração completa, com dois preços, e a reserva só de decoração diz como a
-- decoração chega à festa (§9.12).
--
-- - O item ganha o preço com a chácara, que tomou o lugar dos combos: quem
--   aluga a chácara leva a decoração por ele, e quem leva só a decoração paga
--   o avulso (`priceCents`).
-- - A reserva de decoração diz se o cliente retira na chácara ou recebe em
--   casa. Na entrega, a reserva guarda uma cópia do endereço do cliente, e a
--   taxa da entrega é combinada depois, fora do total.
-- - O cliente guarda um endereço no perfil, que é de onde sai essa cópia.

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" JSONB;

-- O preço com a chácara nasce igual ao avulso, que é o "sem promoção": nenhum
-- item muda de preço com esta migration, e a dona baixa o que quiser pelo
-- painel. A coluna entra aceitando nulo, recebe o valor e só então fica
-- obrigatória, porque um ADD COLUMN NOT NULL sem valor falharia com itens
-- já cadastrados.
ALTER TABLE "Item" ADD COLUMN     "venuePriceCents" INTEGER;

UPDATE "Item" SET "venuePriceCents" = "priceCents";

ALTER TABLE "Item" ALTER COLUMN "venuePriceCents" SET NOT NULL;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deliveryAddress" JSONB,
ADD COLUMN     "fulfillment" "FulfillmentMethod";

-- Decoração reservada antes desta migration é retirada: era o único jeito que
-- existia, e o e-mail de confirmação mandava combinar a retirada com a dona.
UPDATE "Booking" SET "fulfillment" = 'PICKUP' WHERE "kind" = 'DECORATION';

-- O Prisma não expressa CHECK constraint, então as três abaixo são manuais,
-- como as da migration `payment_plan`. A API confere tudo isso antes de gravar;
-- aqui fica a última linha de defesa, para que nenhum outro caminho (script,
-- console, bug) grave o que o site e o painel não saberiam mostrar.

-- O preço com a chácara é promoção: nunca negativo, nunca acima do avulso.
ALTER TABLE "Item" ADD CONSTRAINT item_venue_price_range CHECK ("venuePriceCents" >= 0 AND "venuePriceCents" <= "priceCents");

-- Retirada ou entrega existe na decoração, e só nela: na chácara a decoração
-- já está no lugar da festa.
ALTER TABLE "Booking" ADD CONSTRAINT booking_fulfillment_by_kind CHECK (("kind" = 'DECORATION') = ("fulfillment" IS NOT NULL));

-- O endereço copiado acompanha a entrega, e só ela. O COALESCE é o que faz a
-- chácara (sem modalidade, `fulfillment` nulo) contar como "não é entrega": sem
-- ele a comparação daria nulo, e o CHECK aceitaria um endereço sem entrega.
ALTER TABLE "Booking" ADD CONSTRAINT booking_delivery_address CHECK (COALESCE("fulfillment" = 'DELIVERY', false) = ("deliveryAddress" IS NOT NULL));
