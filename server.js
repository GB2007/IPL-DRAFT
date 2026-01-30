const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobbies = {};
const PICK_TIME = 30;

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // CREATE LOBBY
  socket.on("createLobby", ({ teamName, players }) => {
    const code = generateCode();

    lobbies[code] = {
      code,
      teams: [{ id: socket.id, name: teamName, picks: [] }],
      availablePlayers: [...players],
      turnIndex: 0,
      timer: PICK_TIME,
      interval: null,
      started: false
    };

    socket.join(code);
    socket.emit("lobbyCreated", code);
  });

  // JOIN LOBBY
  socket.on("joinLobby", ({ code, teamName }) => {
    const lobby = lobbies[code];
    if (!lobby) {
      socket.emit("errorMsg", "Lobby not found");
      return;
    }

    if (lobby.teams.length >= 2) {
      socket.emit("errorMsg", "Lobby already full");
      return;
    }

    lobby.teams.push({ id: socket.id, name: teamName, picks: [] });
    socket.join(code);

    lobby.started = true;
    startDraft(lobby);
  });

  // PICK PLAYER
  socket.on("pickPlayer", ({ code, playerName }) => {
    const lobby = lobbies[code];
    if (!lobby) return;

    const currentTeam = lobby.teams[lobby.turnIndex];
    if (currentTeam.id !== socket.id) return;

    const player = lobby.availablePlayers.find(p => p.name === playerName);
    if (!player) return;

    currentTeam.picks.push(player);
    lobby.availablePlayers = lobby.availablePlayers.filter(
      p => p.name !== playerName
    );

    lobby.turnIndex = (lobby.turnIndex + 1) % lobby.teams.length;
    lobby.timer = PICK_TIME;

    io.to(code).emit("stateUpdate", lobby);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

function startDraft(lobby) {
  io.to(lobby.code).emit("draftStarted", lobby);
  startTimer(lobby);
}

function startTimer(lobby) {
  clearInterval(lobby.interval);

  lobby.interval = setInterval(() => {
    lobby.timer--;
    io.to(lobby.code).emit("timerUpdate", lobby.timer);

    if (lobby.timer <= 0) {
      autoPick(lobby);
    }
  }, 1000);
}

function autoPick(lobby) {
  if (lobby.availablePlayers.length === 0) return;

  const random =
    lobby.availablePlayers[
      Math.floor(Math.random() * lobby.availablePlayers.length)
    ];

  lobby.teams[lobby.turnIndex].picks.push(random);
  lobby.availablePlayers = lobby.availablePlayers.filter(
    p => p.name !== random.name
  );

  lobby.turnIndex = (lobby.turnIndex + 1) % lobby.teams.length;
  lobby.timer = PICK_TIME;

  io.to(lobby.code).emit("stateUpdate", lobby);
}

server.listen(process.env.PORT || 3000);
