const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const vapidKeys = {
  publicKey: 'BD4S82GWVtHdELPM8qLxgx88nMaolYACzdEDKwlPSI7uwKdomcxx4Njv-KgKSfMZ-a2RFAU7J6dw17XkjKvIe14',
  privateKey: 'V9gww8A7ypMUESZeUmtqAQrJnaCBv1jUhiShr65Tkek'
};
webpush.setVapidDetails('mailto:your@email.com', vapidKeys.publicKey, vapidKeys.privateKey);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let subscriptions = [];
const reminders = new Map(); // Хранение активных напоминаний

io.on('connection', (socket) => {
  console.log('Клиент подключён:', socket.id);

  socket.on('newTask', (task) => {
    io.emit('taskAdded', task);
    const payload = JSON.stringify({ title: 'Новая задача', body: task.text });
    subscriptions.forEach(sub => webpush.sendNotification(sub, payload).catch(console.error));
  });

  socket.on('newReminder', (reminder) => {
    const { id, text, reminderTime } = reminder;
    const delay = reminderTime - Date.now();
    if (delay <= 0) return;

    const timeoutId = setTimeout(() => {
      const payload = JSON.stringify({ title: '!!! Напоминание', body: text, reminderId: id });
      subscriptions.forEach(sub => webpush.sendNotification(sub, payload).catch(console.error));
      reminders.delete(id);
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime });
  });

  socket.on('disconnect', () => console.log('Клиент отключён:', socket.id));
});

app.post('/subscribe', (req, res) => {
  subscriptions.push(req.body);
  res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  res.status(200).json({ message: 'Подписка удалена' });
});

app.post('/snooze', (req, res) => {
  const reminderId = parseInt(req.query.reminderId, 10);
  if (!reminderId || !reminders.has(reminderId)) return res.status(404).json({ error: 'Reminder not found' });

  const reminder = reminders.get(reminderId);
  clearTimeout(reminder.timeoutId);

  const newDelay = 5 * 60 * 1000;
  const newTimeoutId = setTimeout(() => {
    const payload = JSON.stringify({ title: 'Напоминание отложено', body: reminder.text, reminderId: reminderId });
    subscriptions.forEach(sub => webpush.sendNotification(sub, payload).catch(console.error));
    reminders.delete(reminderId);
  }, newDelay);

  reminders.set(reminderId, { timeoutId: newTimeoutId, text: reminder.text, reminderTime: Date.now() + newDelay });
  res.status(200).json({ message: 'Snoozed for 5 minutes' });
});

server.listen(3001, () => console.log('✅ Сервер запущен: http://localhost:3001'));