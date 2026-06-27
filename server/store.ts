import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPlayer } from "../shared/game.js";
import type { PlayerState } from "../shared/types.js";

interface PlayerRow {
  id: string;
  session_id: string;
  state: string;
}

export class PlayerStore {
  private readonly db: DatabaseSync;

  constructor(filename = resolve(process.cwd(), "data/game.sqlite")) {
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_players_updated_at ON players(updated_at);
    `);
  }

  getOrCreateBySession(sessionId: string, now: number): PlayerState {
    const row = this.db
      .prepare("SELECT id, session_id, state FROM players WHERE session_id = ?")
      .get(sessionId) as PlayerRow | undefined;

    if (row) {
      return JSON.parse(row.state) as PlayerState;
    }

    const player = createPlayer(randomUUID(), now);
    this.save(sessionId, player, now);
    return player;
  }

  save(sessionId: string, player: PlayerState, now: number): void {
    this.db
      .prepare(
        `
        INSERT INTO players (id, session_id, state, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id)
        DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
      `,
      )
      .run(player.id, sessionId, JSON.stringify(player), now);
  }

  deleteBySession(sessionId: string): void {
    this.db.prepare("DELETE FROM players WHERE session_id = ?").run(sessionId);
  }
}
