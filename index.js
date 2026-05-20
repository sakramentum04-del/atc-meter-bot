const express = require('express');
const axios = require('axios');

const app = express();
const TOKEN = '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8';
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const GAS_URL = 'https://script.google.com/macros/s/AKfycby0Wr4Ydd01nQot6ZDCC7hBiLTBLUYQWZeCHPoq-1mPlm2K0wSc0HlRG3g30ARNfzsF6A/exec';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userState = {};

app.post('/webhook', async (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) {
    res.sendStatus(200);
    return;
  }
  
  const chatId = message.chat.id;
  const text = message.text.trim();
  
  if (text === '/start') {
    userState[chatId] = { action: 'main' };
    await sendMessage(chatId, 
      '👋 Привет! Я бот для учета показаний счетчиков.\n\n' +
      'Команды:\n' +
      '/list - список всех точек\n' +
      '/step N - показать точку N (например /step 5)\n' +
      '/set N ПОКАЗАНИЯ - записать показания (например /set 5 123.45)\n' +
      '/help - помощь'
    );
  }
  
  else if (text === '/help') {
    await sendMessage(chatId,
      '📋 Команды:\n\n' +
      '/list - список всех точек учета\n' +
      '/step N - информация о точке N\n' +
      '/set N ПОКАЗАНИЯ - записать показания\n' +
      '  Пример: /set 5 125.6\n' +
      '/start - главное меню'
    );
  }
  
  else if (text === '/list') {
    try {
      const response = await axios.post(GAS_URL, { action: 'getList' });
      const data = response.data;
      
      if (data.success) {
        let message = '📋 Список точек учета:\n\n';
        data.data.forEach(item => {
          const reading = item.reading ? `📊 ${item.reading}` : '❌ нет данных';
          message += `🔹 *${item.step}*. ${item.place}\n   Счетчик: ${item.meterNumber || 'не указан'}\n   Показания: ${reading}\n\n`;
        });
        
        if (message.length > 4000) {
          await sendMessage(chatId, 'Список слишком длинный, отправляю по частям...');
          for (let i = 0; i < data.data.length; i += 10) {
            let chunk = '📋 Точки учета:\n\n';
            data.data.slice(i, i + 10).forEach(item => {
              const reading = item.reading ? `📊 ${item.reading}` : '❌ нет данных';
              chunk += `🔹 *${item.step}*. ${item.place}\n   Показания: ${reading}\n\n`;
            });
            await sendMessage(chatId, chunk);
          }
        } else {
          await sendMessage(chatId, message);
        }
      } else {
        await sendMessage(chatId, '❌ Ошибка получения данных');
      }
    } catch (error) {
      await sendMessage(chatId, '❌ Ошибка связи с таблицей');
    }
  }
  
  else if (text.startsWith('/step ')) {
    const step = parseInt(text.split(' ')[1]);
    if (isNaN(step) || step < 1 || step > 38) {
      await sendMessage(chatId, '❌ Некорректный номер шага. Используй /step N (1-38)');
      return;
    }
    
    try {
      const response = await axios.post(GAS_URL, { action: 'getList' });
      const data = response.data;
      
      if (data.success) {
        const item = data.data.find(i => i.step == step);
        if (item) {
          const reading = item.reading ? `📊 ${item.reading}` : '❌ нет данных';
          const photo = item.photo ? `📸 [Фото](${item.photo})` : '❌ нет фото';
          await sendMessage(chatId,
            `🔹 *Шаг ${item.step}*\n` +
            `🏠 Помещение: ${item.place}\n` +
            `🔢 № счетчика: ${item.meterNumber || 'не указан'}\n` +
            `📊 Показания: ${reading}\n` +
            `📸 Фото: ${photo}`
          );
        } else {
          await sendMessage(chatId, `❌ Шаг ${step} не найден`);
        }
      }
    } catch (error) {
      await sendMessage(chatId, '❌ Ошибка связи с таблицей');
    }
  }
  
  else if (text.startsWith('/set ')) {
    const parts = text.split(' ');
    const step = parseInt(parts[1]);
    const reading = parts.slice(2).join(' ');
    
    if (isNaN(step) || !reading) {
      await sendMessage(chatId, '❌ Формат: /set N ПОКАЗАНИЯ\nПример: /set 5 125.6');
      return;
    }
    
    try {
      const response = await axios.post(GAS_URL, {
        action: 'setReading',
        step: step,
        reading: reading,
        photoUrl: ''
      });
      const data = response.data;
      
      if (data.success) {
        await sendMessage(chatId, `✅ ${data.message}`);
      } else {
        await sendMessage(chatId, `❌ ${data.message}`);
      }
    } catch (error) {
      await sendMessage(chatId, '❌ Ошибка записи в таблицу');
    }
  }
  
  else {
    const num = parseInt(text);
    if (!isNaN(num) && num >= 1 && num <= 38) {
      try {
        const response = await axios.post(GAS_URL, { action: 'getList' });
        const data = response.data;
        if (data.success) {
          const item = data.data.find(i => i.step == num);
          if (item) {
            const reading = item.reading ? `📊 ${item.reading}` : '❌ нет данных';
            await sendMessage(chatId,
              `🔹 *Шаг ${item.step}*\n` +
              `🏠 ${item.place}\n` +
              `🔢 Счетчик: ${item.meterNumber || 'не указан'}\n` +
              `📊 Показания: ${reading}`
            );
          }
        }
      } catch (error) {
        await sendMessage(chatId, '❌ Ошибка');
      }
    } else {
      await sendMessage(chatId, `❌ Неизвестная команда. Используй /help`);
    }
  }
  
  res.sendStatus(200);
});

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
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


