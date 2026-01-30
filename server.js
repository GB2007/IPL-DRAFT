const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PICK_TIME = 30;
let rooms = {};

function startTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearInterval(room.interval);
  room.timer = PICK_TIME;

  room.interval = setInterval(() => {
    room.timer--;
    io.to(roomId).emit("timer", room.timer);

    if (room.timer <= 0) {
      clearInterval(room.interval);
      autoPick(roomId);
    }
  }, 1000);
}

function autoPick(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const available = room.players.filter(
    p => !room.picked.includes(p.name)
  );

  if (available.length === 0) return;

  const random =
    available[Math.floor(Math.random() * available.length)];

  makePick(roomId, random);
}

function makePick(roomId, player) {
  const room = rooms[roomId];
  if (!room || room.picked.includes(player.name)) return;

  const team = room.turn === 1 ? room.team1 : room.team2;

  team.team.push(player);
  if (player.foreign) team.foreign++;

  room.picked.push(player.name);
  room.turn = room.turn === 1 ? 2 : 1;

  io.to(roomId).emit("update", room);
  startTimer(roomId);
}

io.on("connection", socket => {

  socket.on("createRoom", ({ name, players }) => {
    const roomId = Math.random().toString(36).substring(2, 7);

    rooms[roomId] = {
      team1: { name, team: [], foreign: 0 },
      team2: null,
      turn: 1,
      picked: [],
      players,
      timer: PICK_TIME,
      interval: null
    };

    socket.join(roomId);
    socket.emit("roomCreated", roomId);
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room || room.team2) return;

    room.team2 = { name, team: [], foreign: 0 };
    socket.join(roomId);

    io.to(roomId).emit("start", room);
    startTimer(roomId);
  });

  socket.on("pick", ({ roomId, player }) => {
    makePick(roomId, player);
  });
});

server.listen(process.env.PORT || 3000);
