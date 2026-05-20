const express = require('express');
const axios = require('axios');

const app = express();
const TOKEN = '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8';
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/webhook', (req, res) => {
  const message = req.body.message;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text;

    if (text === '/start') {
      sendMessage(chatId, 'Привет! Я бот для учета показаний счетчиков.');
    } else if (text === '/help') {
      sendMessage(chatId, 'Команды:\n/start - начать\n/help - помощь');
    } else {
      sendMessage(chatId, `Вы написали: ${text}`);
    }
  }
  res.sendStatus(200);
});

function sendMessage(chatId, text) {
  axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: text
  }).catch(err => console.error('Error:', err));
}

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});
