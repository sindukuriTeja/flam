import express = require('express');
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as path from 'path';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const PORT = process.env.PORT || 3002;
const ROUND_SECONDS = 60;
const DRAWER_WORD_TIMEOUT_MS = 30 * 1000; // drawer must submit a word within 30s
const MAX_POINTS_PER_PATH = 600;
const MAX_PATHS_PER_ROOM = 2000;
const MAX_PATHS_PER_BURST = 60; // per 10s per socket (rate limit)

// Deliberately explicit: do not expose package.json, node_modules, or other files.
const ROOT = path.join(__dirname, '..');
const CLIENT_FILES = ['index.html', 'main.js', 'canvas.js', 'websocket.js', 'style.css'];
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
for (const file of CLIENT_FILES) app.get('/' + file, (_req, res) => res.sendFile(path.join(ROOT, file)));

interface DrawPath { id: string; points: { x: number; y: number; pressure?: number }[]; color: string; width: number; tool: string; userId: string; fill?: boolean; }
interface Player { id: string; name: string; number: number; score: number; }
interface RoomData {
  paths: DrawPath[];
  redoStack: DrawPath[];
  players: Map<string, Player>;
  nextPlayerNumber: number;
  roundNumber: number;
  drawerId: string | null;
  secretWord: string | null;
  roundLive: boolean;
  timer: NodeJS.Timeout | null;
  wordTimeout: NodeJS.Timeout | null;
}

const rooms = new Map<string, RoomData>();
function getOrCreateRoom(roomId: string): RoomData {
  let room = rooms.get(roomId);
  if (!room) {
    room = { paths: [], redoStack: [], players: new Map(), nextPlayerNumber: 1, roundNumber: 0, drawerId: null, secretWord: null, roundLive: false, timer: null, wordTimeout: null };
    rooms.set(roomId, room);
  }
  return room;
}
function publicPlayers(room: RoomData) {
  return [...room.players.values()].sort((a, b) => a.number - b.number).map(({ id, name, number, score }) => ({ id, name, number, score }));
}
function scores(room: RoomData) { return publicPlayers(room).map(({ id, name, number, score }) => ({ id, name, number, score })); }
function leaderName(room: RoomData): string | null {
  const all = [...room.players.values()];
  if (!all.length) return null;
  const best = Math.max(...all.map(player => player.score));
  return all.filter(player => player.score === best).map(player => player.name).join(' & ');
}
function emitPlayers(roomId: string, room: RoomData) {
  io.to(roomId).emit('playersUpdated', { players: publicPlayers(room).map(({ id, name, number }) => ({ id, name, number })), count: room.players.size });
  io.to(roomId).emit('userJoined', { userCount: room.players.size });
  io.to(roomId).emit('scoreboard', { scores: scores(room), leaderName: leaderName(room) });
}
function stopTimers(room: RoomData) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  if (room.wordTimeout) clearTimeout(room.wordTimeout);
  room.wordTimeout = null;
}
function endRound(roomId: string, room: RoomData, guesser: Player | null) {
  if (!room.drawerId || !room.secretWord) return;
  stopTimers(room);
  const word = room.secretWord;
  room.roundLive = false;
  room.drawerId = null;
  room.secretWord = null;
  io.to(roomId).emit('roundEnded', { guesserName: guesser ? guesser.name : null, word, scores: scores(room) });
  io.to(roomId).emit('scoreboard', { scores: scores(room), leaderName: leaderName(room) });
}
function cancelRound(roomId: string, room: RoomData, reason: string) {
  stopTimers(room);
  room.roundLive = false;
  room.drawerId = null;
  room.secretWord = null;
  io.to(roomId).emit('roundEnded', { guesserName: null, word: reason, scores: scores(room) });
  io.to(roomId).emit('scoreboard', { scores: scores(room), leaderName: leaderName(room) });
}
function removeFromRoom(roomId: string, socketId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const wasDrawer = room.drawerId === socketId;
  room.players.delete(socketId);
  if (wasDrawer) cancelRound(roomId, room, 'Round cancelled (drawer left)');
  if (room.players.size === 0) { stopTimers(room); rooms.delete(roomId); return; }
  emitPlayers(roomId, room);
}

