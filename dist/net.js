import { GAME_HEIGHT, GAME_WIDTH, PLAYER_SIZE } from "./config.js";
const ROOM_PATTERN = /^[A-Z0-9]{4,12}$/;
// Everybody who opens the site without an explicit room lands here, so
// visitors see each other. `#room=SOMETHING` still works for private games.
export const DEFAULT_ROOM = "LOBBY";
const PALETTE = [
    "#00ff66",
    "#5ca8ff",
    "#ff5c8a",
    "#ffd166",
    "#c77dff",
    "#4ecdc4",
    "#ff8c42",
    "#f15bb5",
    "#9b5de5",
    "#00bbf9",
];
const DEFAULT_COLOR = PALETTE[0];
const RECONNECT_DELAY_MS = 1500;
const TAKEOVER_AFTER_ATTEMPTS = 12;
export function getRoomFromUrl() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const room = (params.get("room") ?? "").trim().toUpperCase();
    return ROOM_PATTERN.test(room) ? room : null;
}
export function setRoomInUrl(room) {
    const url = new URL(window.location.href);
    url.hash = `room=${room}`;
    history.replaceState(null, "", url);
}
function hostId(room) {
    return `tsgame-${room}-host`;
}
function clientId(room) {
    return `tsgame-${room}-${Math.random().toString(36).slice(2, 10)}`;
}
function colorForId(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function cleanName(name) {
    const cleaned = name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 16);
    return cleaned.length > 0 ? cleaned : "player";
}
function cleanColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR;
}
function readPlayer(value) {
    if (typeof value !== "object" || value === null)
        return null;
    const player = value;
    if (typeof player.id !== "string" ||
        typeof player.name !== "string" ||
        typeof player.color !== "string" ||
        typeof player.x !== "number" ||
        typeof player.y !== "number" ||
        !Number.isFinite(player.x) ||
        !Number.isFinite(player.y)) {
        return null;
    }
    return {
        id: player.id.slice(0, 64),
        name: cleanName(player.name),
        color: cleanColor(player.color),
        x: clamp(player.x, 0, GAME_WIDTH - PLAYER_SIZE),
        y: clamp(player.y, 0, GAME_HEIGHT - PLAYER_SIZE),
    };
}
function parseMessage(raw) {
    if (typeof raw !== "object" || raw === null)
        return null;
    const message = raw;
    switch (message.t) {
        case "hello": {
            if (typeof message.name !== "string" ||
                typeof message.color !== "string" ||
                typeof message.x !== "number" ||
                typeof message.y !== "number" ||
                !Number.isFinite(message.x) ||
                !Number.isFinite(message.y)) {
                return null;
            }
            return {
                t: "hello",
                name: message.name,
                color: message.color,
                x: message.x,
                y: message.y,
            };
        }
        case "welcome": {
            if (typeof message.selfId !== "string" || !Array.isArray(message.players)) {
                return null;
            }
            const players = message.players
                .map(readPlayer)
                .filter((player) => player !== null);
            return { t: "welcome", selfId: message.selfId, players };
        }
        case "join": {
            const player = readPlayer(message.player);
            return player ? { t: "join", player } : null;
        }
        case "state": {
            const player = readPlayer(message.player);
            return player ? { t: "state", player } : null;
        }
        case "leave":
            return typeof message.id === "string" ? { t: "leave", id: message.id } : null;
        default:
            return null;
    }
}
function send(connection, message) {
    if (!connection.open)
        return;
    try {
        connection.send(message);
    }
    catch {
        // The connection went away between the check and the send. The close
        // handler will clean things up.
    }
}
export class Net {
    room;
    name;
    selfId = "";
    handlers = {};
    peer = null;
    hostConnection = null;
    connections = new Map();
    players = new Map();
    hosting = false;
    stopped = false;
    started = false;
    reconnectTimer = null;
    reconnectAttempts = 0;
    tookOver = false;
    localX = (GAME_WIDTH - PLAYER_SIZE) / 2;
    localY = (GAME_HEIGHT - PLAYER_SIZE) / 2;
    selfColor = DEFAULT_COLOR;
    constructor(room, name) {
        this.room = room;
        this.name = cleanName(name);
    }
    get color() {
        return this.selfColor;
    }
    start() {
        if (this.started || this.stopped)
            return;
        this.started = true;
        if (typeof Peer === "undefined") {
            this.setStatus({
                kind: "error",
                detail: "PeerJS failed to load. Check your connection and reload.",
            });
            return;
        }
        this.setStatus({ kind: "connecting", detail: "Connecting to signaling server…" });
        this.tryHost();
    }
    stop() {
        this.stopped = true;
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        for (const connection of this.connections.values()) {
            connection.close();
        }
        this.connections.clear();
        this.hostConnection?.close();
        this.hostConnection = null;
        this.peer?.destroy();
        this.peer = null;
    }
    publish(x, y) {
        this.localX = clamp(x, 0, GAME_WIDTH - PLAYER_SIZE);
        this.localY = clamp(y, 0, GAME_HEIGHT - PLAYER_SIZE);
        if (!this.selfId)
            return;
        const player = {
            id: this.selfId,
            name: this.name,
            color: this.selfColor,
            x: this.localX,
            y: this.localY,
        };
        if (this.hosting) {
            this.players.set(this.selfId, player);
            this.broadcast({ t: "state", player });
        }
        else if (this.hostConnection?.open) {
            send(this.hostConnection, { t: "state", player });
        }
    }
    // --- Host side ---------------------------------------------------------
    tryHost() {
        const peer = new Peer(hostId(this.room), { debug: 0 });
        this.peer = peer;
        let opened = false;
        peer.on("open", (id) => {
            opened = true;
            this.hosting = true;
            this.selfId = id;
            this.selfColor = colorForId(id);
            this.players.set(id, {
                id,
                name: this.name,
                color: this.selfColor,
                x: this.localX,
                y: this.localY,
            });
            this.handlers.onSelfId?.(id);
            this.setStatus({ kind: "hosting", room: this.room });
        });
        peer.on("connection", (connection) => this.acceptConnection(connection));
        peer.on("error", (error) => {
            if (!opened && error.type === "unavailable-id") {
                // Somebody already hosts this room, so join it instead.
                peer.destroy();
                if (this.peer === peer)
                    this.peer = null;
                this.hosting = false;
                this.tryJoin();
                return;
            }
            if (error.type === "network" ||
                error.type === "server-error" ||
                error.type === "socket-error") {
                this.setStatus({ kind: "error", detail: `Signaling error: ${error.type}` });
            }
        });
        peer.on("disconnected", () => {
            if (!peer.destroyed && !this.stopped)
                peer.reconnect();
        });
    }
    acceptConnection(connection) {
        if (!this.hosting) {
            connection.close();
            return;
        }
        connection.on("data", (data) => this.handleHostData(connection, data));
        connection.on("close", () => this.dropClient(connection.peer, connection));
        connection.on("error", () => this.dropClient(connection.peer, connection));
    }
    handleHostData(connection, raw) {
        const current = this.connections.get(connection.peer);
        if (current !== undefined && current !== connection)
            return;
        const message = parseMessage(raw);
        if (!message)
            return;
        if (message.t === "hello") {
            const player = {
                id: connection.peer,
                name: cleanName(message.name),
                color: cleanColor(message.color),
                x: clamp(message.x, 0, GAME_WIDTH - PLAYER_SIZE),
                y: clamp(message.y, 0, GAME_HEIGHT - PLAYER_SIZE),
            };
            this.connections.set(connection.peer, connection);
            this.players.set(connection.peer, player);
            send(connection, {
                t: "welcome",
                selfId: connection.peer,
                players: [...this.players.values()],
            });
            this.broadcast({ t: "join", player }, connection.peer);
            this.handlers.onJoin?.(player);
            return;
        }
        if (message.t === "state") {
            const existing = this.players.get(connection.peer);
            if (!existing)
                return;
            const player = {
                ...existing,
                x: clamp(message.player.x, 0, GAME_WIDTH - PLAYER_SIZE),
                y: clamp(message.player.y, 0, GAME_HEIGHT - PLAYER_SIZE),
            };
            this.players.set(connection.peer, player);
            this.broadcast({ t: "state", player }, connection.peer);
            this.handlers.onState?.(player);
        }
    }
    dropClient(id, connection) {
        if (this.connections.get(id) !== connection)
            return;
        this.connections.delete(id);
        this.players.delete(id);
        this.broadcast({ t: "leave", id });
        this.handlers.onLeave?.(id);
    }
    broadcast(message, exceptId) {
        for (const [id, connection] of this.connections) {
            if (id === exceptId)
                continue;
            send(connection, message);
        }
    }
    // --- Client side -------------------------------------------------------
    tryJoin() {
        const peer = new Peer(clientId(this.room), { debug: 0 });
        this.peer = peer;
        peer.on("open", (id) => {
            this.selfId = id;
            this.selfColor = colorForId(id);
            this.handlers.onSelfId?.(id);
            this.connectToHost();
        });
        peer.on("error", (error) => {
            if (error.type === "peer-unavailable") {
                this.scheduleReconnect("Host not reachable");
                return;
            }
            if (error.type === "unavailable-id") {
                // Random client id collided; grab a fresh one.
                peer.destroy();
                if (this.peer === peer)
                    this.peer = null;
                if (!this.stopped)
                    this.tryJoin();
                return;
            }
            if (error.type === "network" ||
                error.type === "server-error" ||
                error.type === "socket-error") {
                this.setStatus({ kind: "error", detail: `Signaling error: ${error.type}` });
            }
        });
        peer.on("disconnected", () => {
            if (!peer.destroyed && !this.stopped)
                peer.reconnect();
        });
    }
    connectToHost() {
        const peer = this.peer;
        if (!peer || peer.destroyed || this.hostConnection || this.stopped)
            return;
        this.setStatus({
            kind: "connecting",
            detail: `Joining room ${this.room}…`,
        });
        let connection;
        try {
            connection = peer.connect(hostId(this.room), { reliable: true });
        }
        catch {
            this.scheduleReconnect("Could not open connection");
            return;
        }
        this.hostConnection = connection;
        connection.on("open", () => {
            this.reconnectAttempts = 0;
            send(connection, {
                t: "hello",
                name: this.name,
                color: this.selfColor,
                x: this.localX,
                y: this.localY,
            });
        });
        connection.on("data", (data) => this.handleClientData(data));
        const fail = () => {
            if (this.hostConnection !== connection)
                return;
            this.hostConnection = null;
            this.scheduleReconnect("Connection to host lost");
        };
        connection.on("close", fail);
        connection.on("error", fail);
    }
    handleClientData(raw) {
        const message = parseMessage(raw);
        if (!message)
            return;
        switch (message.t) {
            case "welcome":
                this.handlers.onReset?.();
                for (const player of message.players) {
                    if (player.id === this.selfId)
                        continue;
                    this.handlers.onJoin?.(player);
                }
                this.setStatus({ kind: "connected", room: this.room });
                break;
            case "join":
                if (message.player.id !== this.selfId) {
                    this.handlers.onJoin?.(message.player);
                }
                break;
            case "state":
                if (message.player.id !== this.selfId) {
                    this.handlers.onState?.(message.player);
                }
                break;
            case "leave":
                this.handlers.onLeave?.(message.id);
                break;
        }
    }
    scheduleReconnect(reason) {
        if (this.stopped || this.hosting || this.reconnectTimer !== null)
            return;
        this.reconnectAttempts += 1;
        if (this.reconnectAttempts > TAKEOVER_AFTER_ATTEMPTS && !this.tookOver) {
            this.tookOver = true;
            this.setStatus({
                kind: "connecting",
                detail: "Host is gone, taking over the room…",
            });
            this.peer?.destroy();
            this.peer = null;
            this.hostConnection = null;
            this.tryHost();
            return;
        }
        this.setStatus({
            kind: "reconnecting",
            detail: `${reason}. Retrying (${this.reconnectAttempts})…`,
        });
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            if (this.stopped || this.hosting)
                return;
            if (this.hostConnection?.open)
                return;
            this.hostConnection = null;
            if (!this.peer || this.peer.destroyed) {
                this.tryJoin();
            }
            else {
                this.connectToHost();
            }
        }, RECONNECT_DELAY_MS);
    }
    setStatus(status) {
        this.handlers.onStatus?.(status);
    }
}
