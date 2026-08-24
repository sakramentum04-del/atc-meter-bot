// === index.js для Telegram-бота (электрик) ===
// Версия: 2.0 (с автоматическим созданием листов по месяцам)

const TelegramBot = require('node-telegram-bot-api');

const config = {
  token: '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8',
  gasUrl: 'https://script.google.com/macros/s/AKfycbyQ3-J4MP6k454rPyTZNmjwjI47DvW9ul_fB67o-73iwn2y92CkCoZEOFDsW9ZM2BUfGg/exec'
};

const bot = new TelegramBot(config.token, { polling: true });
const userStates = {};

// Вспомогательная функция для POST-запроса к GAS
async function saveToGAS(data) {
  const response = await fetch(config.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(data)
  });
  return await response.json();
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    // Создаём/получаем лист месяца через init
    const response = await fetch(`${config.gasUrl}?action=init`);
    const result = await response.json();
    if (result.success) {
      await bot.sendMessage(chatId, `✅ Лист "${result.month}" готов.\n\nНачинаем обход.\nОтправьте /next для начала.`);
      
      // Получаем данные маршрута через list
      const routeResponse = await fetch(`${config.gasUrl}?action=list`);
      const routeResult = await routeResponse.json();
      if (routeResult.success) {
        const route = routeResult.data.map((row, index) => ({
          room: row[0] || '',
          meter: row[1] || '',
          address: row[2] || '',
          sheetRow: index + 3
        })).filter(p => p.room);
        userStates[chatId] = { route: route, currentIndex: 0, currentRow: null };
        await bot.sendMessage(chatId, `Маршрут загружен: ${route.length} точек.\nНажмите /next для первой точки.`);
      }
    } else {
      await bot.sendMessage(chatId, `❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`);
    }
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Ошибка соединения: ${error.message}`);
  }
});

bot.onText(/\/next/, async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  if (!state || !state.route) return bot.sendMessage(chatId, 'Сначала нажмите /start');
  if (state.currentIndex >= state.route.length) return bot.sendMessage(chatId, '🎉 Обход завершён!');
  const point = state.route[state.currentIndex];
  state.currentRow = point;
  await bot.sendMessage(chatId, `📍 Точка ${state.currentIndex + 1}/${state.route.length}\n\n🏢 ${point.room}\n🔢 № счётчика: ${point.meter}\n\nОтправьте показания или фото.`);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  if (msg.text && msg.text.startsWith('/')) return;
  if (!state || !state.currentRow) return bot.sendMessage(chatId, 'Сначала нажмите /start, затем /next');
  try {
    const month = new Date().toLocaleString('ru-RU', { month: 'long' }) + ' ' + new Date().getFullYear();
    const monthName = month.charAt(0).toUpperCase() + month.slice(1);
    
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      const fileLink = await bot.getFileLink(photo.file_id);
      const reading = msg.caption || '';
      const data = {
        step: state.currentRow.sheetRow - 2,
        reading: reading,
        photoUrl: fileLink,
        month: monthName
      };
      const result = await saveToGAS(data);
      if (result.success) {
        await bot.sendMessage(chatId, `✅ Сохранено для: ${state.currentRow.room}\n📸 Фото + ${reading ? 'показания: ' + reading : ''}\n\nНажмите /next.`);
        state.currentIndex++;
        state.currentRow = null;
      } else {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
      }
      return;
    }
    if (msg.text) {
      const reading = msg.text.trim().replace('.', ',');
      const data = {
        step: state.currentRow.sheetRow - 2,
        reading: reading,
        month: monthName
      };
      const result = await saveToGAS(data);
      if (result.success) {
        await bot.sendMessage(chatId, `✅ Показания сохранены: ${reading}\nДля: ${state.currentRow.room}\n\nНажмите /next.`);
        state.currentIndex++;
        state.currentRow = null;
      } else {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
      }
    }
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  if (!state) return bot.sendMessage(chatId, 'Нет активного обхода. Нажмите /start');
  await bot.sendMessage(chatId, `📊 Статус:\n✅ Собрано: ${state.currentIndex}/${state.route.length}\n📈 Прогресс: ${Math.round(state.currentIndex/state.route.length*100)}%`);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `/start — начать обход\n/next — следующая точка\n/status — прогресс\n/help — справка`);
});

console.log('Бот запущен...');
