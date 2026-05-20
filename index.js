const express = require('express');
const axios = require('axios');

const app = express();
const TOKEN = '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8';
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const GAS_URL = 'https://script.google.com/macros/s/AKfycby0Wr4Ydd01nQot6ZDCC7hBiLTBLUYQWZeCHPoq-1mPlm2K0wSc0HlRG3g30ARNfzsF6A/exec';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Состояния пользователей
const userState = {};

// Текст с описанием шага
function getStepText(stepData) {
  let text = `🔹 *Шаг ${stepData.step}*️⃣\n\n`;
  text += `🏠 *${stepData.place}*\n`;
  text += `🔢 Счетчик: ${stepData.meterNumber || 'не указан'}\n`;
  if (stepData.reading) {
    text += `📊 Прошлые показания: ${stepData.reading}\n`;
  }
  text += `\n📸 Отправьте фото счетчика`;
  return text;
}

app.post('/webhook', async (req, res) => {
  const message = req.body.message;
  if (!message) {
    res.sendStatus(200);
    return;
  }
  
  const chatId = message.chat.id;
  const text = message.text ? message.text.trim() : '';
  const hasPhoto = message.photo && message.photo.length > 0;
  
  // --- КОМАНДА /start ---
  if (text === '/start') {
    const keyboard = {
      reply_markup: {
        keyboard: [
          [{ text: '🏁 Начать обход' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
    
    await sendMessage(chatId, 
      '👋 *Привет!* Я бот для учета показаний счетчиков.\n\n' +
      'Нажми кнопку **"🏁 Начать обход"**, чтобы начать заполнение маршрута.',
      keyboard
    );
    res.sendStatus(200);
    return;
  }
  
  // --- КОМАНДА "Начать обход" ---
  if (text === '🏁 Начать обход') {
    // Загружаем список точек
    try {
      const response = await axios.post(GAS_URL, { action: 'getList' });
      const data = response.data;
      
      if (data.success) {
        userState[chatId] = {
          currentStep: 0,
          stepsData: data.data,
          completedSteps: {},
          skippedSteps: {}
        };
        
        await sendMessage(chatId, '✅ Начинаем обход!');
        await sendCurrentStep(chatId);
      } else {
        await sendMessage(chatId, '❌ Ошибка загрузки данных');
      }
    } catch (error) {
      await sendMessage(chatId, '❌ Ошибка связи с таблицей');
    }
    res.sendStatus(200);
    return;
  }
  
  // --- ЭЛЕКТРИК В РЕЖИМЕ ОБХОДА ---
  if (userState[chatId] && userState[chatId].currentStep !== undefined) {
    const state = userState[chatId];
    const stepIndex = state.currentStep;
    const currentStepData = state.stepsData[stepIndex];
    
    if (!currentStepData) {
      // Все шаги пройдены
      await finishWalkthrough(chatId);
      res.sendStatus(200);
      return;
    }
    
    // Если ждем фото
    if (state.waitingFor === 'photo') {
      if (hasPhoto) {
        // Получаем file_id фото
        const photoId = message.photo[message.photo.length - 1].file_id;
        state.lastPhoto = photoId;
        state.waitingFor = 'reading';
        
        // Убираем клавиатуру, пока не нужно
        await sendMessage(chatId, 
          `✅ Фото получено!\n\n📝 Теперь введите показания для шага *${currentStepData.step}* (${currentStepData.place}):\n\nПример: 125.6`,
          { reply_markup: { remove_keyboard: true } }
        );
      } else {
        // Если текстом ответил, но не фото
        if (text === '⏭ Пропустить шаг') {
          state.skippedSteps[stepIndex] = true;
          state.currentStep++;
          state.waitingFor = 'photo';
          await sendMessage(chatId, `⏭ Шаг ${currentStepData.step} пропущен`);
          await sendCurrentStep(chatId);
        } else {
          await sendMessage(chatId, `📸 Пожалуйста, отправьте фото счетчика для шага *${currentStepData.step}*`);
        }
      }
      res.sendStatus(200);
      return;
    }
    
    // Если ждем показания
    if (state.waitingFor === 'reading') {
      const reading = text;
      
      if (reading && !isNaN(parseFloat(reading))) {
        // Получаем ссылку на фото через Telegram API
        let photoUrl = '';
        if (state.lastPhoto) {
          try {
            const fileResponse = await axios.get(`${TELEGRAM_API}/getFile?file_id=${state.lastPhoto}`);
            if (fileResponse.data.ok) {
              photoUrl = `https://api.telegram.org/file/bot${TOKEN}/${fileResponse.data.result.file_path}`;
            }
          } catch (e) {
            console.error('Error getting photo URL:', e);
          }
        }
        
        // Сохраняем в таблицу
        try {
          const saveResponse = await axios.post(GAS_URL, {
            action: 'setReading',
            step: currentStepData.step,
            reading: reading,
            photoUrl: photoUrl
          });
          
          if (saveResponse.data.success) {
            state.completedSteps[stepIndex] = {
              step: currentStepData.step,
              reading: reading,
              photoUrl: photoUrl
            };
            
            state.currentStep++;
            state.waitingFor = 'photo';
            state.lastPhoto = null;
            
            await sendMessage(chatId, `✅ *Шаг ${currentStepData.step}*: показания ${reading} сохранены!`);
            
            // Переходим к следующему шагу
            if (state.currentStep < state.stepsData.length) {
              await sendCurrentStep(chatId);
            } else {
              await finishWalkthrough(chatId);
            }
          } else {
            await sendMessage(chatId, `❌ Ошибка сохранения: ${saveResponse.data.message}`);
          }
        } catch (error) {
          await sendMessage(chatId, '❌ Ошибка связи с таблицей при сохранении');
        }
      } else {
        await sendMessage(chatId, `❌ Введите число. Например: 125.6`);
      }
      res.sendStatus(200);
      return;
    }
  }
  
  // Обработка других команд
  if (text === '/help') {
    await sendMessage(chatId, 
      '📋 *Команды:*\n\n' +
      '/start - начать\n' +
      '🏁 Начать обход - пошаговый режим\n' +
      '/list - список всех точек\n' +
      '/step N - показать точку N\n' +
      '/set N ПОКАЗАНИЯ - записать показания'
    );
  } else if (text === '/list') {
    try {
      const response = await axios.post(GAS_URL, { action: 'getList' });
      const data = response.data;
      if (data.success) {
        let msg = '📋 Список точек:\n\n';
        data.data.forEach(item => {
          const reading = item.reading ? `📊 ${item.reading}` : '❌';
          msg += `🔹 *${item.step}*. ${item.place} — ${reading}\n`;
        });
        await sendMessage(chatId, msg);
      }
    } catch (error) {
      await sendMessage(chatId, '❌ Ошибка');
    }
  } else if (text.startsWith('/step ')) {
    const step = parseInt(text.split(' ')[1]);
    if (!isNaN(step) && step >= 1 && step <= 38) {
      try {
        const response = await axios.post(GAS_URL, { action: 'getList' });
        const data = response.data;
        if (data.success) {
          const item = data.data.find(i => i.step == step);
          if (item) {
            await sendMessage(chatId,
              `🔹 *Шаг ${item.step}*\n🏠 ${item.place}\n🔢 Счетчик: ${item.meterNumber || 'не указан'}\n📊 Показания: ${item.reading || 'нет данных'}`
            );
          }
        }
      } catch (error) {
        await sendMessage(chatId, '❌ Ошибка');
      }
    }
  } else if (text.startsWith('/set ')) {
    const parts = text.split(' ');
    const step = parseInt(parts[1]);
    const reading = parts.slice(2).join(' ');
    if (!isNaN(step) && reading) {
      try {
        const response = await axios.post(GAS_URL, { action: 'setReading', step: step, reading: reading, photoUrl: '' });
        if (response.data.success) {
          await sendMessage(chatId, `✅ ${response.data.message}`);
        } else {
          await sendMessage(chatId, `❌ ${response.data.message}`);
        }
      } catch (error) {
        await sendMessage(chatId, '❌ Ошибка');
      }
    }
  } else {
    await sendMessage(chatId, '❌ Неизвестная команда. Используй /start');
  }
  
  res.sendStatus(200);
});

// Отправка текущего шага
async function sendCurrentStep(chatId) {
  const state = userState[chatId];
  const stepData = state.stepsData[state.currentStep];
  
  if (!stepData) {
    await finishWalkthrough(chatId);
    return;
  }
  
  const keyboard = {
    reply_markup: {
      keyboard: [
        [{ text: '⏭ Пропустить шаг' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  
  state.waitingFor = 'photo';
  
  let text = `📍 *Шаг ${stepData.step}* из 38\n\n`;
  text += `🏠 *${stepData.place}*\n`;
  text += `🔢 Счетчик: ${stepData.meterNumber || 'не указан'}\n`;
  if (stepData.reading) {
    text += `📊 Прошлые показания: ${stepData.reading}\n`;
  }
  text += `\n📸 Отправьте фото счетчика`;
  
  await sendMessage(chatId, text, keyboard);
}

// Завершение обхода
async function finishWalkthrough(chatId) {
  const state = userState[chatId];
  const totalSteps = state.stepsData.length;
  const completedCount = Object.keys(state.completedSteps).length;
  const skippedCount = Object.keys(state.skippedSteps).length;
  const remainingCount = totalSteps - completedCount - skippedCount;
  
  let text = `🏁 *Обход маршрута завершен!*\n\n`;
  text += `📊 Статистика:\n`;
  text += `✅ Заполнено: ${completedCount} из ${totalSteps}\n`;
  text += `⏭ Пропущено: ${skippedCount}\n`;
  text += `❌ Осталось: ${remainingCount}\n\n`;
  
  if (remainingCount > 0) {
    text += `⚠️ *ВНИМАНИЕ!* Остались незаполненные шаги!\n`;
    // Список незаполненных
    let missing = [];
    for (let i = 0; i < totalSteps; i++) {
      if (!state.completedSteps[i] && !state.skippedSteps[i]) {
        missing.push(state.stepsData[i].step);
      }
    }
    if (missing.length > 0) {
      text += `Номера шагов: ${missing.join(', ')}\n\n`;
    }
    text += `⚠️ *Пожалуйста, проверьте и заполните их!*`;
  } else {
    text += `🎉 *Все показания успешно внесены!*`;
  }
  
  const keyboard = {
    reply_markup: {
      keyboard: [
        [{ text: '🏁 Начать обход' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  
  await sendMessage(chatId, text, keyboard);
  
  // Очищаем состояние
  delete userState[chatId];
}

// Функция отправки сообщения с клавиатурой
async function sendMessage(chatId, text, options = {}) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
    
    if (options.reply_markup) {
      payload.reply_markup = options.reply_markup;
    }
    
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
  }
}

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});
