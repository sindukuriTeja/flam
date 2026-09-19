import { Canvas } from './canvas.js';
import { WebSocketClient } from './websocket.js';

const WORDS = ['alligator','ant','bear','butterfly','cat','dolphin','elephant','flamingo','giraffe','kangaroo','lion','monkey','octopus','panda','penguin','rabbit','shark','tiger','turtle','zebra','apple','banana','birthday cake','bread','burger','carrot','cheese','cookie','donut','ice cream','lemon','pizza','popcorn','strawberry','sushi','taco','watermelon','backpack','balloon','bicycle','book','camera','candle','castle','chair','clock','computer','crown','drum','guitar','hammer','key','kite','ladder','lamp','pencil','phone','robot','rocket','scissors','snowman','toothbrush','train','umbrella','volcano','airplane','beach','bridge','circus','farm','forest','hospital','library','mountain','museum','playground','school','space','zoo','climbing','cooking','dancing','fishing','jumping','painting','running','singing','sleeping','swimming'];
const AVATAR_COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#56d5a2', '#ffb454', '#ef5350', '#4dd0e1', '#ba68c8'];
const RING_CIRC = 2 * Math.PI * 19; // timer ring r=19

class CollaborativeDrawingApp {
  constructor() {
    this.room = this.getOrCreateRoomId(); this.wsClient = new WebSocketClient(); this.canvas = new Canvas('drawingCanvas', this.wsClient.getUserId());
    this.userCursors = new Map(); this.playerNames = new Map(); this.myId = null; this.drawerId = null; this.timerInterval = null; this.roundSeconds = 60;
    this.setupWebSocket(); this.setupLogin(); this.setupToolbar(); this.setupCursorTracking(); this.setupRoomControls(); this.setupGameControls(); this.setupTabs(); this.setupModeSwitch();
  }
  getOrCreateRoomId() { const params = new URLSearchParams(location.search); let room = params.get('room'); if (!room) { room = Math.random().toString(36).slice(2, 15); history.replaceState({}, '', `?room=${room}`); } return room; }
  $(selector) { return document.querySelector(selector); }
  setAnnouncement(message) { this.$('#announcement').textContent = message; }
  avatarColor(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }
  updateProfile(name) {
    if (!name) return;
    this.$('#userAvatar').textContent = name[0].toUpperCase();
    this.$('#userAvatar').style.background = `linear-gradient(135deg, ${this.avatarColor(name)}, ${this.avatarColor(name + 'x')})`;
    this.$('#userName').textContent = name;
  }
  setupWebSocket() {
    const updateStatus = connected => { const el = this.$('#userCard'); el.style.opacity = connected ? '1' : '.55'; this.$('#userTagline').textContent = connected ? "Let's Draw Something!" : 'Reconnecting…'; };
    this.wsClient.socket.on('connect', () => {
      this.myId = this.wsClient.getUserId();
      this.canvas.userId = this.myId;
      updateStatus(true);
      if (this.myName) this.wsClient.joinRoom(this.room, this.myName);
    });
    this.wsClient.socket.on('disconnect', () => updateStatus(false));
    this.wsClient.socket.on('connect_error', () => updateStatus(false));
    this.wsClient.onDraw(data => this.canvas.applyPath(data.path));
    this.wsClient.onUndo(data => { if (data?.pathId) this.canvas.removePathById(data.pathId); });
    this.wsClient.onRedo(data => { if (data?.path) this.canvas.applyPath(data.path); });
    this.wsClient.onCursorMove(data => this.updateUserCursor(data.userId, data.x, data.y));
    this.wsClient.onRoomState(state => { this.canvas.clearAll(); (state.paths || []).forEach(path => this.canvas.applyPath(path)); });
    this.wsClient.socket.on('playersUpdated', data => { this.renderPlayers(data.players); });
    this.wsClient.socket.on('scoreboard', data => this.renderScores(data.scores, data.leaderName));
    this.wsClient.socket.on('roundStarted', data => this.roundStarted(data));
    this.wsClient.socket.on('secretWord', word => { if (this.drawerId === this.myId && word) this.setAnnouncement(`Your word is \u201c${word}\u201d. Draw it before time runs out!`); });
    this.wsClient.socket.on('wordSubmitted', () => { this.$('#guessForm').classList.remove('hidden'); this.setAnnouncement('The drawing has begun \u2014 make your best guess!'); });
    this.wsClient.socket.on('guessResult', data => { if (!data.correct) this.setAnnouncement('Not quite \u2014 keep guessing!'); });
    this.wsClient.socket.on('canvasCleared', () => this.clearCanvas());
    this.wsClient.socket.on('roundEnded', data => { this.stopTimer(); this.setRing(this.roundSeconds); this.drawerId = null; this.$('#wordForm').classList.add('hidden'); this.$('#guessForm').classList.add('hidden'); this.$('#currentDrawer').textContent = 'Waiting...'; this.setAnnouncement(data.guesserName ? `${data.guesserName} guessed it! The word was \u201c${data.word}\u201d.` : `Time is up! The word was \u201c${data.word}\u201d.`); this.renderScores(data.scores); });
    this.wsClient.socket.on('gameOver', data => { this.stopTimer(); this.setRing(this.roundSeconds); this.setAnnouncement(`Game over! Winner: ${data.winnerName}.`); this.renderScores(data.scores); });
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
      this.updateProfile(name);
      overlay.classList.add('hidden');
      this.wsClient.joinRoom(this.room, name);
      this.setAnnouncement(`Welcome, ${name}! Invite a friend with the Share button.`);
    };
    form.addEventListener('submit', event => { event.preventDefault(); doJoin(); });
  }
  setupGameControls() {
    this.$('#startRoundBtn').addEventListener('click', () => this.wsClient.socket.emit('startRound'));
    this.$('#endGameBtn').addEventListener('click', () => this.wsClient.socket.emit('endGame'));
    this.$('#wordForm').addEventListener('submit', event => { event.preventDefault(); const input = this.$('#secretWordInput'); if (input.value.trim()) { this.wsClient.socket.emit('submitWord', input.value); this.$('#wordForm').classList.add('hidden'); this.setAnnouncement('Draw it before time runs out!'); } });
    this.$('#guessForm').addEventListener('submit', event => { event.preventDefault(); const input = this.$('#guessInput'); if (input.value.trim()) { this.wsClient.socket.emit('guess', input.value); input.value = ''; } });
    this.$('#surpriseBtn').addEventListener('click', () => { this.$('#secretWordInput').value = WORDS[Math.floor(Math.random() * WORDS.length)]; });
  }
  setupTabs() {
    const setTab = id => document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === id));
    this.$('#tabPlay').addEventListener('click', () => setTab('tabPlay'));
    this.$('#tabHome').addEventListener('click', () => setTab('tabHome'));
    this.$('#tabCreate').addEventListener('click', () => { setTab('tabCreate'); location.href = `${location.origin}?room=${Math.random().toString(36).slice(2, 15)}`; });
    this.$('#tabHow').addEventListener('click', () => { setTab('tabHow'); this.setAnnouncement('How to play: Start a round, the drawer gets a secret word and draws it. First correct guess scores 10 points!'); });
  }
  setupModeSwitch() {
    const draw = this.$('#modeDraw'), studio = this.$('#modeStudio'), extra = this.$('#studioExtra');
    const select = id => { document.querySelector('.tool.active')?.classList.remove('active'); this.$('#' + id).classList.add('active'); };
    draw.addEventListener('click', () => {
      draw.classList.add('active'); studio.classList.remove('active'); extra.classList.add('hidden');
      const active = document.querySelector('.tool.active');
      if (active && ['spray', 'highlighter'].includes(active.id)) select('brush');
    });
    studio.addEventListener('click', () => {
      studio.classList.add('active'); draw.classList.remove('active'); extra.classList.remove('hidden');
    });
  }
  roundStarted(data) {
    this.drawerId = data.drawerId; this.roundSeconds = data.timerSeconds;
    this.$('#roundNumber').textContent = `${data.roundNumber} / -`;
    this.$('#currentDrawer').textContent = data.drawerName;
    this.$('#wordForm').classList.add('hidden'); this.$('#guessForm').classList.add('hidden');
    this.$('#secretWordInput').value = ''; this.$('#guessInput').value = '';
    this.startTimer(data.timerSeconds);
    if (data.drawerId === this.myId) { this.$('#wordForm').classList.remove('hidden'); this.setAnnouncement('You are the drawer \u2014 enter a secret word.'); }
    else this.setAnnouncement(`${data.drawerName} is choosing a word\u2026`);
  }
  setRing(secondsLeft) {
    const ring = this.$('#timerRing');
    if (!ring) return;
    const frac = Math.max(0, Math.min(1, secondsLeft / this.roundSeconds));
    ring.style.strokeDashoffset = String(RING_CIRC * (1 - frac));
    ring.style.stroke = frac > 0.33 ? '#3b82f6' : frac > 0.15 ? '#ffb454' : '#ff7183';
  }
  startTimer(seconds) {
    this.stopTimer();
    let left = seconds;
    const render = () => {
      this.$('#roundTimer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      this.setRing(left);
    };
    render();
    this.timerInterval = setInterval(() => { left = Math.max(0, left - 1); render(); if (!left) this.stopTimer(); }, 1000);
  }
  stopTimer() { if (this.timerInterval) clearInterval(this.timerInterval); this.timerInterval = null; }
  renderPlayers(players) {
    this.$('#playerCount').textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
    this.playerNames = new Map(players.map(player => [player.id, player.name]));
    for (const [id, cursor] of [...this.userCursors]) {
      if (!this.playerNames.has(id)) { cursor.remove(); this.userCursors.delete(id); }
      else cursor.querySelector('.cursor-name').textContent = this.playerNames.get(id);
    }
    const current = players.find(player => player.id === this.drawerId);
    if (current) this.$('#currentDrawer').textContent = current.name;
  }
  renderScores(scores, leaderName) {
    const list = this.$('#scoreList');
    list.textContent = '';
    const highest = scores.length ? Math.max(...scores.map(player => player.score)) : 0;
    scores.forEach((player, i) => {
      const item = document.createElement('li');
      if (player.score === highest && scores.length) item.classList.add('leader');
      const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1);
      const av = document.createElement('span'); av.className = 'avatar'; av.textContent = (player.name[0] || '?').toUpperCase();
      av.style.background = `linear-gradient(135deg, ${this.avatarColor(player.name)}, ${this.avatarColor(player.name + 'x')})`;
      const name = document.createElement('span'); name.className = 'p-name'; name.textContent = player.name;
      if (player.id === this.myId) { const you = document.createElement('small'); you.textContent = ' (You)'; name.appendChild(you); }
      const score = document.createElement('strong'); score.textContent = String(player.score);
      item.append(rank, av, name, score);
      list.appendChild(item);
    });
  }
  clearCanvas() { this.canvas.clearAll(); }
  setupToolbar() {
    const PALETTE = ['#ffffff', '#171a26', '#ef5350', '#ff8a65', '#ffd54f', '#8bc34a', '#3b82f6', '#4dd0e1', '#8b5cf6', '#ec4899', '#26c6da', '#a5d6a7', '#ffcc80', '#b39ddb', '#a1887f', '#f06292'];
    const palette = this.$('#colorPalette');
    const markSwatch = color => palette.querySelectorAll('.swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === color));
    PALETTE.forEach(color => {
      const swatch = document.createElement('button');
      swatch.type = 'button'; swatch.className = 'swatch'; swatch.style.background = color; swatch.title = color; swatch.dataset.color = color;
      swatch.addEventListener('click', () => { this.$('#colorPicker').value = color; markSwatch(color); });
      palette.appendChild(swatch);
    });
    this.$('#colorPicker').addEventListener('input', event => markSwatch(event.target.value));
    markSwatch(this.$('#colorPicker').value);
    document.querySelectorAll('.tool:not(#fillToggle)').forEach(tool => tool.addEventListener('click', event => { document.querySelector('.tool.active:not(#fillToggle)')?.classList.remove('active'); event.currentTarget.classList.add('active'); }));
    this.$('#fillToggle').addEventListener('click', event => event.currentTarget.classList.toggle('active'));
    this.$('#strokeWidth').addEventListener('input', event => this.$('.stroke-value').textContent = `${event.target.value} px`);
    this.$('#undo').addEventListener('click', () => this.wsClient.sendUndo(this.room));
    this.$('#redo').addEventListener('click', () => this.wsClient.sendRedo(this.room));
    this.$('#clearCanvas').addEventListener('click', () => { this.canvas.clearAll(); this.wsClient.socket.emit('clear'); });
    this.$('#downloadCanvas').addEventListener('click', () => { const link = document.createElement('a'); link.download = 'draw-guess.png'; link.href = this.canvas.toDataURL(); link.click(); });
  }
  setupCursorTracking() { let waiting = false; document.addEventListener('mousemove', event => { if (waiting) return; waiting = true; setTimeout(() => { const rect = this.$('#drawingCanvas').getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) this.wsClient.sendCursorMove(this.room, x, y); waiting = false; }, 30); }); }
  updateUserCursor(id, x, y) { if (id === this.myId) return; let cursor = this.userCursors.get(id); if (!cursor) { cursor = document.createElement('div'); cursor.className = 'user-cursor'; const name = this.playerNames.get(id) || 'Player'; cursor.innerHTML = '<div class="cursor-pointer"></div><div class="cursor-name"></div>'; cursor.querySelector('.cursor-name').textContent = name; this.$('.canvas-container').appendChild(cursor); this.userCursors.set(id, cursor); } cursor.style.transform = `translate(${x}px, ${y}px)`; }
  setupRoomControls() {
    const goNewRoom = () => location.href = `${location.origin}?room=${Math.random().toString(36).slice(2, 15)}`;
    const share = () => navigator.clipboard.writeText(`${location.origin}?room=${this.room}`).then(() => this.setAnnouncement('Room link copied!')).catch(() => {});
    this.$('#newRoomBtn').addEventListener('click', goNewRoom);
    this.$('#shareRoomBtn').addEventListener('click', share);
    const shareFooter = this.$('#shareFooter'); if (shareFooter) shareFooter.addEventListener('click', share);
  }
}
document.addEventListener('DOMContentLoaded', () => new CollaborativeDrawingApp());