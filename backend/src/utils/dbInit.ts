// backend/src/utils/dbInit.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { pgPool, connectPostgres, connectMongo, connectNeo4j } from '../config/database';
import { SystemEvent } from '../models';
import { DEFAULT_USERS, INTERSECTIONS, DISTRICTS } from '../config/cityConfig';

async function bfsPath(start: string, end: string): Promise<string[] | null> {
  const { ROADS } = await import('../config/cityConfig');
  const adj: Record<string, string[]> = {};
  for (const r of ROADS) {
    (adj[r.fromId] = adj[r.fromId] || []).push(r.toId);
    if (r.bidirectional) (adj[r.toId] = adj[r.toId] || []).push(r.fromId);
  }
  const visited = new Set([start]);
  const queue: Array<{ id: string; path: string[] }> = [{ id: start, path: [start] }];
  while (queue.length) {
    const { id, path } = queue.shift()!;
    if (id === end) return path;
    for (const n of adj[id] || []) {
      if (!visited.has(n)) { visited.add(n); queue.push({ id: n, path: [...path, n] }); }
    }
  }
  return null;
}

async function main() {
  console.log('='.repeat(55));
  console.log('  DITMS Web — Database Bootstrap');
  console.log('='.repeat(55));

  // PostgreSQL
  console.log('\n[1/3] PostgreSQL...');
  await connectPostgres();
  const sql = fs.readFileSync(path.join(__dirname, '../../schemas/pg_schema.sql'), 'utf8');
  const client = await pgPool.connect();
  await client.query(sql);
  client.release();
  console.log('  ✅ Schema created');

  for (const [nid, dname] of Object.entries(DISTRICTS)) {
    await pgPool.query(
      `INSERT INTO public.nodes(node_id,district_name,schema_name,status) VALUES($1,$2,$3,'online') ON CONFLICT(node_id) DO NOTHING`,
      [nid, dname, nid]
    );
  }
  console.log(`  ✅ ${Object.keys(DISTRICTS).length} nodes registered`);

  for (const idef of INTERSECTIONS) {
    await pgPool.query(
      `INSERT INTO ${idef.district}.intersections(intersection_id,name,x_coord,y_coord,district) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [idef.id, idef.name, idef.x, idef.y, idef.district]
    );
    for (const dir of ['NS','EW']) {
      await pgPool.query(
        `INSERT INTO ${idef.district}.traffic_signals(intersection_id,direction) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [idef.id, dir]
      );
    }
  }
  console.log(`  ✅ ${INTERSECTIONS.length} intersections seeded`);

  for (const u of DEFAULT_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await pgPool.query(
      `INSERT INTO public.users(username,password_hash,role) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING`,
      [u.username, hash, u.role]
    );
  }
  console.log('  ✅ Admin user created (admin/admin123)');

  // MongoDB
  console.log('\n[2/3] MongoDB...');
  await connectMongo();
  await SystemEvent.create({ category:'STARTUP', message:'Bootstrap complete' });
  console.log('  ✅ Collections ready');

  // Neo4j
  console.log('\n[3/3] Neo4j...');
  await connectNeo4j();
  const { runCypher } = await import('../config/database');
  const { ROADS } = await import('../config/cityConfig');

  try { await runCypher('CREATE CONSTRAINT intersection_id IF NOT EXISTS FOR (i:Intersection) REQUIRE i.id IS UNIQUE'); } catch {}

  for (const idef of INTERSECTIONS) {
    await runCypher(
      `MERGE (n:Intersection {id:$id}) SET n.name=$name,n.x=$x,n.y=$y,n.district=$district,n.congestion=0.0,n.signal_state='RED'`,
      { id:idef.id, name:idef.name, x:idef.x, y:idef.y, district:idef.district }
    );
  }
  for (const r of ROADS) {
    const w = r.distance / r.speedLimit;
    await runCypher(
      `MATCH(a:Intersection{id:$f}) MATCH(b:Intersection{id:$t}) MERGE(a)-[rd:ROAD{id:$rid}]->(b) SET rd.distance=$d,rd.speed_limit=$sl,rd.lanes=$ln,rd.weight=$w,rd.blocked=false,rd.congestion=0.0`,
      { f:r.fromId, t:r.toId, rid:`${r.fromId}-${r.toId}`, d:r.distance, sl:r.speedLimit, ln:r.lanes, w }
    );
    if (r.bidirectional) {
      await runCypher(
        `MATCH(a:Intersection{id:$f}) MATCH(b:Intersection{id:$t}) MERGE(b)-[rd:ROAD{id:$rid}]->(a) SET rd.distance=$d,rd.speed_limit=$sl,rd.lanes=$ln,rd.weight=$w,rd.blocked=false,rd.congestion=0.0`,
        { f:r.fromId, t:r.toId, rid:`${r.toId}-${r.fromId}`, d:r.distance, sl:r.speedLimit, ln:r.lanes, w }
      );
    }
  }

  const test = await bfsPath('I01','I16');
  console.log(`  ✅ Graph seeded — routing test I01→I16: ${test?.join('→') || 'no path'}`);

  await mongoose.connection.close();
  await pgPool.end();

  console.log('\n' + '='.repeat(55));
  console.log('  Done! Run:  npm run dev');
  console.log('  Login:  admin / admin123 (full access)');
  console.log('='.repeat(55));
  process.exit(0);
}

main().catch(e => { console.error('Bootstrap failed:', e); process.exit(1); });
