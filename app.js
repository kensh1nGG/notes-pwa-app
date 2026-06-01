const socket = io('http://localhost:3001');
const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');

function setActiveButton(id) {
  [homeBtn, aboutBtn].forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function loadContent(page) {
  try {
    const res = await fetch(`/content/${page}.html`);
    contentDiv.innerHTML = await res.text();
    if (page === 'home') initNotes();
  } catch { contentDiv.innerHTML = '<p class="text-error">Ошибка загрузки</p>'; }
}

homeBtn.onclick = () => { setActiveButton('home-btn'); loadContent('home'); };
aboutBtn.onclick = () => { setActiveButton('about-btn'); loadContent('about'); };
loadContent('home');

function initNotes() {
  const form = document.getElementById('note-form');
  const input = document.getElementById('note-input');
  const remForm = document.getElementById('reminder-form');
  const remText = document.getElementById('reminder-text');
  const remTime = document.getElementById('reminder-time');
  const list = document.getElementById('notes-list');
  const enableBtn = document.getElementById('enable-push');
  const disableBtn = document.getElementById('disable-push');

  function loadNotes() {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    notes.reverse(); 
    
    list.innerHTML = notes.map(n => {
      const rem = n.reminder ? `<br><small style="color: #6366f1; font-weight: 500;">⏰ Напоминание: ${new Date(n.reminder).toLocaleString()}</small>` : '';
      return `<li style="border-bottom: 1px solid #eee; padding: 0.8rem 0; display: flex; justify-content: space-between; align-items: center;">
                <span>${n.text}${rem}</span>
              </li>`;
    }).join('');
  }

  function addNote(text, reminderTimestamp = null) {
    const notes = JSON.parse(localStorage.getItem('notes') || '[]');
    const newNote = { id: Date.now(), text, reminder: reminderTimestamp };
    notes.push(newNote);
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotes();

    if (reminderTimestamp) socket.emit('newReminder', { id: newNote.id, text, reminderTime: reminderTimestamp });
    else socket.emit('newTask', { text, timestamp: Date.now() });
  }

  form.onsubmit = e => { e.preventDefault(); if(input.value.trim()) { addNote(input.value.trim()); input.value=''; } };
  remForm.onsubmit = e => {
    e.preventDefault();
    const t = remText.value.trim(), d = remTime.value;
    if (t && d) {
      const ts = new Date(d).getTime();
      if (ts > Date.now()) addNote(t, ts); else alert('Выберите будущее время');
      remText.value = ''; remTime.value = '';
    }
  };

  // Push кнопки
  if (enableBtn && disableBtn) {
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription().then(sub => {
      if (sub) { enableBtn.style.display='none'; disableBtn.style.display='inline-block'; }
    }));
    enableBtn.onclick = async () => {
      if (Notification.permission === 'denied') return alert('Разрешите уведомления в браузере');
      if (Notification.permission === 'default' && await Notification.requestPermission() !== 'granted') return;
      await subscribeToPush();
      enableBtn.style.display='none'; disableBtn.style.display='inline-block';
    };
    disableBtn.onclick = async () => {
      await unsubscribeFromPush();
      disableBtn.style.display='none'; enableBtn.style.display='inline-block';
    };
  }
  loadNotes();
}

// WebSocket: приём задач от других клиентов
socket.on('taskAdded', (task) => {
  const div = document.createElement('div');
  div.textContent = `Новая задача: ${task.text}`;
  div.style.cssText = 'position:fixed;top:10px;right:10px;background:#4285f4;color:#fff;padding:1rem;border-radius:5px;z-index:1000;';
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
});

// Push хелперы
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const b64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BD4S82GWVtHdELPM8qLxgx88nMaolYACzdEDKwlPSI7uwKdomcxx4Njv-KgKSfMZ-a2RFAU7J6dw17XkjKvIe14')
    });
    await fetch('http://localhost:3001/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(sub) });
  } catch(e) { console.error(e); }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('http://localhost:3001/unsubscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({endpoint: sub.endpoint}) });
    await sub.unsubscribe();
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}