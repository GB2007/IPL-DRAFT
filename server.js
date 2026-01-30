const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createRoom", (name) => {
    const room = generateRoomCode();

    rooms[room] = {
      players: [{ id: socket.id, name }],
      turn: 0,
      draftStarted: false,
      timer: 30
    };

    socket.join(room);
    socket.emit("roomCreated", room);
  });

  socket.on("joinRoom", ({ name, room }) => {
    if (!rooms[room]) {
      socket.emit("errorMsg", "Room does not exist");
      return;
    }

    if (rooms[room].players.length >= 2) {
      socket.emit("errorMsg", "Room already full");
      return;
    }

    rooms[room].players.push({ id: socket.id, name });
    socket.join(room);

    io.to(room).emit("joinedRoom", room);
    io.to(room).emit("playerJoined", name);

    startDraft(room);
  });

  socket.on("pick", ({ room, player }) => {
    const game = rooms[room];
    if (!game) return;

    const currentPlayer = game.players[game.turn];
    if (socket.id !== currentPlayer.id) return;

    io.to(room).emit("playerPicked", {
      by: currentPlayer.name,
      player
    });

    game.turn = (game.turn + 1) % 2;
    game.timer = 30;

    io.to(room).emit("turnUpdate", game.players[game.turn].name);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

function startDraft(room) {
  const game = rooms[room];
  if (!game || game.draftStarted) return;

  game.draftStarted = true;

  io.to(room).emit("draftStarted", {
    firstTurn: game.players[0].name
  });

  startTimer(room);
}

function startTimer(room) {
  const game = rooms[room];
  if (!game) return;

  const interval = setInterval(() => {
    if (!rooms[room]) {
      clearInterval(interval);
      return;
    }

    game.timer--;
    io.to(room).emit("timer", game.timer);

    if (game.timer <= 0) {
      io.to(room).emit("autoPick", game.players[game.turn].name);
      game.turn = (game.turn + 1) % 2;
      game.timer = 30;
      io.to(room).emit("turnUpdate", game.players[game.turn].name);
    }
  }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));
