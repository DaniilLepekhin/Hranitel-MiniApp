-- Migration 0019: Create lavatop_offers table
-- Stores all LavaTop offer UUIDs so they can be managed without redeployment.
-- key is a human-readable slug used in API calls (e.g. 'monthly_rub_2000', 'gift_rub_990').

CREATE TABLE IF NOT EXISTS lavatop_offers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL,                      -- slug: monthly_rub_2000, one_time_usd_29 etc.
  offer_id    TEXT NOT NULL,                      -- UUID from LavaTop dashboard
  label       TEXT NOT NULL,                      -- human readable: "Подписка 1 месяц (2000 ₽)"
  currency    TEXT NOT NULL DEFAULT 'RUB',        -- RUB | USD | EUR
  periodicity TEXT NOT NULL DEFAULT 'ONE_TIME',   -- ONE_TIME | MONTHLY | PERIOD_90_DAYS | PERIOD_180_DAYS
  amount      NUMERIC(10,2),                      -- display only, actual price in LavaTop
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_gift     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lavatop_offers_key_idx ON lavatop_offers (key);
CREATE INDEX IF NOT EXISTS lavatop_offers_active_idx ON lavatop_offers (is_active);
