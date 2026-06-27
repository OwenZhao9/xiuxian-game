import { Redis } from "@upstash/redis";
import { createPlayer } from "../shared/game.js";
import type { PlayerState } from "../shared/types.js";

export class KvPlayerStore {
  private readonly redis: Redis;

  constructor() {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error("缺少 Upstash KV 环境变量：KV_REST_API_URL/KV_REST_API_TOKEN。");
    }

    this.redis = new Redis({ url, token });
  }

  async getOrCreateBySession(sessionId: string, now: number): Promise<PlayerState> {
    const key = this.key(sessionId);
    const value = await this.redis.get<string | PlayerState>(key);

    if (typeof value === "string") {
      return JSON.parse(value) as PlayerState;
    }

    if (value && typeof value === "object") {
      return value as PlayerState;
    }

    const player = createPlayer(crypto.randomUUID(), now);
    await this.save(sessionId, player);
    return player;
  }

  async save(sessionId: string, player: PlayerState): Promise<void> {
    await this.redis.set(this.key(sessionId), JSON.stringify(player));
  }

  async deleteBySession(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  private key(sessionId: string): string {
    return `xiuxian:player:${sessionId}`;
  }
}
