import {
  GAME_HEIGHT,
  GAME_WIDTH,
  NET_INTERVAL_MS,
  PLAYER_SIZE,
  SPEED,
} from "./config.js";
import { DEFAULT_ROOM, getRoomFromUrl, Net, setRoomInUrl, type NetStatus } from "./net.js";
import type { PlayerState } from "./types.js";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Could not find game canvas!");

const gameCtx = canvas.getContext("2d");
if (!gameCtx) throw new Error("Could not get 2D rendering context!");

const ctx: CanvasRenderingContext2D = gameCtx;

const statusEl = document.querySelector<HTMLElement>("#status");
const roomEl = document.querySelector<HTMLElement>("#room-code");
const countEl = document.querySelector<HTMLElement>("#player-count");
const copyEl = document.querySelector<HTMLButtonElement>("#copy-link");
const menuEl = document.querySelector<HTMLElement>("#menu");
const gameViewEl = document.querySelector<HTMLElement>("#game-view");
const nameInput = document.querySelector<HTMLInputElement>("#name-input");
const joinForm = document.querySelector<HTMLFormElement>("#join-form");

// --- Identity ------------------------------------------------------------

const ADJECTIVES = [
  "Swift", "Sleepy", "Angry", "Lucky", "Tiny", "Cosmic", "Silent", "Neon",
  "Fuzzy", "Brave", "Wobbly", "Sneaky", "Grumpy", "Sunny", "Rusty", "Wild",
];

const ANIMALS = [
  "Fox", "Otter", "Frog", "Panda", "Wolf", "Moth", "Gecko", "Crow",
  "Llama", "Squid", "Badger", "Koala", "Raven", "Bison", "Newt", "Yak",
];

