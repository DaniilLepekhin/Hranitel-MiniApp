const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = 467650086; // Изабелла

// Отправим тестовое сообщение чтобы проверить что работает
const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: '🧪 Тест: попробуй перейти по этой ссылке\n\nhttps://t.me/SuccessKODBot?start=women_test',
    parse_mode: 'HTML'
  })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
