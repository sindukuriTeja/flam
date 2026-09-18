import { Canvas } from './canvas.js';
import { WebSocketClient } from './websocket.js';

const WORDS = ['alligator','ant','bear','butterfly','cat','dolphin','elephant','flamingo','giraffe','kangaroo','lion','monkey','octopus','panda','penguin','rabbit','shark','tiger','turtle','zebra','apple','banana','birthday cake','bread','burger','carrot','cheese','cookie','donut','ice cream','lemon','pizza','popcorn','strawberry','sushi','taco','watermelon','backpack','balloon','bicycle','book','camera','candle','castle','chair','clock','computer','crown','drum','guitar','hammer','key','kite','ladder','lamp','pencil','phone','robot','rocket','scissors','snowman','toothbrush','train','umbrella','volcano','airplane','beach','bridge','circus','farm','forest','hospital','library','mountain','museum','playground','school','space','zoo','climbing','cooking','dancing','fishing','jumping','painting','running','singing','sleeping','swimming'];

class CollaborativeDrawingApp {
  constructor() {
    this.room = this.getOrCreateRoomId(); this.wsClient = new WebSocketClient(); this.canvas = new Canvas('drawingCanvas', this.wsClient.getUserId());
    this.userCursors = new Map(); this.playerNames = new Map(); this.myId = null; this.drawerId = null; this.timerInterval = null;
    this.setupWebSocket(); this.setupLogin(); this.setupToolbar(); this.setupCursorTracking(); this.setupRoomControls(); this.setupGameControls(); this.updateRoomDisplay();
  }
  getOrCreateRoomId() { const params = new URLSearchParams(location.search); let room = params.get('room'); if (!room) { room = Math.random().toString(36).slice(2, 15); history.replaceState({}, '', `?room=${room}`); } return room; }
  $(selector) { return document.querySelector(selector); }
  setAnnouncement(message) { this.$('#announcement').textContent = message; }
  setupWebSocket() {
    const updateStatus = connected => { const el = this.$('.connection-status'); el.className = `connection-status ${connected ? 'online' : 'offline'}`; el.querySelector('.status-text').textContent = connected ? 'Online' : 'Offline'; };
    this.wsClient.socket.on('connect', () => { this.myId = this.wsClient.getUserId(); updateStatus(true); if (this.myName) this.wsClient.joinRoom(this.room, this.myName); });
    this.wsClient.socket.on('disconnect', () => updateStatus(false)); this.wsClient.socket.on('connect_error', () => updateStatus(false));
    this.wsClient.onDraw(data => this.canvas.applyPath(data.path)); this.wsClient.onUndo(() => this.canvas.undo()); this.wsClient.onRedo(() => this.canvas.redo());
    this.wsClient.onCursorMove(data => this.updateUserCursor(data.userId, data.x, data.y)); this.wsClient.onUserJoin(data => this.updateOnlineUsers(data.userCount));
    this.wsClient.onRoomState(state => state.paths.forEach(path => this.canvas.applyPath(path)));
    this.wsClient.socket.on('playersUpdated', data => { this.updateOnlineUsers(data.count); this.renderPlayers(data.players); });
    this.wsClient.socket.on('scoreboard', data => this.renderScores(data.scores, data.leaderName));
    this.wsClient.socket.on('roundStarted', data => this.roundStarted(data));
    this.wsClient.socket.on('secretWord', word => { if (this.drawerId === this.myId && word) this.setAnnouncement(`Your word is “${word}”. Draw it before time runs out!`); });
    this.wsClient.socket.on('wordSubmitted', () => { this.$('#guessForm').classList.remove('hidden'); this.setAnnouncement('The drawing has begun — make your best guess!'); });
    this.wsClient.socket.on('guessResult', data => { if (!data.correct) this.setAnnouncement('Not quite — keep guessing!'); });
    this.wsClient.socket.on('canvasCleared', () => this.clearCanvas());
    this.wsClient.socket.on('roundEnded', data => { this.stopTimer(); this.drawerId = null; this.$('#wordForm').classList.add('hidden'); this.$('#guessForm').classList.add('hidden'); this.setAnnouncement(data.guesserName ? `${data.guesserName} guessed it! The word was “${data.word}”.` : `Time is up! The word was “${data.word}”.`); this.renderScores(data.scores); });
    this.wsClient.socket.on('gameOver', data => { this.stopTimer(); this.setAnnouncement(`Game over! Winner: ${data.winnerName}.`); this.renderScores(data.scores); });
    this.canvas.setOnDrawCallback(path => this.wsClient.sendDraw(this.room, path));
  }
  setupLogin() {
    this.myName = localStorage.getItem('drawGuessName') || '';
    const overlay = this.$('#loginOverlay');
    const form = this.$('#loginForm');
    const input = this.$('#nameInput');
    if (this.myName) { input.value = this.myName; }
    const doJoin = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      this.myName = name;
      localStorage.setItem('drawGuessName', name);
      overlay.classList.add('hidden');
      this.wsClient.joinRoom(this.room, name);
      this.setAnnouncement(`Welcome, ${name}! Invite a friend with the Share button.`);
    };
    form.addEventListener('submit', event => { event.preventDefault(); doJoin(); });
    // If already connected, join immediately when the user submits
    if (this.wsClient.socket.connected) { /* doJoin will emit joinRoom */ }
  }
  setupGameControls() {
    this.$('#startRoundBtn').addEventListener('click', () => this.wsClient.socket.emit('startRound'));
    this.$('#endGameBtn').addEventListener('click', () => this.wsClient.socket.emit('endGame'));
    this.$('#wordForm').addEventListener('submit', event => { event.preventDefault(); const input = this.$('#secretWordInput'); if (input.value.trim()) { this.wsClient.socket.emit('submitWord', input.value); this.$('#wordForm').classList.add('hidden'); this.setAnnouncement('Draw it before time runs out!'); } });
    this.$('#guessForm').addEventListener('submit', event => { event.preventDefault(); const input = this.$('#guessInput'); if (input.value.trim()) { this.wsClient.socket.emit('guess', input.value); input.value = ''; } });
    this.$('#surpriseBtn').addEventListener('click', () => { this.$('#secretWordInput').value = WORDS[Math.floor(Math.random() * WORDS.length)]; });
  }
  roundStarted(data) { this.drawerId = data.drawerId; this.$('#roundNumber').textContent = data.roundNumber; this.$('#currentDrawer').textContent = data.drawerName; this.$('#wordForm').classList.add('hidden'); this.$('#guessForm').classList.add('hidden'); this.$('#secretWordInput').value = ''; this.$('#guessInput').value = ''; this.startTimer(data.timerSeconds); if (data.drawerId === this.myId) { this.$('#wordForm').classList.remove('hidden'); this.setAnnouncement('You are the drawer — enter a secret word.'); } else this.setAnnouncement(`${data.drawerName} is choosing a word…`); }
  startTimer(seconds) { this.stopTimer(); let left = seconds; const render = () => { this.$('#roundTimer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; }; render(); this.timerInterval = setInterval(() => { left = Math.max(0, left - 1); render(); if (!left) this.stopTimer(); }, 1000); }
  stopTimer() { if (this.timerInterval) clearInterval(this.timerInterval); this.timerInterval = null; }
  renderPlayers(players) { this.$('#playerCount').textContent = `${players.length} player${players.length === 1 ? '' : 's'}`; this.playerNames = new Map(players.map(player => [player.id, player.name])); players.forEach(player => { const cursor = this.userCursors.get(player.id); if (cursor) cursor.querySelector('.cursor-name').textContent = player.name; }); const current = players.find(player => player.id === this.drawerId); if (current) this.$('#currentDrawer').textContent = current.name; }
  renderScores(scores, leaderName) { const list = this.$('#scoreList'); list.innerHTML = ''; const highest = scores.length ? Math.max(...scores.map(player => player.score)) : 0; scores.forEach(player => { const item = document.createElement('li'); if (player.score === highest && scores.length) item.classList.add('leader'); item.innerHTML = `<span><b>${player.name}</b> <small>#${player.number}</small></span><strong>${player.score}</strong>`; list.appendChild(item); }); if (leaderName) this.$('.scoreboard h2').textContent = `Scoreboard · ${leaderName}`; }
  clearCanvas() { this.canvas.state.paths = []; this.canvas.state.redoStack = []; this.canvas.redraw(); }
  setupToolbar() {
    const PALETTE = ['#171a26', '#ffffff', '#6d7cff', '#56d5a2', '#ff7183', '#ffb454', '#4dd0e1', '#f06292', '#ba68c8', '#a1887f'];
    const palette = this.$('#colorPalette');
    PALETTE.forEach(color => {
      const swatch = document.createElement('button');
      swatch.type = 'button'; swatch.className = 'swatch'; swatch.style.background = color; swatch.title = color;
      swatch.addEventListener('click', () => { this.$('#colorPicker').value = color; });
      palette.appendChild(swatch);
    });
    document.querySelectorAll('.tool:not(#fillToggle)').forEach(tool => tool.addEventListener('click', event => { document.querySelector('.tool.active:not(#fillToggle)')?.classList.remove('active'); event.currentTarget.classList.add('active'); }));
    this.$('#fillToggle').addEventListener('click', event => event.currentTarget.classList.toggle('active'));
    this.$('#strokeWidth').addEventListener('input', event => this.$('.stroke-value').textContent = `${event.target.value}px`);
    this.$('#undo').addEventListener('click', () => { this.canvas.undo(); this.wsClient.sendUndo(this.room); }); this.$('#redo').addEventListener('click', () => { this.canvas.redo(); this.wsClient.sendRedo(this.room); });
  }
  setupCursorTracking() { let waiting = false; document.addEventListener('mousemove', event => { if (waiting) return; waiting = true; setTimeout(() => { const rect = this.$('#drawingCanvas').getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) this.wsClient.sendCursorMove(this.room, x, y); waiting = false; }, 30); }); }
  updateUserCursor(id, x, y) { if (id === this.myId) return; let cursor = this.userCursors.get(id); if (!cursor) { cursor = document.createElement('div'); cursor.className = 'user-cursor'; const name = this.playerNames.get(id) || 'Player'; cursor.innerHTML = '<div class="cursor-pointer"></div><div class="cursor-name"></div>'; cursor.querySelector('.cursor-name').textContent = name; this.$('.canvas-container').appendChild(cursor); this.userCursors.set(id, cursor); } cursor.style.transform = `translate(${x}px, ${y}px)`; }
  updateOnlineUsers(count) { this.$('.online-users').textContent = `${count} player${count === 1 ? '' : 's'} online`; }
  setupRoomControls() { this.$('#newRoomBtn').addEventListener('click', () => location.href = `${location.origin}?room=${Math.random().toString(36).slice(2, 15)}`); this.$('#shareRoomBtn').addEventListener('click', () => navigator.clipboard.writeText(`${location.origin}?room=${this.room}`).then(() => this.setAnnouncement('Room link copied!'))); }
  updateRoomDisplay() { this.$('.room-id').textContent = `Room: ${this.room}`; }
}
document.addEventListener('DOMContentLoaded', () => new CollaborativeDrawingApp());
