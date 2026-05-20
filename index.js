const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Токен бота
const token = '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8';

// URL Google Apps Script
const GAS_URL = 'https://script.google.com/macros/s/AKfycby0Wr4Ydd01nQot6ZDCC7hBiLTBLUYQWZeCHPoq-1mPlm2K0wSc0HlRG3g30ARNfzsF6A/exec';

// Создаём бота
const bot = new TelegramBot(token, { polling: true });

// Хранилище сессий пользователей
const userSessions = new Map();

// ============================================
// ФУНКЦИЯ ОТПРАВКИ В GOOGLE SHEETS
// ============================================
async function sendToSheet(step, reading, photoUrl) {
  
  // Заменяем точку на запятую на всякий случай
  let fixedReading = String(reading).replace('.', ',');
  
  const data = {
    step: step,
    reading: fixedReading,
    photoUrl: photoUrl || ''
  };
  
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    console.log('✅ Ответ от GAS:', JSON.stringify(result));
    return result;
    
  } catch (error) {
    console.error('❌ Ошибка отправки в GAS:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// ФУНКЦИЯ ПОЛУЧЕНИЯ ДАННЫХ ИЗ GOOGLE SHEETS
// ============================================
async function getFromSheet(action = 'list') {
  try {
    const response = await fetch(`${GAS_URL}?action=${action}`);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Ошибка получения данных:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// КОМАНДА /start
// ============================================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Приветственное сообщение
  await bot.sendMessage(chatId, 
    '👋 *Привет! Я бот для учёта показаний счётчиков*\n\n' +
    '📋 *Доступные команды:*\n' +
    '/start - Показать это меню\n' +
    '/list - Показать все точки маршрута\n' +
    '/step N - Показать информацию о шаге N (1-38)\n' +
    '/set N ПОКАЗАНИЯ - Записать показания для шага N\n\n' +
    '📸 *Как работать:*\n' +
    '1️⃣ Нажми "Начать обход" ниже\n' +
    '2️⃣ Сфотографируй счётчик\n' +
    '3️⃣ Введи показания через запятую\n\n' +
    '⚠️ *Важно:* Показания вводи через ЗАПЯТУЮ, а не точку!\n' +
    '✅ Пример: 150,5\n' +
    '❌ Неправильно: 150.5',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['📋 Начать обход']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
  );
});

// ============================================
// КОМАНДА /list
// ============================================
bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  
  const result = await getFromSheet('list');
  
  if (result.success && result.data) {
    let message = '📋 *Все точки маршрута:*\n\n';
    
    result.data.forEach((row, index) => {
      const step = index + 1;
      const room = row[1] || 'Не указано';
      const meter = row[2] || 'Не указан';
      const reading = row[3] || '❌ Не записано';
      
      message += `*Шаг ${step}:* ${room}\n`;
      message += `Счётчик: ${meter}\n`;
      message += `Показания: ${reading}\n\n`;
    });
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } else {
    await bot.sendMessage(chatId, '❌ Ошибка получения данных');
  }
});

// ============================================
// КОМАНДА /step N
// ============================================
bot.onText(/\/step (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const stepNum = parseInt(match[1]);
  
  if (stepNum < 1 || stepNum > 38) {
    return bot.sendMessage(chatId, '❌ Шаг должен быть от 1 до 38');
  }
  
  const result = await getFromSheet('step_' + stepNum);
  
  if (result.success && result.data) {
    const row = result.data;
    const message = 
      `📍 *Шаг ${stepNum}*\n\n` +
      `🏠 Помещение: ${row[1] || 'Не указано'}\n` +
      `🔢 № счётчика: ${row[2] || 'Не указан'}\n` +
      `📊 Показания: ${row[3] || '❌ Не записано'}\n` +
      `📸 Фото: ${row[4] ? '✅ Есть' : '❌ Нет'}`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } else {
    await bot.sendMessage(chatId, '❌ Ошибка получения данных');
  }
});

// ============================================
// КОМАНДА /set N ПОКАЗАНИЯ
// ============================================
bot.onText(/\/set (\d+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const stepNum = parseInt(match[1]);
  const reading = match[2].trim();
  
  if (stepNum < 1 || stepNum > 38) {
    return bot.sendMessage(chatId, '❌ Шаг должен быть от 1 до 38');
  }
  
  // 🚫 ПРОВЕРКА НА ТОЧКУ
  if (reading.includes('.')) {
    return bot.sendMessage(chatId, 
      '❌ *Ошибка:* Используйте ЗАПЯТУЮ, а не точку!\n\n' +
      '✅ Пример: 150,5\n' +
      '❌ Неправильно: 150.5',
      { parse_mode: 'Markdown' }
    );
  }
  
  const result = await sendToSheet(stepNum, reading, '');
  
  if (result.success) {
    await bot.sendMessage(chatId, `✅ Шаг ${stepNum}: показания ${reading} записаны!`);
  } else {
    await bot.sendMessage(chatId, '❌ Ошибка записи в таблицу');
  }
});

