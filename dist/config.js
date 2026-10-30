// Shared game constants. Kept in one place so the networking layer and the
// renderer agree on the playfield size and movement speed.
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const PLAYER_SIZE = 40;
export const SPEED = 300; // pixels per second
export const NET_HZ = 20;
export const NET_INTERVAL_MS = 1000 / NET_HZ;
