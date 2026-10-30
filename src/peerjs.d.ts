// Minimal typings for the PeerJS browser build loaded from a CDN in index.html.
// Only the pieces this project actually uses are declared.

interface PeerJSError {
  type: string;
  message?: string;
}

interface PeerJSDataConnection {
  peer: string;
  open: boolean;
  on(event: "open", callback: () => void): void;
  on(event: "data", callback: (data: unknown) => void): void;
  on(event: "close", callback: () => void): void;
  on(event: "error", callback: (error: PeerJSError) => void): void;
  send(data: unknown): void;
  close(): void;
}

interface PeerJSOptions {
  debug?: number;
  config?: RTCConfiguration;
}

interface PeerJSInstance {
  id: string;
  destroyed: boolean;
  on(event: "open", callback: (id: string) => void): void;
  on(event: "connection", callback: (connection: PeerJSDataConnection) => void): void;
  on(event: "disconnected", callback: () => void): void;
  on(event: "close", callback: () => void): void;
  on(event: "error", callback: (error: PeerJSError) => void): void;
  connect(id: string, options?: { reliable?: boolean }): PeerJSDataConnection;
  reconnect(): void;
  destroy(): void;
}

interface PeerJSConstructor {
  new (id?: string, options?: PeerJSOptions): PeerJSInstance;
}

declare const Peer: PeerJSConstructor;
