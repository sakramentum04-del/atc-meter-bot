// === index.js ===
const TelegramBot = require('node-telegram-bot-api');

const config = {
  token: '8637514542:AAHwv9cq4es0DKWAiv1ttGWDjXk8khN4Qro',
  gasUrl: 'https://script.google.com/macros/s/AKfycbwOfqftMs3fuAcIYtwVV99sTDf_tC4OjE3L82R4S4C1gr554ygGPG6ThVK9a3Tea6Kp/exec'
};

const bot = new TelegramBot(config.token, { polling: true });

async function callGAS(payload) {
  const res = await fetch(config.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const result = await callGAS({ action: 'getStatus', chatId: chatId });
    await bot.sendMessage(chatId, result.text || 'Начните обход');
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

bot.onText(/\/next/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const result = await callGAS({ action: 'getStatus', chatId: chatId });
    await bot.sendMessage(chatId, result.text || 'Начните обход');
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

bot.onText(/\/id/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await callGAS({ action: 'getChatId', chatId: chatId });
  await bot.sendMessage(chatId, result.text || 'chat_id: ' + chatId);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (msg.text && msg.text.startsWith('/')) return;
  try {
    if (msg.text && !msg.photo) {
      await bot.sendMessage(chatId, '📸 Пришлите ФОТО счётчика и укажите показания в подписи.');
      return;
    }
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      const fileUrl = await bot.getFileLink(photo.file_id);
      const value = (msg.caption || '').trim();
      const cleaned = value.replace(',', '.');
      if (cleaned === '' || isNaN(parseFloat(cleaned))) {
        await bot.sendMessage(chatId, '⚠️ В подписи к фото укажите показания числом. Например: "12345,6"');
        return;
      }
      const result = await callGAS({ action: 'saveData', value: value, fileUrl: fileUrl, chatId: chatId });
      await bot.sendMessage(chatId, result.text || 'Готово');
    }
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const result = await callGAS({ action: 'getStatus', chatId: chatId });
    await bot.sendMessage(chatId, result.text || 'Начните обход');
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Ошибка: ' + err.message);
  }
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '/start — начать обход\n/next — следующий шаг\n/status — прогресс\n/id — ваш ID\n/help — справка');
});

console.log('Бот запущен...');
