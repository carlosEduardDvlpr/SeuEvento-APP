-- §8.1: o Prisma não expressa exclusion constraint, então este SQL é manual.
--
-- Impede duas reservas ativas (PENDING/CONFIRMED) com dias em comum. É a única
-- defesa que funciona sob concorrência: duas requisições simultâneas para a
-- mesma data não conseguem "ler livre, escrever ocupado", porque o próprio
-- Postgres rejeita a segunda inserção.
--
-- O range é inclusivo nas duas pontas ('[]'), como manda a §7.3: uma reserva com
-- startDate = endDate ocupa um dia.
--
-- Não precisa da extensão btree_gist: ela só seria necessária para combinar o
-- range com igualdade escalar (ex.: WITH = em uma coluna de unidade). Há uma
-- chácara só, então o índice GiST sobre a coluna de range basta.
--
-- CANCELLED e COMPLETED ficam fora do predicado: data cancelada volta a ser
-- reservável, e reserva concluída não impede a mesma data no ano seguinte.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (daterange("startDate", "endDate", '[]') WITH &&)
  WHERE (status IN ('PENDING', 'CONFIRMED'));

-- Guarda de sanidade: sem isso, um endDate anterior ao startDate produziria um
-- daterange vazio, que não conflita com nada e furaria a constraint acima.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_dates_order CHECK ("endDate" >= "startDate");
