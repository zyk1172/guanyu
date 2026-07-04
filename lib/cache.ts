import { Redis } from '@upstash/redis';

// Upstash Redis（REST）缓存层。未配置 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// 或 Redis 故障时，所有方法安静降级（返回 null / false），调用方直接回退数据库，
// 不影响任何功能路径。
const globalForRedis = globalThis as unknown as { __guanyuRedis?: Redis | null };

function getRedis(): Redis | null {
  if (globalForRedis.__guanyuRedis !== undefined) return globalForRedis.__guanyuRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  globalForRedis.__guanyuRedis = url && token
    ? new Redis({ url, token, retry: { retries: 1, backoff: () => 200 } })
    : null;
  return globalForRedis.__guanyuRedis;
}

export function isCacheEnabled() {
  return Boolean(getRedis());
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get<T>(key);
  } catch (error) {
    console.error('Redis GET failed:', key, error);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.error('Redis SET failed:', key, error);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (error) {
    console.error('Redis DEL failed:', keys.join(','), error);
  }
}

// 按前缀批量失效。当前 keyspace 很小（热榜 + 详情 + 设置），KEYS 足够快。
export async function cacheDelByPrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch (error) {
    console.error('Redis DEL by prefix failed:', prefix, error);
  }
}

// 滑动窗口计数：先清掉窗口外的成员，再返回窗口内事件数。
// 返回 null 表示 Redis 不可用，调用方应回退数据库统计。
export async function slidingWindowCount(key: string, windowMs: number): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const now = Date.now();
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    pipeline.zcard(key);
    const results = await pipeline.exec<[number, number]>();
    return Number(results[1]) || 0;
  } catch (error) {
    console.error('Redis sliding window count failed:', key, error);
    return null;
  }
}

export async function slidingWindowRecord(key: string, windowMs: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const now = Date.now();
    const pipeline = redis.pipeline();
    pipeline.zadd(key, { score: now, member: `${now}:${Math.random().toString(36).slice(2, 10)}` });
    // 窗口期后整键过期，避免残留
    pipeline.expire(key, Math.ceil(windowMs / 1000) + 60);
    await pipeline.exec();
  } catch (error) {
    console.error('Redis sliding window record failed:', key, error);
  }
}

export const CACHE_KEYS = {
  appSetting: 'guanyu:cache:app-setting',
  hotAuditsPrefix: 'guanyu:cache:hot:',
  hotAudits: (limit: number) => `guanyu:cache:hot:${limit}`,
  audit: (id: string) => `guanyu:cache:audit:${id}`,
  analyzeRateLimit: (userId: string) => `guanyu:rl:analyze:${userId}`,
} as const;

export const CACHE_TTL = {
  appSetting: 300,
  hotAudits: 60,
  audit: 300,
} as const;
