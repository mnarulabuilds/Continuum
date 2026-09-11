import * as IORedis from "ioredis";
import { config } from "./config.js";

/** A narrow, typed adapter that isolates the CommonJS Redis client at the ESM boundary. */
export interface RedisClient {
    on(event: "ready" | "close", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    connect(): Promise<void>;
    get(key: string): Promise<string | null>;
    getdel(key: string): Promise<string | null>;
    set(key: string, value: string | Buffer, mode: "EX", seconds: number): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    incr(key: string): Promise<number>;
    pexpire(key: string, milliseconds: number): Promise<unknown>;
    mgetBuffer(...keys: string[]): Promise<Array<Buffer | null>>;
    hgetall(key: string): Promise<Record<string, string>>;
    hset(key: string, field: string, value: string): Promise<unknown>;
    hdel(key: string, field: string): Promise<number>;
    publish(channel: string, message: string): Promise<number>;
    scan(cursor: string, command: "MATCH", pattern: string, countCommand: "COUNT", count: number): Promise<[string, string[]]>;
    multi(): RedisTransaction;
}
export interface RedisTransaction {
    set(key: string, value: string | Buffer, mode: "EX", seconds: number): RedisTransaction;
    exec(): Promise<unknown>;
}
type RedisConstructor = new (options: Record<string, unknown>) => RedisClient;
const Redis = IORedis.default as unknown as RedisConstructor;

export function createRedisClient(): RedisClient {
    return new Redis({
        host: config.redis.host, port: config.redis.port, password: config.redis.password, db: config.redis.db,
        tls: config.redis.tls, lazyConnect: true, maxRetriesPerRequest: 3, enableOfflineQueue: false,
        retryStrategy: (attempt: number) => attempt > 3 ? null : Math.min(attempt * 100, 2_000),
    });
}
