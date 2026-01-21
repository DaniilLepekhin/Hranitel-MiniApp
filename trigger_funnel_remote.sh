#!/bin/bash

# Скрипт для запуска воронки после оплаты на удаленном сервере

ssh root@2.58.98.41 << 'ENDSSH'
cd /root/club_hranitel/backend

# Создаем временный скрипт на сервере
cat > /tmp/trigger_funnel.mjs << 'EOF'
import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const TARGET_TG_ID = '389209990';

// Читаем конфиг
const envContent = readFileSync('/root/club_hranitel/backend/.env', 'utf-8');
const DATABASE_URL = envContent
  .split('\n')
  .find(line => line.startsWith('DATABASE_URL='))
  ?.split('=')[1]
  ?.trim();

const TELEGRAM_BOT_TOKEN = envContent
  .split('\n')
  .find(line => line.startsWith('TELEGRAM_BOT_TOKEN='))
  ?.split('=')[1]
  ?.trim()
  ?.replace(/['"]/g, '');

console.log('🔍 Checking configuration...');
console.log('DATABASE_URL:', DATABASE_URL ? 'Found' : 'NOT FOUND');
console.log('BOT_TOKEN:', TELEGRAM_BOT_TOKEN ? 'Found' : 'NOT FOUND');

if (!DATABASE_URL || !TELEGRAM_BOT_TOKEN) {
  console.error('❌ Missing configuration');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Find user
    const result = await client.query(
      'SELECT id, telegram_id, first_name, username, onboarding_step, is_pro FROM users WHERE telegram_id = $1',
      [TARGET_TG_ID]
    );

    if (result.rows.length === 0) {
      console.error(\`❌ User with Telegram ID \${TARGET_TG_ID} not found\`);
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('✅ Found user:', {
      id: user.id,
      telegram_id: user.telegram_id,
      first_name: user.first_name,
      username: user.username,
      onboarding_step: user.onboarding_step,
      is_pro: user.is_pro
    });

    // Update onboarding step
    await client.query(
      "UPDATE users SET onboarding_step = 'awaiting_keyword', updated_at = NOW() WHERE telegram_id = $1",
      [TARGET_TG_ID]
    );
    console.log('✅ Updated onboarding_step to awaiting_keyword');

    // Отправляем сообщение через API
    const chatId = parseInt(TARGET_TG_ID);
    const message = encodeURIComponent(
      '«Ты начинаешь погружение в <b>«Код успеха. Глава: Пробуждение»</b> ✨\\n\\n' +
      'Чтобы двери нашей экосистемы открылись, тебе нужно принять её правила.\\n\\n' +
      '🎥 Посмотри видео Кристины <b>до самого конца.</b> Кристина расскажет, как устроена наша Вселенная: где искать ключи, как работает супер-апп и как найти свою стаю 😄 (чаты городов и десятки).\\n\\n' +
      '<b>🗝 Внимание: внутри видео спрятан секретный Ключ (кодовое слово). Без него я не смогу выдать тебе доступы к материалам и закрытым чатам.</b>\\n\\n' +
      'Смотри внимательно. <i>Как только услышишь слово — пиши его мне в ответ 👇🏼</i>»'
    );

    const url = \`https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=\${chatId}&text=\${message}&parse_mode=HTML\`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.ok) {
      console.log('✅ First message sent successfully!');
      console.log('📬 User should now enter the keyword "УСПЕХ"');
    } else {
      console.error('❌ Failed to send message:', data);
    }

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await client.end();
    process.exit(1);
  }
}

main();
EOF

# Запускаем скрипт
node /tmp/trigger_funnel.mjs

# Удаляем временный файл
rm /tmp/trigger_funnel.mjs

ENDSSH
