// === index.js ===
const TelegramBot = require('node-telegram-bot-api');

const config = {
  token: '8637514542:AAHwv9cq4es0DKWAiv1ttGWDjXk8khN4Qro',
  gasUrl: 'https://script.google.com/macros/s/AKfycbxhMN1vILI6MkBAWhV5W176wcOSAm0K7ptcF9dIit1UPHaIjJczXzRm9UWmJ-8MaYrg7A/exec'
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

// === ТЕСТ: АВТОЗАПОЛНЕНИЕ ===
bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await callGAS({ action: 'autoFill', testMode: true, chatId: chatId });
  await bot.sendMessage(chatId, result.text || 'Тест');
});

bot.onText(/\/testoff/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await callGAS({ action: 'clearTest', testMode: true, chatId: chatId });
  await bot.sendMessage(chatId, result.text || 'Тест очищен');
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
        await bot.sendMessage(chatId, '⚠️ Укажите показания числом в подписи. Например: "12345,6"');
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
  bot.sendMessage(chatId, '/start — начать обход\n/next — следующий шаг\n/status — прогресс\n/id — ваш ID\n/test — автотест (заполнит Тест_Маршрут)\n/testoff — очистить тест');
});

console.log('Бот запущен...');
