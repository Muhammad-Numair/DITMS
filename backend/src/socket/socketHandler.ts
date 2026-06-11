// backend/src/socket/socketHandler.ts
import { Server, Socket } from 'socket.io';
import { SimulationEngine } from '../services/simulationEngine';
import { DistributedCoordinator } from '../services/aiEngine';
import { logger } from '../utils/logger';

export function setupSocketHandlers(
  io: Server,
  engine: SimulationEngine,
  coordinator: DistributedCoordinator
): void {

  // ── Forward engine events to ALL clients ──────────────────
  engine.on('tick',        (snap) => io.emit('sim:tick', snap));
  engine.on('analytics',   (a)    => io.emit('sim:analytics', a));
  engine.on('stateChange', (s)    => io.emit('sim:stateChange', { state: s }));

  engine.on('emergency', (d) => {
    io.emit('emergency:dispatched', d);
    emitLog(io, 'EMERGENCY', 'engine',
      `🚨 Emergency ${d.vehicleType} ${d.vehicleId} dispatched — route: ${d.route?.join(' → ')}`);
  });

  engine.on('accident:created', (acc) => {
    io.emit('accident:created', acc);
    emitLog(io, 'WARNING', 'engine',
      `💥 Accident ${acc.accidentId} at ${acc.intersectionId} — severity: ${acc.severity}`);
  });

  engine.on('accident:resolved', (id) => {
    io.emit('accident:resolved', id);
    emitLog(io, 'SUCCESS', 'engine', `✅ Accident ${id} resolved — roads cleared`);
  });

  // Push node statuses every 2 seconds
  setInterval(() => {
    io.emit('node:statuses', coordinator.getNodeStatuses());
  }, 2000);

  // ── Per-client connection ─────────────────────────────────
  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Send current state immediately on connect
    socket.emit('sim:tick',     engine.getSnapshot());
    socket.emit('sim:analytics', engine.getAnalytics());
    socket.emit('node:statuses', coordinator.getNodeStatuses());
    emitLog(io, 'INFO', 'system', `🔌 Client connected (${socket.id.slice(0, 8)})`);

    // ── Simulation controls ──────────────────────────────────
    socket.on('sim:start',  () => { engine.start();  emitLog(io, 'INFO', 'sim', '▶ Simulation started'); });
    socket.on('sim:pause',  () => { engine.pause();  emitLog(io, 'INFO', 'sim', '⏸ Simulation paused'); });
    socket.on('sim:stop',   () => { engine.stop();   emitLog(io, 'INFO', 'sim', '⏹ Simulation stopped'); });

    socket.on('sim:setRushHour',   (v: boolean) => {
      engine.rushHour = v;
      emitLog(io, 'INFO', 'sim', `🚦 Rush hour ${v ? 'ENABLED' : 'DISABLED'}`);
    });
    socket.on('sim:setRainMode',   (v: boolean) => {
      engine.rainMode = v;
      emitLog(io, 'INFO', 'sim', `🌧 Rain mode ${v ? 'ENABLED' : 'DISABLED'}`);
    });
    socket.on('sim:setSpeedFactor', (v: number) => {
      engine.speedFactor = Math.max(0.1, Math.min(10, v));
      emitLog(io, 'INFO', 'sim', `⚡ Speed factor → ${engine.speedFactor.toFixed(1)}×`);
    });
    socket.on('sim:setSpawnRate', (v: number) => {
      engine.spawnRate = Math.max(0, Math.min(20, Math.round(v)));
      emitLog(io, 'INFO', 'sim', `🚗 Spawn rate → ${engine.spawnRate} vehicles/tick`);
    });

    // ── Vehicle spawn (synchronous — instant) ───────────────
    socket.on('vehicle:spawn', (d: { vehicleType?: string; origin?: string; destination?: string }) => {
      const v = engine.spawnVehicle(d.vehicleType as any, d.origin, d.destination);
      if (v) {
        emitLog(io, 'INFO', 'engine', `🚗 Spawned ${d.vehicleType || 'car'} ${v.vehicleId} (${v.origin}→${v.destination})`);
        socket.emit('vehicle:spawn:ack', { success: true, vehicleId: v.vehicleId });
      } else {
        emitLog(io, 'WARNING', 'engine', `⚠ Spawn failed — no route available`);
        socket.emit('vehicle:spawn:ack', { success: false });
      }
    });

    // ── Emergency dispatch ──────────────────────────────────
    socket.on('emergency:dispatch', (d: { vehicleType: string; origin: string; destination: string }) => {
      const vid = engine.spawnEmergencyVehicle(d.vehicleType as any, d.origin, d.destination);
      if (vid) {
        socket.emit('emergency:ack', { vehicleId: vid, success: true });
        emitLog(io, 'EMERGENCY', 'engine',
          `🚨 Emergency ${d.vehicleType} dispatched: ${d.origin} → ${d.destination}`);
      } else {
        socket.emit('emergency:ack', { success: false, error: 'No route found' });
        emitLog(io, 'ERROR', 'engine', `❌ Emergency dispatch failed — no route`);
      }
    });

    // ── Signal controls ──────────────────────────────────────
    socket.on('signal:override', (d: { intersectionId: string; state: string | null }) => {
      engine.setManualOverride(d.intersectionId, d.state as any);
      if (d.state) {
        emitLog(io, 'INFO', 'signal', `🚦 ${d.intersectionId} forced → ${d.state}`);
      } else {
        emitLog(io, 'INFO', 'signal', `🤖 ${d.intersectionId} restored to AI mode`);
      }
    });
    socket.on('signal:setTiming', (d: { intersectionId: string; green: number; red: number }) => {
      engine.setSignalTiming(d.intersectionId, d.green, d.red);
      emitLog(io, 'INFO', 'signal', `⏱ Timing ${d.intersectionId}: G=${d.green}s R=${d.red}s`);
    });
    socket.on('signal:setAI', (v: boolean) => {
      engine.aiEnabled = v;
      emitLog(io, 'INFO', 'ai', `🤖 AI decision engine ${v ? 'ENABLED' : 'DISABLED'}`);
    });

    // ── Accident controls ────────────────────────────────────
    socket.on('accident:create', (d: {
      intersectionId: string; severity: string;
      blockedLanes: number; durationMinutes: number;
    }) => {
      engine.createAccident(d.intersectionId, d.severity, d.blockedLanes, d.durationMinutes);
    });
    socket.on('accident:resolve', (id: string) => {
      engine.resolveAccident(id);
    });

    // ── Distributed node controls ────────────────────────────
    socket.on('node:crash', (nodeId: string) => {
      coordinator.crashNode(nodeId);
      io.emit('node:status', { nodeId, status: 'offline' });
      emitLog(io, 'ERROR', 'distributed', `💀 Node ${nodeId} CRASHED (simulated failure)`);
    });
    socket.on('node:recover', (nodeId: string) => {
      coordinator.recoverNode(nodeId);
      io.emit('node:status', { nodeId, status: 'online' });
      emitLog(io, 'SUCCESS', 'distributed', `🔄 Node ${nodeId} RECOVERED — back online`);
    });
    socket.on('node:setDelay', (d: { nodeId: string; delayMs: number }) => {
      coordinator.setCommDelay(d.nodeId, d.delayMs);
      if (d.delayMs > 0) {
        emitLog(io, 'INFO', 'distributed', `⏱ Node ${d.nodeId} comm delay → ${d.delayMs}ms`);
      } else {
        emitLog(io, 'INFO', 'distributed', `⏱ Node ${d.nodeId} comm delay cleared`);
      }
    });

    // ── 2PC demo ─────────────────────────────────────────────
    socket.on('2pc:run', async (d: { type: string; participantIds: string[] }) => {
      emitLog(io, '2PC', 'coordinator',
        `🔀 2PC ${d.type} — participants: [${d.participantIds.join(', ')}]`);
      const result = await coordinator.runTransaction(
        d.type, d.participantIds, { type: d.type, demo: true }
      );
      io.emit('txn:update', {
        txnId: result.txnId,
        phase: result.committed ? 'COMMITTED' : 'ABORTED',
        txnType: d.type,
        participantIds: d.participantIds,
      });
      if (result.committed) {
        emitLog(io, '2PC', 'coordinator', `✅ 2PC ${d.type} COMMITTED (txn: ${result.txnId.slice(0, 8)})`);
      } else {
        emitLog(io, 'ERROR', 'coordinator', `❌ 2PC ${d.type} ABORTED — ${result.reason}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
}

function emitLog(io: Server, level: string, source: string, message: string) {
  io.emit('log:entry', {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    level,
    source,
    message,
    timestamp: new Date().toISOString(),
  });
}
