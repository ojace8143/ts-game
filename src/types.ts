// A single player's replicated state.
export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
}

// Wire protocol between a client and the room host.
//
// Clients send `hello` once when they connect and `state` as they move.
// The host answers with `welcome`, then relays `join` / `state` / `leave`
// events to everybody else in the room.
export type NetMessage =
  | { t: "hello"; name: string; color: string; x: number; y: number }
  | { t: "welcome"; selfId: string; players: PlayerState[] }
  | { t: "join"; player: PlayerState }
  | { t: "state"; player: PlayerState }
  | { t: "leave"; id: string };
