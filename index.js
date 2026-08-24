// === index.js для Telegram-бота (электрик) ===
const TelegramBot = require('node-telegram-bot-api');

const config = {
  token: '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8',
  gasUrl: 'https://script.google.com/macros/s/AKfycbyQ3-J4MP6k454rPyTZNmjwjI47DvW9ul_fB67o-73iwn2y92CkCoZEOFDsW9ZM2BUfGg/exec'
};

const bot = new TelegramBot(config.token, { polling: true });

// Отправка данных в GAS
async function callGAS(payload) {
  const res = await fetch(config.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

// /start — просим текущий шаг
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const result = await callGAS({ action: 'getStatus' });
    await bot.sendMessage(chatId, result.text || 'Начните обход');
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

// /next — тоже текущий шаг
bot.onText(/\/next/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const result = await callGAS({ action: 'getStatus' });
    await bot.sendMessage(chatId, result.text || 'Начните обход');
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

// Приём показаний и фото
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (msg.text && msg.text.startsWith('/')) return;

  try {
    let value = '';
    let fileUrl = '';

    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      fileUrl = await bot.getFileLink(photo.file_id);
      value = (msg.caption || '').trim();
    } else if (msg.text) {
      value = msg.text.trim();
    }

    const cleaned = value.replace(',', '.');
    if (cleaned !== '' && isNaN(parseFloat(cleaned))) {
      await bot.sendMessage(chatId, '❌ Показания должны быть числом.\n\nНапример: 12345,6');
      return;
    }

    const result = await callGAS({ action: 'saveData', value: value, fileUrl: fileUrl });
    await bot.sendMessage(chatId, result.text || 'Готово');
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

// /status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const result = await callGAS({ action: 'getStatus' });
    await bot.sendMessage(chatId, result.text || 'Начните обход');
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '/start — начать обход\n/next — следующий шаг\n/status — прогресс\n/help — справка');
});

console.log('Бот запущен...');
