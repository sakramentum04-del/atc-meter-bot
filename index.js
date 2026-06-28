// === index.js для Telegram-бота (электрик) ===
// Версия: 2.0 (с автоматическим созданием листов по месяцам)

const TelegramBot = require('node-telegram-bot-api');

const config = {
  token: '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8',
  gasUrl: 'https://script.google.com/macros/s/AKfycby0Wr4Ydd01nQot6ZDCC7hBiLTBLUYQWZeCHPoq-1mPlm2K0wSc0HlRG3g30ARNfzsF6A/exec'
};

const bot = new TelegramBot(config.token, { polling: true });
const userStates = {};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const response = await fetch(`${config.gasUrl}?action=createMonth`);
    const result = await response.json();
    if (result.success) {
      await bot.sendMessage(chatId, `✅ Создан лист: "${result.sheetName}"\n\nНачинаем обход.\nОтправьте /next для начала.`);
      const routeResponse = await fetch(`${config.gasUrl}?action=getRoute`);
      const routeResult = await routeResponse.json();
      if (routeResult.success) {
        userStates[chatId] = { route: routeResult.route, currentIndex: 0, currentRow: null };
        await bot.sendMessage(chatId, `Маршрут загружен: ${routeResult.total} точек.\nНажмите /next для первой точки.`);
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
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      const fileLink = await bot.getFileLink(photo.file_id);
      const reading = msg.caption || '';
      const saveUrl = `${config.gasUrl}?action=savePhoto&row=${state.currentRow.sheetRow}&photoUrl=${encodeURIComponent(fileLink)}&meterReading=${encodeURIComponent(reading)}`;
      const response = await fetch(saveUrl);
      const result = await response.json();
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
      let reading = msg.text.trim().replace('.', ',');
      const saveUrl = `${config.gasUrl}?action=savePhoto&row=${state.currentRow.sheetRow}&meterReading=${encodeURIComponent(reading)}`;
      const response = await fetch(saveUrl);
      const result = await response.json();
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
