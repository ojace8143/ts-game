"use strict";
const canvas = document.querySelector("#game");
if (!canvas) {
    throw new Error("Could not find game canvas!");
}
const gameCtx = canvas.getContext("2d");
if (!gameCtx) {
    throw new Error("Could not get 2D rendering context!");
}
// Narrow to non-null locals so the closures below can use them freely.
const ctx = gameCtx;
const gameCanvas = canvas;
// Player square.
const PLAYER_SIZE = 40;
const SPEED = 300; // pixels per second
const player = {
    x: 380,
    y: 280,
};
// Which arrow keys are currently held down.
const keys = new Set();
window.addEventListener("keydown", (event) => {
    if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        keys.add(event.key);
    }
});
window.addEventListener("keyup", (event) => {
    keys.delete(event.key);
});
let lastTime = performance.now();
function update(dt) {
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowLeft"))
        dx -= 1;
    if (keys.has("ArrowRight"))
        dx += 1;
    if (keys.has("ArrowUp"))
        dy -= 1;
    if (keys.has("ArrowDown"))
        dy += 1;
    // Normalize so diagonal movement isn't faster.
    if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
    }
    player.x += dx * SPEED * dt;
    player.y += dy * SPEED * dt;
    // Keep the square inside the canvas.
    player.x = Math.max(0, Math.min(gameCanvas.width - PLAYER_SIZE, player.x));
    player.y = Math.max(0, Math.min(gameCanvas.height - PLAYER_SIZE, player.y));
}
function draw() {
    // Clear the background.
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
    // Draw our player.
    ctx.fillStyle = "#00ff66";
    ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
    // Draw a little label.
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px monospace";
    ctx.fillText("Hello, TypeScript!", 20, 30);
    ctx.fillText("Use the arrow keys to move.", 20, 54);
}
function frame(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