// --- input validation -------------------------------------------------------
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function sanitizePath(raw: any): DrawPath | null {
  if (!raw || typeof raw !== 'object') return null;
  const points = Array.isArray(raw.points) ? raw.points : null;
  if (!points || points.length === 0 || points.length > MAX_POINTS_PER_PATH) return null;
  const cleanPoints: { x: number; y: number; pressure?: number }[] = [];
  for (const p of points) {
    if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return null;
    const pt: { x: number; y: number; pressure?: number } = { x: p.x, y: p.y };
    if (isFiniteNumber(p.pressure)) pt.pressure = p.pressure;
    cleanPoints.push(pt);
  }
  const tool = typeof raw.tool === 'string' ? raw.tool.slice(0, 20) : 'brush';
  const color = typeof raw.color === 'string' ? raw.color.slice(0, 32) : '#000000';
  const width = isFiniteNumber(raw.width) ? Math.min(200, Math.max(1, raw.width)) : 5;
  return {
    id: typeof raw.id === 'string' ? raw.id.slice(0, 32) : Math.random().toString(36).slice(2, 11),
    points: cleanPoints,
    color,
    width,
    tool,
    fill: !!raw.fill,
    userId: typeof raw.userId === 'string' ? raw.userId.slice(0, 64) : ''
  };
}

// Simple per-socket rate limiting for draw events (sliding window).
const drawRate = new Map<string, number[]>();
function drawRateOk(socketId: string): boolean {
  const now = Date.now();
  const windowMs = 10000;
  let stamps = drawRate.get(socketId);
  if (!stamps) { stamps = []; drawRate.set(socketId, stamps); }
  while (stamps.length && now - stamps[0] > windowMs) stamps.shift();
  if (stamps.length >= MAX_PATHS_PER_BURST) return false;
  stamps.push(now);
  return true;
}

