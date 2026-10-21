-- T32: reserva só de decoração (pegue e monte sem a chácara).
--
-- A chácara e a decoração são dois produtos da mesma dona, e a decoração também
-- sai sozinha, para festa em outro lugar. Esta migration dá a cada reserva o
-- produto que ela contrata e restringe a regra de "uma reserva por data" à
-- chácara, que é o único produto que ocupa a data.

-- CreateEnum
CREATE TYPE "BookingKind" AS ENUM ('VENUE', 'DECORATION');

-- CreateEnum
CREATE TYPE "BlockScope" AS ENUM ('VENUE', 'DECORATION', 'BOTH');

-- Bloqueio que já existia fecha a chácara, e continua fechando só a chácara: era
-- o único significado possível antes desta migration.
ALTER TABLE "BlockedDate" ADD COLUMN     "scope" "BlockScope" NOT NULL DEFAULT 'VENUE';

-- Reserva que já existia é de chácara. `guestCount` passa a aceitar nulo porque
-- reserva de decoração não recebe convidados; a de chácara continua exigindo o
-- número, e quem garante isso é a validação da API.
ALTER TABLE "Booking" ADD COLUMN     "kind" "BookingKind" NOT NULL DEFAULT 'VENUE',
ALTER COLUMN "guestCount" DROP NOT NULL;

-- A exclusion constraint da §8.1 passa a valer só para a chácara.
--
-- Antes ela recusava qualquer par de reservas ativas com dias em comum. Com a
-- decoração, isso estaria errado nos dois sentidos: uma retirada de decoração
-- tiraria a data da chácara do site, e uma festa na chácara impediria alguém de
-- levar um kit para outro lugar no mesmo dia. O que a decoração disputa é
-- **estoque**, não data — e estoque é contado por item e por dia, com as linhas
-- de `Item` travadas na transação (§9.3).
--
-- Drop e create na mesma transação da migration: não existe janela em que a
-- tabela fique sem a regra.
ALTER TABLE "Booking" DROP CONSTRAINT booking_no_overlap;

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (daterange("startDate", "endDate", '[]') WITH &&)
  WHERE (status IN ('PENDING', 'CONFIRMED') AND kind = 'VENUE');
