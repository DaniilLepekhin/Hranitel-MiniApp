-- Добавление недостающих товаров в магазин согласно ТЗ "Геймификация"
-- 1. "Билет на Розыгрыш Разбора" — 2000 EP, категория elite, тип raffle_ticket
-- 2. "Секретная медитация (Тайная комната)" — 3500 EP, категория secret, тип lesson

INSERT INTO shop_items (id, title, description, category, price, item_type, item_data, is_active, sort_order, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    'Билет на Розыгрыш Разбора',
    'Билет для участия в розыгрыше персонального разбора от Кристины. Чем больше билетов — тем выше шанс!',
    'elite',
    2000,
    'raffle_ticket',
    '{"type": "raffle", "event": "personal_review"}',
    true,
    10,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'Секретная медитация (Тайная комната)',
    'Эксклюзивная медитация, доступная только через магазин Энергии. Погрузись в тайную комнату.',
    'secret',
    3500,
    'lesson',
    '{"type": "meditation", "access": "secret_room"}',
    true,
    20,
    NOW(),
    NOW()
  )
ON CONFLICT DO NOTHING;