function randomName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective}${animal}`;
}

const NAME_STORAGE_KEY = "tsgame:name";

function normalizeName(raw: string): string {
  const cleaned = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 16);
  return cleaned.length > 0 ? cleaned : randomName();
}

function rememberedName(): string {
  try {
    const saved = localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) return normalizeName(saved);
  } catch {
    // localStorage can be unavailable; just fall back to a random name.
  }
  return randomName();
}

// --- Room ----------------------------------------------------------------

const room = getRoomFromUrl() ?? DEFAULT_ROOM;
setRoomInUrl(room);

if (roomEl) roomEl.textContent = room;

// --- Players -------------------------------------------------------------

interface RemotePlayer extends PlayerState {
  renderX: number;
  renderY: number;
}

const local: PlayerState = {
  id: "",
  name: "",
  color: "#00ff66",
  x: (GAME_WIDTH - PLAYER_SIZE) / 2,
  y: (GAME_HEIGHT - PLAYER_SIZE) / 2,
};

const remotes = new Map<string, RemotePlayer>();

let net: Net | null = null;
let running = false;

function updateCount(): void {
  if (!countEl) return;
  const total = remotes.size + 1;
  countEl.textContent = total === 1 ? "1 player" : `${total} players`;
}

function describeStatus(status: NetStatus): string {
  switch (status.kind) {
    case "connecting":
      return status.detail;
    case "hosting":
      return `Hosting room ${status.room}. Share the link to invite people.`;
    case "connected":
      return `Connected to room ${status.room}.`;
    case "reconnecting":
      return status.detail;
    case "error":
      return status.detail;
  }
}

// --- Join / start --------------------------------------------------------

function startGame(name: string): void {
  if (running) return;
  running = true;

  const gameNet = new Net(room, name);
  net = gameNet;
  local.name = name;

  gameNet.handlers = {
    onStatus(status) {
      if (statusEl) statusEl.textContent = describeStatus(status);
    },
    onSelfId(id) {
      local.id = id;
      local.color = gameNet.color;
    },
    onReset() {
      remotes.clear();
      updateCount();
    },
    onJoin(player) {
      if (player.id === gameNet.selfId) return;
      remotes.set(player.id, {
        ...player,
        renderX: player.x,
        renderY: player.y,
      });
      updateCount();
    },
    onState(player) {
      if (player.id === gameNet.selfId) return;

      const remote = remotes.get(player.id);
      if (!remote) {
        remotes.set(player.id, {
          ...player,
          renderX: player.x,
          renderY: player.y,
        });
      } else {
        remote.x = player.x;
        remote.y = player.y;
        remote.name = player.name;
        remote.color = player.color;
      }
      updateCount();
    },
    onLeave(id) {
      remotes.delete(id);
      updateCount();
    },
  };

  if (menuEl) menuEl.hidden = true;
  if (gameViewEl) gameViewEl.hidden = false;

  lastTime = performance.now();
  requestAnimationFrame(frame);
  gameNet.start();
}

// --- Input ---------------------------------------------------------------

const keys = new Set<string>();

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function isMovementKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    key.startsWith("Arrow") ||
    lower === "w" ||
    lower === "a" ||
    lower === "s" ||
    lower === "d"
  );
}

window.addEventListener("keydown", (event) => {
  // Let people type W/A/S/D into the name field without stealing the keys.
  if (isTypingTarget(event.target)) return;

  if (isMovementKey(event.key)) {
    event.preventDefault();
    keys.add(event.key);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

window.addEventListener("blur", () => {
  keys.clear();
});

// --- Game loop -----------------------------------------------------------

let lastTime = performance.now();
let sendAccumulator = 0;

function update(dt: number): void {
  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;

  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  local.x += dx * SPEED * dt;
  local.y += dy * SPEED * dt;

  local.x = Math.max(0, Math.min(GAME_WIDTH - PLAYER_SIZE, local.x));
  local.y = Math.max(0, Math.min(GAME_HEIGHT - PLAYER_SIZE, local.y));

  // Smooth out remote squares between network updates.
  const smoothing = 1 - Math.exp(-12 * dt);
  for (const remote of remotes.values()) {
    remote.renderX += (remote.x - remote.renderX) * smoothing;
    remote.renderY += (remote.y - remote.renderY) * smoothing;
  }

  sendAccumulator += dt * 1000;
  if (sendAccumulator >= NET_INTERVAL_MS) {
    sendAccumulator = 0;
    net?.publish(local.x, local.y);
  }
}

function drawGrid(): void {
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= GAME_WIDTH; x += 40) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, GAME_HEIGHT);
  }
  for (let y = 0; y <= GAME_HEIGHT; y += 40) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(GAME_WIDTH, y + 0.5);
  }
  ctx.stroke();
}

function drawPlayer(player: PlayerState, isSelf: boolean): void {
  const x = Math.round(player.x);
  const y = Math.round(player.y);

  if (isSelf) {
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 16;
  }

  ctx.fillStyle = player.color;
  ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE);

  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (isSelf) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, PLAYER_SIZE - 2, PLAYER_SIZE - 2);
  }

  ctx.fillStyle = isSelf ? "#ffffff" : "#dddddd";
  ctx.font = "13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const labelY = y - 7 < 12 ? y + 15 : y - 7;
  ctx.fillText(isSelf ? `${player.name} (you)` : player.name, x + PLAYER_SIZE / 2, labelY);
}

function draw(): void {
  drawGrid();

  for (const remote of remotes.values()) {
    drawPlayer(
      {
        ...remote,
        x: remote.renderX,
        y: remote.renderY,
      },
      false,
    );
  }

  drawPlayer(local, true);
}

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// --- Copy invite link ----------------------------------------------------

copyEl?.addEventListener("click", async () => {
  const original = copyEl.textContent;

  try {
    await navigator.clipboard.writeText(window.location.href);
    copyEl.textContent = "copied!";
  } catch {
    copyEl.textContent = "copy failed";
  }

  window.setTimeout(() => {
    copyEl.textContent = original;
  }, 1500);
});

window.addEventListener("beforeunload", () => {
  net?.stop();
});

// --- Menu ----------------------------------------------------------------

joinForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = normalizeName(nameInput?.value ?? "");
  if (nameInput) nameInput.value = name;

  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Not fatal: the name just won't be remembered next time.
  }

  startGame(name);
});

if (nameInput) {
  nameInput.value = rememberedName();
  nameInput.focus();
  nameInput.select();
}

updateCount();
