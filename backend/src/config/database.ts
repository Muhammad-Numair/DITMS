// backend/src/config/database.ts
import { Pool } from 'pg';
import mongoose from 'mongoose';
import neo4j, { Driver } from 'neo4j-driver';
import { createClient } from 'redis';
import { logger } from '../utils/logger';

export const pgPool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'ditms',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  min: 2, max: 10,
});

export async function connectPostgres() {
  const c = await pgPool.connect();
  await c.query('SELECT 1');
  c.release();
  logger.info('PostgreSQL connected');
}

export async function connectMongo() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ditms');
  logger.info('MongoDB connected');
}

let _neo4jDriver: Driver | null = null;
export function getNeo4jDriver(): Driver {
  if (!_neo4jDriver) {
    _neo4jDriver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password')
    );
  }
  return _neo4jDriver;
}
export async function connectNeo4j() {
  await getNeo4jDriver().verifyConnectivity();
  logger.info('Neo4j connected');
}
export async function runCypher(cypher: string, params: Record<string, unknown> = {}) {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map(r => r.toObject());
  } finally { await session.close(); }
}

type RedisClient = ReturnType<typeof createClient>;
let _redis: RedisClient | null = null;
let _redisOk = false;
export async function connectRedis() {
  if (process.env.REDIS_ENABLED === 'false') { logger.info('Redis disabled'); return; }
  try {
    _redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    _redis.on('error', () => { _redisOk = false; });
    await _redis.connect();
    _redisOk = true;
    logger.info('Redis connected');
  } catch { logger.warn('Redis unavailable'); }
}
export async function rSet(key: string, val: unknown, ex = 60) {
  if (!_redisOk || !_redis) return;
  try { await (_redis as ReturnType<typeof createClient>).set(key, JSON.stringify(val), { EX: ex }); } catch {}
}
export async function rGet<T>(key: string): Promise<T | null> {
  if (!_redisOk || !_redis) return null;
  try { const v = await (_redis as ReturnType<typeof createClient>).get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}

export async function closeAll() {
  await pgPool.end();
  await mongoose.connection.close();
  await getNeo4jDriver().close();
  if (_redis) await (_redis as ReturnType<typeof createClient>).quit();
}
