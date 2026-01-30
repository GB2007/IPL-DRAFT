const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ===============================
   IN-MEMORY LOBBIES
================================ */
const lobbies = {};

/* ===============================
   SOCKET LOGIC
================================ */
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  /* ---------- CREATE LOBBY ---------- */
  socket.on("createLobby", ({ teamName, players }) => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();

    lobbies[code] = {
      playersPool: players,
      sockets: [socket.id],
      state: {
        player1: { name: teamName, team: [], foreignCount: 0 },
        player2: { name: "", team: [], foreignCount: 0 },
        pickedPlayers: [],
        currentPlayer: 1
      }
    };

    socket.join(code);
    socket.emit("roomCreated", code);
  });

  /* ---------- JOIN LOBBY ---------- */
  socket.on("joinLobby", ({ teamName, code }) => {
    const lobby = lobbies[code];

    if (!lobby) {
      socket.emit("errorMsg", "Room does not exist");
      return;
    }

    if (lobby.sockets.length >= 2) {
      socket.emit("errorMsg", "Room is full");
      return;
    }

    lobby.sockets.push(socket.id);
    lobby.state.player2.name = teamName;

    socket.join(code);
    socket.emit("joinedRoom", code);

    /* ---------- AUTO START DRAFT ---------- */
    io.to(code).emit("draftStarted", {
      state: lobby.state,
      yourTurn: lobby.sockets[0] === socket.id ? false : true
    });

    // Tell first player it's their turn
    io.to(lobby.sockets[0]).emit("draftUpdate", {
      state: lobby.state,
      yourTurn: true
    });
  });

  /* ---------- PICK PLAYER ---------- */
  socket.on("pickPlayer", ({ code, playerName }) => {
    const lobby = lobbies[code];
    if (!lobby) return;

    const currentSocket =
      lobby.state.currentPlayer === 1
        ? lobby.sockets[0]
        : lobby.sockets[1];

    // ❌ Not your turn
    if (socket.id !== currentSocket) return;

    // ❌ Already picked
    if (lobby.state.pickedPlayers.includes(playerName)) return;

    const player = lobby.playersPool.find(p => p.name === playerName);
    if (!player) return;

    const team =
      lobby.state.currentPlayer === 1
        ? lobby.state.player1
        : lobby.state.player2;

    // Constraints
    if (team.team.length >= 11) return;
    if (player.foreign && team.foreignCount >= 4) return;

    // Add player
    team.team.push(player);
    lobby.state.pickedPlayers.push(player.name);
    if (player.foreign) team.foreignCount++;

    // Switch turn
    lobby.state.currentPlayer =
      lobby.state.currentPlayer === 1 ? 2 : 1;

    // Sync both players
    lobby.sockets.forEach((id, idx) => {
      io.to(id).emit("draftUpdate", {
        state: lobby.state,
        yourTurn: lobby.state.currentPlayer === idx + 1
      });
    });
  });

  /* ---------- DISCONNECT ---------- */
  socket.on("disconnect", () => {
    for (const code in lobbies) {
      const lobby = lobbies[code];
      if (lobby.sockets.includes(socket.id)) {
        delete lobbies[code];
        io.to(code).emit("errorMsg", "Opponent disconnected");
      }
    }
  });
});

/* ===============================
   START SERVER
================================ */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log("Server running on port", PORT)
);