// ============================================
// ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ (не команд)
// ============================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Пропускаем команды
  if (text && text.startsWith('/')) return;
  
  // --- КНОПКА "Начать обход" ---
  if (text === '📋 Начать обход') {
    
    // Создаём сессию для пользователя
    userSessions.set(chatId, {
      currentStep: 1,
      lastPhotoUrl: null
    });
    
    return bot.sendMessage(chatId, 
      '✅ *Начинаем обход!*\n\n' +
      '📍 Шаг 1 из 38\n\n' +
      '1️⃣ Сфотографируй счётчик\n' +
      '2️⃣ Отправь фото\n' +
      '3️⃣ После фото введи показания через ЗАПЯТУЮ\n\n' +
      '⚠️ Не используй точку!',
      { parse_mode: 'Markdown' }
    );
  }
  
  // Проверяем, есть ли активная сессия
  const userData = userSessions.get(chatId);
  if (!userData || !userData.currentStep) return;
  
  // Если это ввод показаний (после фото)
  if (userData.waitingForReading) {
    
    // 🚫 ПРОВЕРКА НА ТОЧКУ
    if (text.includes('.')) {
      return bot.sendMessage(chatId, 
        '❌ *Ошибка:* Введите показания через ЗАПЯТУЮ!\n\n' +
        '✅ Пример: 150,5\n' +
        '❌ Неправильно: 150.5\n\n' +
        'Попробуйте ещё раз:',
        { parse_mode: 'Markdown' }
      );
    }
    
    const reading = text.trim();
    const step = userData.currentStep;
    
    // Отправляем в GAS
    const result = await sendToSheet(step, reading, userData.lastPhotoUrl);
    
    if (result.success) {
      await bot.sendMessage(chatId, `✅ *Шаг ${step}:* ${reading} — записано!`, { parse_mode: 'Markdown' });
      
      // Переход к следующему шагу
      if (step < 38) {
        userData.currentStep = step + 1;
        userData.waitingForReading = false;
        userData.lastPhotoUrl = null;
        
        return bot.sendMessage(chatId, 
          `📍 *Шаг ${step + 1} из 38*\n\n` +
          'Сфотографируй счётчик и отправь фото',
          { parse_mode: 'Markdown' }
        );
      } else {
        // Завершение обхода
        userSessions.delete(chatId);
        return bot.sendMessage(chatId, 
          '🎉 *Обход завершён!*\n\n' +
          'Все 38 шагов записаны.\n' +
          'Спасибо за работу!',
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      return bot.sendMessage(chatId, '❌ Ошибка записи. Попробуйте ещё раз:');
    }
  }
});

// ============================================
// ОБРАБОТКА ФОТОГРАФИЙ
// ============================================
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userData = userSessions.get(chatId);
  
  if (!userData || !userData.currentStep) {
    return bot.sendMessage(chatId, 'Сначала нажми "📋 Начать обход"');
  }
  
  // Получаем ID фото
  const photoId = msg.photo[msg.photo.length - 1].file_id;
  
  // Получаем ссылку на фото
  const fileLink = await bot.getFileLink(photoId);
  
  // Сохраняем ссылку в сессию
  userData.lastPhotoUrl = fileLink;
  userData.waitingForReading = true;
  
  await bot.sendMessage(chatId, 
    `✅ Фото получено!\n\n` +
    `Теперь введи показания для шага ${userData.currentStep}\n` +
    `⚠️ Через ЗАПЯТУЮ, пример: 150,5`
  );
});

// ============================================
// ЗАПУСК ВЕБ-СЕРВЕРА (для Render)
// ============================================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'atc_meter_bot',
    version: '1.0.0'
  });
});

app.listen(port, () => {
  console.log(`🚀 Бот запущен на порту ${port}`);
  console.log(`🤖 @atc_meter_bot`);
});

// ============================================
// ОБРАБОТКА ОШИБОК
// ============================================
process.on('unhandledRejection', (error) => {
  console.error('❌ Необработанная ошибка:', error);
});