io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;

  socket.on('joinRoom', (join: string | { roomId?: string; name?: string }) => {
    const suppliedRoom = typeof join === 'string' ? join : join?.roomId;
    const suppliedName = typeof join === 'string' ? '' : (join?.name || '');
    const roomId = (typeof suppliedRoom === 'string' ? suppliedRoom.trim() : '') || 'default';
    if (currentRoom) { socket.leave(currentRoom); removeFromRoom(currentRoom, socket.id); }
    currentRoom = roomId;
    socket.join(roomId);
    const room = getOrCreateRoom(roomId);
    const cleanName = (typeof suppliedName === 'string' ? suppliedName.trim() : '').slice(0, 24) || `Player ${room.nextPlayerNumber}`;
    room.players.set(socket.id, { id: socket.id, name: cleanName, number: room.nextPlayerNumber++, score: 0 });
    socket.emit('roomState', { paths: room.paths });
    emitPlayers(roomId, room);
  });

  socket.on('draw', (data: { roomId: string; path: DrawPath }) => {
    if (!currentRoom || !data?.path) return;
    const room = getOrCreateRoom(currentRoom);
    // During an active Pictionary round only the server-selected drawer may draw.
    if (room.roundLive && room.drawerId !== socket.id) return;
    if (!drawRateOk(socket.id)) return;
    const path = sanitizePath(data.path);
    if (!path) return;
    room.paths.push(path);
    if (room.paths.length > MAX_PATHS_PER_ROOM) room.paths.splice(0, room.paths.length - MAX_PATHS_PER_ROOM);
    socket.to(currentRoom).emit('draw', { path });
  });

  // Server-authoritative undo: pop the shared last path, everyone removes it by id.
  socket.on('undo', () => {
    if (!currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    const path = room.paths.pop();
    if (!path) return;
    room.redoStack.push(path);
    io.to(currentRoom).emit('undoPath', { pathId: path.id });
  });

  // Server-authoritative redo: restore the path and send it back to everyone.
  socket.on('redo', () => {
    if (!currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    const path = room.redoStack.pop();
    if (!path) return;
    room.paths.push(path);
    io.to(currentRoom).emit('redoPath', { path });
  });

  socket.on('cursorMove', (data: { roomId: string; x: number; y: number }) => {
    if (currentRoom && data && isFiniteNumber(data.x) && isFiniteNumber(data.y)) {
      socket.to(currentRoom).emit('cursorMove', { userId: socket.id, x: data.x, y: data.y });
    }
  });

  socket.on('ping', () => socket.emit('pong'));

  socket.on('clear', () => {
    if (!currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    // During a live round only the drawer may clear the canvas.
    if (room.roundLive && room.drawerId !== socket.id) return;
    room.paths = [];
    room.redoStack = [];
    io.to(currentRoom).emit('canvasCleared', {});
  });

  socket.on('startRound', () => {
    if (!currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    if (room.players.size < 2 || room.drawerId || room.roundLive) return;
    const players = [...room.players.values()];
    const drawer = players[Math.floor(Math.random() * players.length)];
    room.roundNumber += 1;
    room.drawerId = drawer.id;
    room.secretWord = null;
    room.redoStack = [];
    io.to(currentRoom).emit('roundStarted', { drawerId: drawer.id, drawerName: drawer.name, roundNumber: room.roundNumber, timerSeconds: ROUND_SECONDS });
    // If the drawer never submits a word, cancel the round automatically.
    room.wordTimeout = setTimeout(() => {
      if (room.drawerId === drawer.id && !room.roundLive) cancelRound(currentRoom!, room, 'Round cancelled (no word)');
    }, DRAWER_WORD_TIMEOUT_MS);
  });

  socket.on('submitWord', (rawWord: string) => {
    if (!currentRoom || typeof rawWord !== 'string') return;
    const room = getOrCreateRoom(currentRoom);
    const word = rawWord.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (room.drawerId !== socket.id || room.roundLive || !word) return;
    room.secretWord = word;
    room.roundLive = true;
    room.paths = [];
    room.redoStack = [];
    if (room.wordTimeout) clearTimeout(room.wordTimeout);
    room.wordTimeout = null;
    io.to(currentRoom).emit('canvasCleared', {});
    socket.emit('secretWord', word); // drawer confirmation only
    socket.to(currentRoom).emit('wordSubmitted', {});
    room.timer = setTimeout(() => endRound(currentRoom!, room, null), ROUND_SECONDS * 1000);
  });

  socket.on('guess', (rawGuess: string) => {
    if (!currentRoom || typeof rawGuess !== 'string') return;
    const room = getOrCreateRoom(currentRoom);
    const guesser = room.players.get(socket.id);
    if (!guesser || !room.roundLive || !room.secretWord || room.drawerId === socket.id) return;
    const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (normalized(rawGuess) !== normalized(room.secretWord)) { socket.emit('guessResult', { correct: false }); return; }
    guesser.score += 10;
    socket.emit('guessResult', { correct: true, guesserName: guesser.name });
    endRound(currentRoom, room, guesser);
  });

  socket.on('endGame', () => {
    if (!currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    if (!room.players.size) return;
    if (room.roundLive && room.secretWord) endRound(currentRoom, room, null);
    else { stopTimers(room); room.drawerId = null; room.secretWord = null; room.roundLive = false; }
    const allScores = scores(room);
    const top = Math.max(...allScores.map(score => score.score));
    const winners = allScores.filter(score => score.score === top).map(score => score.name);
    io.to(currentRoom).emit('gameOver', { winnerName: winners.join(' & '), scores: allScores });
    io.to(currentRoom).emit('scoreboard', { scores: allScores, leaderName: leaderName(room) });
  });

  socket.on('disconnect', () => {
    drawRate.delete(socket.id);
    if (currentRoom) removeFromRoom(currentRoom, socket.id);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));