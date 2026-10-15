CREATE TABLE gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_update_id INTEGER NOT NULL,
  linea INTEGER NOT NULL DEFAULT 0,
  fecha_gasto TEXT NOT NULL,          -- 'YYYY-MM-DD' en America/Bogota
  registrado_utc TEXT NOT NULL,       -- ISO 8601
  monto INTEGER NOT NULL,             -- COP
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tarjeta TEXT,                       -- NULL = efectivo/débito | alias | 'sin_definir'
  pago_ajuste_id INTEGER,             -- pago que originó este gasto de ajuste, si aplica
  fuente_clasificacion TEXT NOT NULL, -- 'regla' | 'aprendida' | 'ia' | 'fallback' | 'manual' | 'ajuste'
  texto_original TEXT NOT NULL,
  UNIQUE (telegram_update_id, linea)
);
CREATE INDEX idx_gastos_fecha ON gastos (fecha_gasto);

CREATE TABLE pagos_tarjeta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_update_id INTEGER NOT NULL UNIQUE,
  tarjeta TEXT NOT NULL,
  monto INTEGER NOT NULL,             -- COP
  fecha_pago TEXT NOT NULL,           -- 'YYYY-MM-DD' en America/Bogota
  registrado_utc TEXT NOT NULL,
  ajuste_resuelto INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_pagos_fecha ON pagos_tarjeta (fecha_pago);

CREATE TABLE saldos_iniciales_tarjeta (
  tarjeta TEXT PRIMARY KEY,
  monto INTEGER NOT NULL,             -- COP, deuda al empezar a usar el bot
  actualizado_utc TEXT NOT NULL
);

CREATE TABLE aprendizaje (
  concepto_normalizado TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  actualizado_utc TEXT NOT NULL
);

CREATE TABLE config (
  clave TEXT PRIMARY KEY,             -- ej. 'tope_mensual'
  valor TEXT NOT NULL
);

CREATE TABLE alertas_enviadas (
  periodo TEXT NOT NULL,              -- 'YYYY-MM'
  umbral INTEGER NOT NULL,            -- 80 | 100
  enviado_utc TEXT NOT NULL,
  PRIMARY KEY (periodo, umbral)
);

CREATE TABLE informes_enviados (
  periodo TEXT PRIMARY KEY,           -- 'YYYY-MM'
  enviado_utc TEXT NOT NULL
);

CREATE TABLE updates_procesados (
  update_id INTEGER PRIMARY KEY,
  recibido_utc TEXT NOT NULL
);
