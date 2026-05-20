const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8';
const GAS_URL = 'https://script.google.com/macros/s/AKfycby0Wr4Ydd01nQot6ZDCC7hBiLTBLUYQWZeCHPoq-1mPlm2K0wSc0HlRG3g30ARNfzsF6A/exec';

const bot = new TelegramBot(token, { polling: true });
const userSessions = new Map();

// ============================================
// ЖЁСТКАЯ ЗАМЕНА ТОЧКИ В GAS
// ============================================
async function sendToSheet(step, reading, photoUrl) {
  // 1. Заменяем точку на запятую В САМОМ НАЧАЛЕ
  let fixedReading = String(reading).replace(/\./g, ',');
  
  // 2. ЕЩЁ РАЗ через replaceAll для гарантии
  fixedReading = fixedReading.replaceAll('.', ',');
  
  console.log(`📤 Исходное: "${reading}" → Отправляем: "${fixedReading}"`);
  
  // 3. Формируем JSON уже с исправленным значением
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
    console.log('✅ Ответ GAS:', JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('❌ Ошибка:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// /start
// ============================================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 
    '👋 *Привет!*\n\n' +
    '📋 Команды:\n' +
    '/start - Меню\n' +
    '/list - Все точки\n' +
    '/step N - Шаг N\n' +
    '/set N ЗНАЧЕНИЕ - Записать\n\n' +
    '👇 Кнопка "Начать обход"',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['📋 Начать обход']],
        resize_keyboard: true
      }
    }
  );
});

// ============================================
// /list
// ============================================
bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const response = await fetch(`${GAS_URL}?action=list`);
    const result = await response.json();
    
    if (result.success && result.data) {
      let message = '📋 *Маршрут:*\n\n';
      result.data.forEach((row, i) => {
        message += `*${i+1}.* ${row[1] || '?'} — ${row[3] || '❌'}\n`;
      });
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Ошибка');
  }
});

// ============================================
// /step N
// ============================================
bot.onText(/\/step (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const step = parseInt(match[1]);
  
  if (step < 1 || step > 38) {
    return bot.sendMessage(chatId, '❌ Шаг 1-38');
  }
  
  try {
    const response = await fetch(`${GAS_URL}?action=step_${step}`);
    const result = await response.json();
    
    if (result.success && result.data) {
      const row = result.data;
      await bot.sendMessage(chatId,
        `📍 *Шаг ${step}*\n` +
        `🏠 ${row[1] || '?'}\n` +
        `🔢 ${row[2] || '?'}\n` +
        `📊 ${row[3] || '❌'}\n` +
        `📸 ${row[4] ? '✅' : '❌'}`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (e) {
    await bot.sendMessage(chatId, '❌ Ошибка');
  }
});

// ============================================
// /set N ЗНАЧЕНИЕ
// ============================================
bot.onText(/\/set (\d+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const step = parseInt(match[1]);
  let reading = match[2].trim();
  
  if (step < 1 || step > 38) {
    return bot.sendMessage(chatId, '❌ Шаг 1-38');
  }
  
  // Замена точки на запятую
  reading = reading.replace(/\./g, ',').replaceAll('.', ',');
  
  const result = await sendToSheet(step, reading, '');
  
  if (result.success) {
    await bot.sendMessage(chatId, `✅ Шаг ${step}: ${reading}`);
  } else {
    await bot.sendMessage(chatId, '❌ Ошибка записи');
  }
});

// ============================================
// Обработка всех сообщений
// ============================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  // Кнопка "Начать обход"
  if (text === '📋 Начать обход') {
    userSessions.set(chatId, {
      currentStep: 1,
      lastPhotoUrl: null,
      waitingForReading: false
    });
    
    return bot.sendMessage(chatId,
      '✅ *Обход начат!*\n\n' +
      '📍 Шаг 1 из 38\n' +
      '📸 Отправь фото счётчика',
      { parse_mode: 'Markdown' }
    );
  }
  
  // Проверяем сессию
  const userData = userSessions.get(chatId);
  if (!userData || !userData.waitingForReading) return;
  
  // 🔥 ЗАМЕНЯЕМ ТОЧКУ НА ЗАПЯТУЮ ПЕРЕД ОТПРАВКОЙ
  let reading = text.replace(/\./g, ',').replaceAll('.', ',');
  
  const result = await sendToSheet(userData.currentStep, reading, userData.lastPhotoUrl);
  
  if (result.success) {
    await bot.sendMessage(chatId, `✅ *Шаг ${userData.currentStep}:* ${reading}`, { parse_mode: 'Markdown' });
    
    if (userData.currentStep < 38) {
      userData.currentStep++;
      userData.waitingForReading = false;
      userData.lastPhotoUrl = null;
      
      await bot.sendMessage(chatId, 
        `📍 *Шаг ${userData.currentStep} из 38*\n📸 Отправь фото`,
        { parse_mode: 'Markdown' }
      );
    } else {
      userSessions.delete(chatId);
      await bot.sendMessage(chatId, '🎉 *Обход завершён!*', { parse_mode: 'Markdown' });
    }
  } else {
    await bot.sendMessage(chatId, '❌ Ошибка, попробуй ещё:');
  }
});

// ============================================
// Обработка фото
// ============================================
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userData = userSessions.get(chatId);
  
  if (!userData) {
    return bot.sendMessage(chatId, 'Нажми "📋 Начать обход"');
  }
  
  const photoId = msg.photo[msg.photo.length - 1].file_id;
  const fileLink = await bot.getFileLink(photoId);
  
  userData.lastPhotoUrl = fileLink;
  userData.waitingForReading = true;
  
  await bot.sendMessage(chatId, 
    `✅ Фото получено!\nВведи показания для шага ${userData.currentStep}`
  );
});

// ============================================
// Веб-сервер для Render
// ============================================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', bot: 'atc_meter_bot' });
});

app.listen(port, () => {
  console.log(`🚀 Бот запущен на порту ${port}`);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Ошибка:', error);
});
