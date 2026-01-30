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
    const lobby = lobbies[code];
    if (!lobby) return;

    const state = lobby.state;
    const currentSocket =
      state.currentPlayer === 1
        ? lobby.players[0]
        : lobby.players[1];

    if (socket.id !== currentSocket) return;

    if (state.pickedPlayers.includes(playerName)) return;

    const player = playersDB.find(p => p.name === playerName);
    if (!player) return;

    const team =
      state.currentPlayer === 1 ? state.player1 : state.player2;

    if (player.foreign && team.foreignCount >= 4) return;
    if (team.team.length >= 11) return;

    team.team.push(player);
    state.pickedPlayers.push(player.name);
    if (player.foreign) team.foreignCount++;

    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;

    io.to(code).emit("draftUpdate", {
      state,
      yourTurn:
        lobby.players[state.currentPlayer - 1] === socket.id
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
