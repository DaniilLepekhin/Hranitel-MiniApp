import { config } from './src/config/index';
console.log('TELEGRAM_BOT_TOKEN:', config.TELEGRAM_BOT_TOKEN ? 'EXISTS (length: ' + config.TELEGRAM_BOT_TOKEN.length + ')' : 'EMPTY');
console.log('First 20 chars:', config.TELEGRAM_BOT_TOKEN?.substring(0, 20));
