const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobbies = {};
const playersDB = require("./players.json");

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {

  // ================= CREATE ROOM =================
  socket.on("createLobby", ({ teamName }) => {
    const code = generateCode();

    lobbies[code] = {
      player1Socket: socket.id,
      player2Socket: null,
      turnSocket: socket.id, // ✅ FIRST TURN
      state: {
        player1: { name: teamName, team: [], foreignCount: 0 },
        player2: { name: "", team: [], foreignCount: 0 },
        currentPlayer: 1,
        pickedPlayers: []
      }
    };

    socket.join(code);
    socket.emit("roomCreated", code);
  });

  // ================= JOIN ROOM =================
  socket.on("joinLobby", ({ teamName, code }) => {
    const room = lobbies[code];
    if (!room) return socket.emit("errorMsg", "Room not found");
    if (room.player2Socket) return socket.emit("errorMsg", "Room full");

    room.player2Socket = socket.id;
    room.state.player2.name = teamName;

    socket.join(code);

    // 🔥 START DRAFT FOR BOTH
    io.to(code).emit("draftStarted", {
      state: room.state
    });

    // 🔥 ENABLE TURN FOR PLAYER 1
    io.to(room.turnSocket).emit("yourTurn");
  });

  // ================= PICK PLAYER =================
  socket.on("pickPlayer", ({ code, playerName }) => {
    const room = lobbies[code];
    if (!room) return;

    // ❌ Not your turn
    if (socket.id !== room.turnSocket) return;

    // ❌ Already picked
    if (room.state.pickedPlayers.includes(playerName)) return;

    // 🔍 Find player
    const player = playersDB.find(p => p.name === playerName);
    if (!player) return;

    // 👤 Current team
    const currentTeam =
      room.state.currentPlayer === 1
        ? room.state.player1
        : room.state.player2;

    // ❌ Team full
    if (currentTeam.team.length >= 11) return;

    // ❌ Overseas limit
    if (player.foreign && currentTeam.foreignCount >= 4) return;

    // ✅ ADD PLAYER
    currentTeam.team.push(player);
    room.state.pickedPlayers.push(player.name);
    if (player.foreign) currentTeam.foreignCount++;

    // 🔁 SWITCH TURN
    room.state.currentPlayer =
      room.state.currentPlayer === 1 ? 2 : 1;

    room.turnSocket =
      room.state.currentPlayer === 1
        ? room.player1Socket
        : room.player2Socket;

    // 🔄 UPDATE STATE FOR BOTH
    io.to(code).emit("draftUpdate", {
      state: room.state
    });

    // 🎯 ENABLE NEXT PLAYER ONLY
    io.to(room.turnSocket).emit("yourTurn");
  });

  // ================= DISCONNECT =================
  socket.on("disconnect", () => {
    for (const code in lobbies) {
      const room = lobbies[code];
      if (
        room.player1Socket === socket.id ||
        room.player2Socket === socket.id
      ) {
        delete lobbies[code];
      }
    }
  });
});

server.listen(3000, () =>
  console.log("Server running on port 3000")
);

