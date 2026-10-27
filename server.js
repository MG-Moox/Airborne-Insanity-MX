
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "online", game: "Airborne Insanity MX" });
});

io.on("connection", (socket) => {
  console.log("Rider connected:", socket.id);

  socket.on("join-game", () => {
    socket.join("freeride");
    socket.emit("game-message", "Connected to Freeride!");
  });

  socket.on("disconnect", () => {
    console.log("Rider disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Airborne Insanity MX running on port ${PORT}`);
});
