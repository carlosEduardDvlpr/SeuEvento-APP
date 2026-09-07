CREATE TYPE reservation_status AS ENUM ('ORCAMENTO', 'AGUARDANDO_SINAL', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO');

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests SMALLINT NOT NULL CHECK (guests > 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
  deposit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  status reservation_status NOT NULL DEFAULT 'ORCAMENTO',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_in < check_out)
);

CREATE INDEX reservations_dates_idx ON reservations (check_in, check_out);
CREATE INDEX reservations_status_idx ON reservations (status);

-- O bloqueio ocorre também no banco, protegendo contra duas requisições simultâneas.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (daterange(check_in, check_out, '[)') WITH &&)
  WHERE (status <> 'CANCELADO');

INSERT INTO clients (id, name, phone) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Mariana Costa', '(11) 99999-0021'),
  ('22222222-2222-2222-2222-222222222222', 'Família Oliveira', '(11) 98888-1040'),
  ('33333333-3333-3333-3333-333333333333', 'Ana Beatriz', '(11) 97777-4358');

INSERT INTO reservations (client_id, check_in, check_out, guests, total, deposit, status) VALUES
  ('11111111-1111-1111-1111-111111111111', '2026-09-12', '2026-09-14', 18, 2800, 840, 'CONFIRMADO'),
  ('22222222-2222-2222-2222-222222222222', '2026-09-19', '2026-09-20', 12, 1500, 0, 'AGUARDANDO_SINAL'),
  ('33333333-3333-3333-3333-333333333333', '2026-09-26', '2026-09-28', 24, 3400, 1020, 'CONFIRMADO');
