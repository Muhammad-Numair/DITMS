import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { connectPostgres, connectMongo, connectNeo4j, connectRedis, closeAll } from './config/database';
import { logger } from './utils/logger';
import routes from './routes/index';
import { setupSocketHandlers } from './socket/socketHandler';
import { SimulationEngine } from './services/simulationEngine';
import { AIDecisionEngine, DistributedCoordinator } from './services/aiEngine';

const PORT       = parseInt(process.env.PORT || '5000');
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

async function bootstrap() {
  logger.info('Connecting databases...');
  await connectPostgres();
  await connectMongo();
  await connectNeo4j();
  await connectRedis();

  const ai          = new AIDecisionEngine();
  const coordinator = new DistributedCoordinator();
  // Engine no longer needs Neo4j service — uses built-in synchronous Dijkstra
  const engine      = new SimulationEngine(ai, coordinator);

  const app    = express();
  const server = http.createServer(app);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: CLIENT_URL, credentials: true }));
  app.use(express.json());
  app.use(morgan('dev'));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', routes);
  app.get('/health', (_req, res) => res.json({ status: 'ok', tick: engine.getAnalytics().tick, vehicles: engine.getAnalytics().totalVehicles }));

  const io = new Server(server, {
    cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });
  setupSocketHandlers(io, engine, coordinator);

  engine.start();
  logger.info('Simulation engine started (synchronous Dijkstra routing)');

  server.listen(PORT, () => {
    logger.info(`DITMS backend  →  http://localhost:${PORT}`);
    logger.info(`Socket.io  ←→  ${CLIENT_URL}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    engine.stop();
    await closeAll();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => { logger.error(`Fatal: ${err}`); process.exit(1); });
