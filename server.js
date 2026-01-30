const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobbies = {};
const playersDB = require("./players.json"); // optional, or paste array here

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {

  socket.on("createLobby", ({ teamName }) => {
    const code = generateCode();

    lobbies[code] = {
      players: [],
      state: {
        player1: { name: teamName, team: [], foreignCount: 0 },
        player2: { name: "", team: [], foreignCount: 0 },
        currentPlayer: 1,
        pickedPlayers: []
      }
    };

    lobbies[code].players.push(socket.id);
    socket.join(code);
    socket.emit("roomCreated", code);
  });

  socket.on("joinLobby", ({ teamName, code }) => {
    const lobby = lobbies[code];
    if (!lobby) return socket.emit("errorMsg", "Room not found");

    if (lobby.players.length >= 2)
      return socket.emit("errorMsg", "Room full");

    lobby.players.push(socket.id);
    lobby.state.player2.name = teamName;
    socket.join(code);

    io.to(code).emit("draftStarted", {
      state: lobby.state,
      yourTurn: lobby.players[0] === socket.id
    });
  });

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
    room.turnSocket === room.player1Socket
      ? room.player2Socket
      : room.player1Socket;

  // 📢 UPDATE BOTH PLAYERS
  io.to(code).emit("draftUpdate", {
    state: room.state,
    yourTurn: false
  });

  // 🎯 ENABLE NEXT PLAYER
  io.to(room.turnSocket).emit("draftUpdate", {
    state: room.state,
    yourTurn: true
  });
});


  socket.on("disconnect", () => {
    for (const code in lobbies) {
      lobbies[code].players = lobbies[code].players.filter(
        id => id !== socket.id
      );
      if (lobbies[code].players.length === 0) {
        delete lobbies[code];
      }
    }
  });
});

server.listen(3000, () =>
  console.log("Server running on port 3000")
);
