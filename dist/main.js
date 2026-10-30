import { GAME_HEIGHT, GAME_WIDTH, NET_INTERVAL_MS, PLAYER_SIZE, SPEED, } from "./config.js";
import { DEFAULT_ROOM, getRoomFromUrl, Net, setRoomInUrl } from "./net.js";
const canvas = document.querySelector("#game");
if (!canvas)
    throw new Error("Could not find game canvas!");
const gameCtx = canvas.getContext("2d");
if (!gameCtx)
    throw new Error("Could not get 2D rendering context!");
const ctx = gameCtx;
const statusEl = document.querySelector("#status");
const roomEl = document.querySelector("#room-code");
const countEl = document.querySelector("#player-count");
const copyEl = document.querySelector("#copy-link");
// --- Identity ------------------------------------------------------------
const ADJECTIVES = [
    "Swift", "Sleepy", "Angry", "Lucky", "Tiny", "Cosmic", "Silent", "Neon",
    "Fuzzy", "Brave", "Wobbly", "Sneaky", "Grumpy", "Sunny", "Rusty", "Wild",
];
const ANIMALS = [
    "Fox", "Otter", "Frog", "Panda", "Wolf", "Moth", "Gecko", "Crow",
    "Llama", "Squid", "Badger", "Koala", "Raven", "Bison", "Newt", "Yak",
];
function randomName() {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${adjective}${animal}`;
}
const myName = randomName();
// --- Room ----------------------------------------------------------------
const room = getRoomFromUrl() ?? DEFAULT_ROOM;
setRoomInUrl(room);
if (roomEl)
    roomEl.textContent = room;
const local = {
    id: "",
    name: myName,
    color: "#00ff66",
    x: (GAME_WIDTH - PLAYER_SIZE) / 2,
    y: (GAME_HEIGHT - PLAYER_SIZE) / 2,
};
const remotes = new Map();
const net = new Net(room, myName);
function updateCount() {
    if (!countEl)
        return;
    const total = remotes.size + 1;
    countEl.textContent = total === 1 ? "1 player" : `${total} players`;
}
function describeStatus(status) {
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
net.handlers = {
    onStatus(status) {
        if (statusEl)
            statusEl.textContent = describeStatus(status);
    },
    onSelfId(id) {
        local.id = id;
        local.color = net.color;
    },
    onReset() {
        remotes.clear();
        updateCount();
    },
    onJoin(player) {
        if (player.id === net.selfId)
            return;
        remotes.set(player.id, {
            ...player,
            renderX: player.x,
            renderY: player.y,
        });
        updateCount();
    },
    onState(player) {
        if (player.id === net.selfId)
            return;
        const remote = remotes.get(player.id);
        if (!remote) {
            remotes.set(player.id, {
                ...player,
                renderX: player.x,
                renderY: player.y,
            });
        }
        else {
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
// --- Input ---------------------------------------------------------------
const keys = new Set();
function isMovementKey(key) {
    const lower = key.toLowerCase();
    return (key.startsWith("Arrow") ||
        lower === "w" ||
        lower === "a" ||
        lower === "s" ||
        lower === "d");
}
window.addEventListener("keydown", (event) => {
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
function update(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A"))
        dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D"))
        dx += 1;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W"))
        dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S"))
        dy += 1;
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
        net.publish(local.x, local.y);
    }
}
function drawGrid() {
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
function drawPlayer(player, isSelf) {
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
function draw() {
    drawGrid();
    for (const remote of remotes.values()) {
        drawPlayer({
            ...remote,
            x: remote.renderX,
            y: remote.renderY,
        }, false);
    }
    drawPlayer(local, true);
}
function frame(now) {
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
    }
    catch {
        copyEl.textContent = "copy failed";
    }
    window.setTimeout(() => {
        copyEl.textContent = original;
    }, 1500);
});
window.addEventListener("beforeunload", () => {
    net.stop();
});
// --- Go ------------------------------------------------------------------
updateCount();
net.start();
requestAnimationFrame(frame);
