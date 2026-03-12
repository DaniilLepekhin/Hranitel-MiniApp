-- Migration: добавить lavatop_contract_id в users
-- contractId первого платежа LavaTop — аналог lava_contact_id для старого Lava
ALTER TABLE users ADD COLUMN IF NOT EXISTS lavatop_contract_id TEXT;

-- Заполнить из существующих платежей: берём contractId самого раннего платежа LavaTop для каждого пользователя
UPDATE users u
SET lavatop_contract_id = p.external_payment_id
FROM (
  SELECT DISTINCT ON (user_id)
    user_id,
    external_payment_id
  FROM payments
  WHERE payment_provider = 'lavatop'
    AND status = 'completed'
  ORDER BY user_id, created_at ASC
) p
WHERE u.id = p.user_id
  AND u.lavatop_contract_id IS NULL;
