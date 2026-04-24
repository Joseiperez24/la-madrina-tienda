-- ═══════════════════════════════════════════════════════════
--  La Madrina Forrajería — Setup de tabla de stock en Supabase
--  Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock (
  id          TEXT        PRIMARY KEY,
  nombre      TEXT        NOT NULL DEFAULT '',
  stock       INTEGER     NOT NULL DEFAULT -1,   -- -1 = sin límite, 0 = sin stock, N = unidades disponibles
  disponible  BOOLEAN     NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para que el frontend fetch sea rápido
CREATE INDEX IF NOT EXISTS idx_stock_disponible ON stock(disponible);

-- RLS: solo el backend (service key) puede escribir; lectura pública deshabilitada
-- (el frontend lee a través de /api/stock, no directo a Supabase)
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

-- Sin políticas = nadie accede directo; el backend usa la service key que bypassea RLS


-- ── Carga inicial con todos los productos ──────────────────
-- Mascotas — Cooperación
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('cooperacion_0', 'Cooperación — Cachorros Carne 15kg',        -1, true),
  ('cooperacion_1', 'Cooperación — Perros Adultos Carne 20kg',   -1, true),
  ('cooperacion_2', 'Cooperación — Perros Adultos Pollo 20kg',   -1, true),
  ('cooperacion_3', 'Cooperación — Gatos Adultos Pescado 10kg',  -1, true),
  ('cooperacion_4', 'Cooperación — Gatos Adultos Pollo 10kg',    -1, true)
ON CONFLICT (id) DO NOTHING;

-- Mascotas — PetLink
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('petlink_0', 'PetLink — Perros Adultos Med/Grandes 20+2kg',  -1, true),
  ('petlink_1', 'PetLink — Perros Adultos Peq/Mini 15kg',       -1, true),
  ('petlink_2', 'PetLink — Perros Cachorros 10kg',              -1, true),
  ('petlink_3', 'PetLink — Gatos Adultos Indoor 8kg',           -1, true)
ON CONFLICT (id) DO NOTHING;

-- Mascotas — Valor
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('valor_0', 'Valor — Perros Med/Grandes Carne 18kg',          -1, true),
  ('valor_1', 'Valor — Perros Peq/Mini Pollo 10kg',             -1, true),
  ('valor_2', 'Valor — Perros Med/Grandes Cordero 15+3kg',      -1, true),
  ('valor_3', 'Valor — Perros Peq/Mini Cordero 10kg',           -1, true),
  ('valor_4', 'Valor — Perros Cachorros Carne+Pollo 10kg',      -1, true),
  ('valor_5', 'Valor — Gatos Adultos Pescado 8kg',              -1, true),
  ('valor_6', 'Valor — Gatos Adultos Urinary Pollo 8kg',        -1, true),
  ('valor_7', 'Valor — Gatitos Kitten Pescado 8kg',             -1, true)
ON CONFLICT (id) DO NOTHING;

-- Campo — Aves
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('campo_aves_0', 'Vitosan — Parrillero Iniciador 25kg',   -1, true),
  ('campo_aves_1', 'Vitosan — Parrillero Terminador 25kg',  -1, true),
  ('campo_aves_2', 'Vitosan — Gallina Ponedora 25kg',       -1, true),
  ('campo_aves_3', 'Vitosan — Gallina Recría 25kg',         -1, true)
ON CONFLICT (id) DO NOTHING;

-- Campo — Cerdos
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('campo_cerdos_0', 'Vitosan — Cerdo Iniciador 25kg',     -1, true),
  ('campo_cerdos_1', 'Vitosan — Cerdo Desarrollo 25kg',    -1, true),
  ('campo_cerdos_2', 'Vitosan — Cerdo Terminador 25kg',    -1, true),
  ('campo_cerdos_3', 'Vitosan — Cerda Lactancia 25kg',     -1, true),
  ('campo_cerdos_4', 'Vitosan — Cerda Gestación 25kg',     -1, true)
ON CONFLICT (id) DO NOTHING;

-- Campo — Equinos
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('campo_equinos_0', 'Vitosan — Equino Potrillo 25kg',    -1, true),
  ('campo_equinos_1', 'Vitosan — Equino Training 25kg',    -1, true)
ON CONFLICT (id) DO NOTHING;

-- Campo — Caprinos
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('campo_caprinos_0', 'Vitosan — Caprino 25kg',           -1, true)
ON CONFLICT (id) DO NOTHING;

-- Campo — Conejos
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('campo_conejos_0', 'Vitosan — Conejo Engorde 25kg',     -1, true)
ON CONFLICT (id) DO NOTHING;

-- Forrajes
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('forrajes_0', 'Fardos de alfalfa',   -1, true),
  ('forrajes_1', 'Rollos de alfalfa',   -1, true),
  ('forrajes_2', 'Avena',               -1, true),
  ('forrajes_3', 'Maíz partido',        -1, true)
ON CONFLICT (id) DO NOTHING;

-- Camas
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('camas_0', 'Bolsas de viruta',          0, false),
  ('camas_1', 'Rollos de paja de trigo',   0, false)
ON CONFLICT (id) DO NOTHING;

-- Talabartería
INSERT INTO stock (id, nombre, stock, disponible) VALUES
  ('talabarteria_0',  'Bozal de cuero crudo artesanal',    0, false),
  ('talabarteria_1',  'Bozal de suela',                    0, false),
  ('talabarteria_2',  'Bozal de hilo trenzado',            0, false),
  ('talabarteria_3',  'Bozal de material sintético',       0, false),
  ('talabarteria_4',  'Bozal de hebilla',                  0, false),
  ('talabarteria_5',  'Freno de hierro',                   0, false),
  ('talabarteria_6',  'Freno de acero inoxidable',         0, false),
  ('talabarteria_7',  'Cabezada de cuero crudo artesanal', 0, false),
  ('talabarteria_8',  'Cabezada de suela',                 0, false),
  ('talabarteria_9',  'Lazo de cuero crudo artesanal',     0, false),
  ('talabarteria_10', 'Mandil de lana',                    0, false),
  ('talabarteria_11', 'Bajera de lona',                    0, false)
ON CONFLICT (id) DO NOTHING;
