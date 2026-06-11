// backend/src/services/simulationEngine.ts
// FIXED: synchronous BFS routing for instant spawning, proper tick loop,
// vehicle despawning, real-time emission every tick
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { INTERSECTIONS, ROADS, SIM_CONFIG, VEHICLE_SPEEDS, VEHICLE_COLOURS } from '../config/cityConfig';
import { Accident, AIDecision, EmergencyEvent, SystemEvent } from '../models';
import { AIDecisionEngine, DistributedCoordinator } from './aiEngine';
import { logger } from '../utils/logger';

type SignalState = 'RED' | 'YELLOW' | 'GREEN';
type VehicleType = 'car' | 'bus' | 'truck' | 'bike' | 'ambulance' | 'police' | 'fire_truck';
type VehicleStateType = 'moving' | 'waiting' | 'arrived';
type SimStateType = 'running' | 'paused' | 'stopped';

interface Vehicle {
    vehicleId: string; vehicleType: VehicleType;
    x: number; y: number;
    origin: string; destination: string;
    route: string[]; routeIndex: number;
    speed: number; state: VehicleStateType;
    isEmergency: boolean; waitTime: number; colour: string;
}

interface InterState {
    id: string; name: string; x: number; y: number; nodeId: string;
    signalState: SignalState; phaseTimer: number;
    greenDuration: number; redDuration: number; yellowDuration: number;
    manualOverride: boolean; forcedState: SignalState | null;
    queue: Set<string>; aiActive: boolean;
}

// ── Pre-build adjacency list at module load (synchronous, no DB) ──
const ADJ = new Map<string, Array<{ to: string; w: number }>>();
for (const i of INTERSECTIONS) ADJ.set(i.id, []);
for (const r of ROADS) {
    const w = r.distance / r.speedLimit;
    ADJ.get(r.fromId)!.push({ to: r.toId, w });
    if (r.bidirectional) ADJ.get(r.toId)!.push({ to: r.fromId, w });
}

// Synchronous Dijkstra — runs in <1ms for 20 nodes
function dijkstra(start: string, end: string, blocked: Set<string>): string[] | null {
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    for (const [id] of ADJ) { dist.set(id, Infinity); prev.set(id, null); }
    dist.set(start, 0);
    const heap: [number, string][] = [[0, start]];
    while (heap.length) {
        heap.sort((a, b) => a[0] - b[0]);
        const [d, u] = heap.shift()!;
        if (u === end) break;
        if (d > dist.get(u)!) continue;
        for (const { to, w } of ADJ.get(u) || []) {
            if (blocked.has(`${u}-${to}`)) continue;
            const nd = d + w;
            if (nd < dist.get(to)!) {
                dist.set(to, nd);
                prev.set(to, u);
                heap.push([nd, to]);
            }
        }
    }
    if (dist.get(end) === Infinity) return null;
    const path: string[] = [];
    let cur: string | null = end;
    while (cur) { path.unshift(cur); cur = prev.get(cur) || null; }
    return path;
}

const IID_LIST = INTERSECTIONS.map(i => i.id);
const rand = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const TYPE_POOL: VehicleType[] = [
    'car', 'car', 'car', 'car', 'car', 'car',
    'bus', 'bus', 'truck', 'bike'
];

export class SimulationEngine extends EventEmitter {
    private state: SimStateType = 'stopped';
    private tick = 0;
    private simTime = 0;
    private timer: ReturnType<typeof setInterval> | null = null;

    // City state
    private intersections = new Map<string, InterState>();
    private vehicles = new Map<string, Vehicle>();
    private accidents = new Map<string, Record<string, unknown>>();
    private blockedRoads = new Set<string>();
    private iidToNode = new Map<string, string>();

    // Counters for analytics
    private totalSpawned = 0;
    private totalDespawned = 0;

    // Public controls
    spawnRate = SIM_CONFIG.DEFAULT_SPAWN_RATE;
    speedFactor = 1.0;
    aiEnabled = true;
    rushHour = false;
    rainMode = false;

    private ai: AIDecisionEngine;
    private coordinator: DistributedCoordinator;

    constructor(ai: AIDecisionEngine, coordinator: DistributedCoordinator) {
        super();
        this.ai = ai;
        this.coordinator = coordinator;
        this._initIntersections();
    }

    private _initIntersections() {
        for (const i of INTERSECTIONS) {
            this.iidToNode.set(i.id, i.district);
            this.intersections.set(i.id, {
                id: i.id, name: i.name, x: i.x, y: i.y, nodeId: i.district,
                signalState: 'RED',
                phaseTimer: Math.random() * 30,  // stagger signals so they don't all change together
                greenDuration: SIM_CONFIG.DEFAULT_GREEN_TIME,
                redDuration: SIM_CONFIG.DEFAULT_RED_TIME,
                yellowDuration: SIM_CONFIG.DEFAULT_YELLOW_TIME,
                manualOverride: false, forcedState: null,
                queue: new Set(), aiActive: true,
            });
        }
    }

    // ─────────────────────────────────────────────────────────
    //  Lifecycle
    // ─────────────────────────────────────────────────────────
    start() {
        if (this.state === 'running') return;
        this.state = 'running';
        // Emit every 500ms (2 Hz)
        this.timer = setInterval(() => this._tick(), SIM_CONFIG.TICK_INTERVAL_MS);
        this.emit('stateChange', 'running');
        logger.info('Simulation engine started');
        SystemEvent.create({ category: 'STARTUP', message: 'Simulation started' }).catch(() => { });
    }

    pause() {
        if (this.state !== 'running') return;
        this.state = 'paused';
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.emit('stateChange', 'paused');
    }

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'running';
        this.timer = setInterval(() => this._tick(), SIM_CONFIG.TICK_INTERVAL_MS);
        this.emit('stateChange', 'running');
    }

    stop() {
        this.state = 'stopped';
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.emit('stateChange', 'stopped');
    }

    get isRunning() { return this.state === 'running'; }

    // ─────────────────────────────────────────────────────────
    //  Main tick — everything synchronous so it completes fast
    // ─────────────────────────────────────────────────────────
    private _tick() {
        this.tick++;
        this.simTime += SIM_CONFIG.TICK_INTERVAL_MS / 1000;

        this._tickSignals();
        this._spawnVehicles();     // synchronous now
        this._moveVehicles();      // moves + despawns arrived vehicles
        this._updateQueues();

        // AI runs every 5 ticks (~2.5 sec)
        if (this.aiEnabled && this.tick % (SIM_CONFIG.AI_DECISION_INTERVAL * SIM_CONFIG.TICK_RATE_HZ) === 0) {
            this._runAI();
        }

        // Emit snapshot every tick — frontend gets it at 2Hz
        this.emit('tick', this.getSnapshot());

        // Emit analytics every 4 ticks
        if (this.tick % 4 === 0) {
            this.emit('analytics', this.getAnalytics());
        }
    }

    // ─────────────────────────────────────────────────────────
    //  Signal state machine
    // ─────────────────────────────────────────────────────────
    private _tickSignals() {
        const dt = SIM_CONFIG.TICK_INTERVAL_MS / 1000;
        for (const [, i] of this.intersections) {
            if (i.forcedState !== null) continue;
            i.phaseTimer += dt;
            if (i.signalState === 'GREEN' && i.phaseTimer >= i.greenDuration) { i.signalState = 'YELLOW'; i.phaseTimer = 0; }
            else if (i.signalState === 'YELLOW' && i.phaseTimer >= i.yellowDuration) { i.signalState = 'RED'; i.phaseTimer = 0; }
            else if (i.signalState === 'RED' && i.phaseTimer >= i.redDuration) { i.signalState = 'GREEN'; i.phaseTimer = 0; i.queue.clear(); }
        }
    }

    // ─────────────────────────────────────────────────────────
    //  Vehicle spawning — FULLY SYNCHRONOUS via Dijkstra
    // ─────────────────────────────────────────────────────────
    private _spawnVehicles() {
        if (this.vehicles.size >= SIM_CONFIG.MAX_VEHICLES) return;
        let rate = this.spawnRate;
        if (this.rushHour) rate = Math.min(rate * 3, 15);
        if (this.rainMode) rate = Math.max(1, Math.floor(rate * 0.6));

        for (let i = 0; i < rate; i++) {
            if (this.vehicles.size >= SIM_CONFIG.MAX_VEHICLES) break;
            this._spawnOneSync();
        }
    }

    private _spawnOneSync(
        vehicleType?: VehicleType,
        origin?: string,
        destination?: string
    ): Vehicle | null {
        const iids = IID_LIST;
        const o = origin || rand(iids);
        const d = destination || rand(iids.filter(id => id !== o));
        if (!o || !d || o === d) return null;

        // Synchronous Dijkstra — no DB, no await, instant
        const route = dijkstra(o, d, this.blockedRoads);
        if (!route || route.length < 2) return null;

        const vt = vehicleType || TYPE_POOL[Math.floor(Math.random() * TYPE_POOL.length)];
        const orig = this.intersections.get(o)!;

        const v: Vehicle = {
            vehicleId: `V${uuid().substring(0, 8).toUpperCase()}`,
            vehicleType: vt,
            x: orig.x, y: orig.y,
            origin: o, destination: d,
            route, routeIndex: 0,
            speed: (VEHICLE_SPEEDS[vt] || 14) * this.speedFactor,
            state: 'moving',
            isEmergency: false,
            waitTime: 0,
            colour: VEHICLE_COLOURS[vt] || '#4FC3F7',
        };

        this.vehicles.set(v.vehicleId, v);
        this.totalSpawned++;
        return v;
    }

    // ─────────────────────────────────────────────────────────
    //  Vehicle movement + despawning
    // ─────────────────────────────────────────────────────────
    private _moveVehicles() {
        const dt = SIM_CONFIG.TICK_INTERVAL_MS / 1000;  // seconds per tick
        const toRemove: string[] = [];

        for (const [vid, v] of this.vehicles) {
            // Despawn arrived vehicles
            if (v.state === 'arrived') {
                toRemove.push(vid);
                continue;
            }

            if (v.state === 'waiting') {
                v.waitTime += dt;

                // Check if signal turned green — release from queue
                if (v.routeIndex < v.route.length - 1) {
                    const nextId = v.route[v.routeIndex + 1];
                    const next = this.intersections.get(nextId);
                    if (next) {
                        const sig = next.forcedState ?? next.signalState;
                        if (sig === 'GREEN' || v.isEmergency) {
                            v.state = 'moving';
                            next.queue.delete(vid);
                        }
                    }
                }
                continue;
            }

            // Check if route complete
            if (v.routeIndex >= v.route.length - 1) {
                v.state = 'arrived';
                toRemove.push(vid);
                continue;
            }

            const curId = v.route[v.routeIndex];
            const nextId = v.route[v.routeIndex + 1];

            // Road blocked? Reroute
            if (this.blockedRoads.has(`${curId}-${nextId}`)) {
                const newRoute = dijkstra(curId, v.destination, this.blockedRoads);
                if (newRoute && newRoute.length > 1) {
                    v.route = newRoute;
                    v.routeIndex = 0;
                } else {
                    // No route — despawn
                    toRemove.push(vid);
                }
                continue;
            }

            const next = this.intersections.get(nextId);
            if (!next) { toRemove.push(vid); continue; }

            // Check signal at next intersection
            const sig = next.forcedState ?? next.signalState;
            if (!v.isEmergency && (sig === 'RED' || sig === 'YELLOW')) {
                v.state = 'waiting';
                v.waitTime += dt;
                next.queue.add(vid);
                continue;
            }

            // Move toward next intersection
            const dx = next.x - v.x;
            const dy = next.y - v.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const spd = v.speed * (this.rainMode ? 0.7 : 1.0) * dt;
            const ratio = Math.min(1, spd / dist);

            v.x += dx * ratio;
            v.y += dy * ratio;
            v.state = 'moving';

            // Release from previous queue
            const cur = this.intersections.get(curId);
            if (cur) cur.queue.delete(vid);

            // Reached next intersection
            if (ratio >= 1) {
                v.x = next.x;
                v.y = next.y;
                v.routeIndex++;
                if (v.routeIndex >= v.route.length - 1) {
                    v.state = 'arrived';
                    toRemove.push(vid);
                }
            }
        }

        // Despawn arrived vehicles
        for (const vid of toRemove) {
            this.vehicles.delete(vid);
            this.totalDespawned++;
        }
    }

    // ─────────────────────────────────────────────────────────
    //  Queue length → congestion
    // ─────────────────────────────────────────────────────────
    private _updateQueues() {
        // Update queue lengths on intersections (already tracked via Set)
        // Sync to coordinator for node metrics every 4 ticks
        if (this.tick % 4 !== 0) return;
        const nodeCong: Record<string, number[]> = {};
        const nodeVeh: Record<string, number> = {};
        for (const [iid, inter] of this.intersections) {
            const nid = this.iidToNode.get(iid) || 'node_a';
            (nodeCong[nid] = nodeCong[nid] || []).push(this._cong(inter.queue.size));
        }
        for (const v of this.vehicles.values()) {
            const cur = v.route[v.routeIndex] || v.origin;
            const nid = this.iidToNode.get(cur) || 'node_a';
            nodeVeh[nid] = (nodeVeh[nid] || 0) + 1;
        }
        for (const nid of Object.keys(nodeCong)) {
            const congs = nodeCong[nid] || [];
            const avg = congs.reduce((a, b) => a + b, 0) / Math.max(1, congs.length);
            this.coordinator.updateNodeMetrics(nid, avg, nodeVeh[nid] || 0);
        }
    }

    private _cong(q: number): number {
        if (q <= SIM_CONFIG.LOW_CONGESTION) return (q / SIM_CONFIG.LOW_CONGESTION) * 0.33;
        if (q <= SIM_CONFIG.MEDIUM_CONGESTION) return 0.33 + ((q - SIM_CONFIG.LOW_CONGESTION) / (SIM_CONFIG.MEDIUM_CONGESTION - SIM_CONFIG.LOW_CONGESTION)) * 0.33;
        return Math.min(1, 0.66 + ((q - SIM_CONFIG.MEDIUM_CONGESTION) / SIM_CONFIG.HIGH_CONGESTION) * 0.34);
    }

    // ─────────────────────────────────────────────────────────
    //  AI decisions
    // ─────────────────────────────────────────────────────────
    private _runAI() {
        for (const [iid, inter] of this.intersections) {
            if (inter.manualOverride) continue;
            const nb: Record<string, number> = {};
            for (const r of ROADS) {
                if (r.fromId === iid) {
                    const ni = this.intersections.get(r.toId);
                    if (ni) nb[r.toId] = this._cong(ni.queue.size);
                }
            }
            const action = this.ai.decide({
                intersectionId: iid, nodeId: inter.nodeId,
                queueLength: inter.queue.size,
                congestionLevel: this._cong(inter.queue.size),
                avgWaitTime: 0, emergencyPresent: false,
                accidentPresent: Array.from(this.accidents.values()).some(a => a['intersectionId'] === iid),
                neighborCongestions: nb, timeOfDay: this.simTime % 86400,
                rushHour: this.rushHour, rainMode: this.rainMode,
                currentGreenTime: inter.greenDuration, currentRedTime: inter.redDuration,
            });
            if (!action) continue;
            const { action: type, params } = action;
            if (type === 'EXTEND_GREEN') inter.greenDuration = Math.min(SIM_CONFIG.MAX_GREEN_TIME, inter.greenDuration + (params['extra_seconds'] || 10));
            else if (type === 'REDUCE_RED') inter.redDuration = Math.max(SIM_CONFIG.MIN_GREEN_TIME, inter.redDuration - (params['reduce_seconds'] || 10));
            else if (type === 'FORCE_GREEN') { inter.forcedState = 'GREEN'; inter.queue.clear(); }
            else if (type === 'FORCE_RED') inter.forcedState = 'RED';
            else if (type === 'RESTORE_AI') inter.forcedState = null;

            AIDecision.create({
                intersectionId: iid, nodeId: inter.nodeId,
                ruleTriggered: action.rule, inputs: { queueLength: inter.queue.size, congestionLevel: this._cong(inter.queue.size), avgWaitTime: 0, emergency: false, accident: false },
                action: type, actionParams: params,
            }).catch(() => { });
        }
    }

    // ─────────────────────────────────────────────────────────
    //  Public control API
    // ─────────────────────────────────────────────────────────
    spawnVehicle(vehicleType?: VehicleType, origin?: string, destination?: string): Vehicle | null {
        return this._spawnOneSync(vehicleType, origin, destination);
    }

    spawnEmergencyVehicle(vehicleType: VehicleType, origin: string, destination: string): string | null {
        // Emergency vehicles ignore signals, use direct route
        const route = dijkstra(origin, destination, new Set()); // ignore blocked roads too
        if (!route || route.length < 2) return null;
        const orig = this.intersections.get(origin)!;
        const v: Vehicle = {
            vehicleId: `EMR-${uuid().substring(0, 6).toUpperCase()}`,
            vehicleType, x: orig.x, y: orig.y,
            origin, destination, route, routeIndex: 0,
            speed: (VEHICLE_SPEEDS[vehicleType] || 22) * 1.5,
            state: 'moving', isEmergency: true, waitTime: 0,
            colour: VEHICLE_COLOURS[vehicleType] || '#EF5350',
        };
        this.vehicles.set(v.vehicleId, v);
        this.totalSpawned++;

        // Force GREEN on entire route
        for (const iid of route) {
            const i = this.intersections.get(iid);
            if (i) { i.forcedState = 'GREEN'; i.queue.clear(); }
        }

        EmergencyEvent.create({ vehicleId: v.vehicleId, vehicleType, origin, destination, route }).catch(() => { });
        this.emit('emergency', { vehicleId: v.vehicleId, vehicleType, route });
        return v.vehicleId;
    }

    createAccident(intersectionId: string, severity: string, blockedLanes: number, durationMinutes: number): string {
        const accidentId = `ACC-${uuid().substring(0, 6).toUpperCase()}`;
        const nodeId = this.iidToNode.get(intersectionId) || 'node_a';
        this.accidents.set(accidentId, { accidentId, intersectionId, severity, blockedLanes, nodeId, status: 'ACTIVE', createdAt: new Date().toISOString() });
        for (const r of ROADS) {
            if (r.fromId === intersectionId || r.toId === intersectionId) {
                this.blockedRoads.add(`${r.fromId}-${r.toId}`);
                if (r.bidirectional) this.blockedRoads.add(`${r.toId}-${r.fromId}`);
            }
        }
        const inter = this.intersections.get(intersectionId);
        if (inter) inter.forcedState = 'RED';
        Accident.create({ accidentId, intersectionId, nodeId, severity, blockedLanes, durationMinutes }).catch(() => { });
        this.emit('accident:created', { accidentId, intersectionId, severity, blockedLanes, status: 'ACTIVE', createdAt: new Date().toISOString() });
        return accidentId;
    }

    resolveAccident(accidentId: string) {
        const acc = this.accidents.get(accidentId);
        if (!acc) return;
        const iid = acc['intersectionId'] as string;
        for (const r of ROADS) {
            if (r.fromId === iid || r.toId === iid) {
                this.blockedRoads.delete(`${r.fromId}-${r.toId}`);
                if (r.bidirectional) this.blockedRoads.delete(`${r.toId}-${r.fromId}`);
            }
        }
        const inter = this.intersections.get(iid);
        if (inter) inter.forcedState = null;
        this.accidents.delete(accidentId);
        Accident.updateOne({ accidentId }, { status: 'RESOLVED', resolvedAt: new Date() }).catch(() => { });
        this.emit('accident:resolved', accidentId);
    }

    setManualOverride(intersectionId: string, state: SignalState | null) {
        const i = this.intersections.get(intersectionId);
        if (!i) return;
        i.manualOverride = state !== null;
        i.forcedState = state;
        if (state === 'GREEN') i.queue.clear();
    }

    setSignalTiming(intersectionId: string, green: number, red: number) {
        const i = this.intersections.get(intersectionId);
        if (!i) return;
        i.greenDuration = Math.min(SIM_CONFIG.MAX_GREEN_TIME, Math.max(SIM_CONFIG.MIN_GREEN_TIME, green));
        i.redDuration = Math.min(SIM_CONFIG.MAX_GREEN_TIME, Math.max(SIM_CONFIG.MIN_GREEN_TIME, red));
    }

    // ─────────────────────────────────────────────────────────
    //  Snapshot — sent to all clients every tick
    // ─────────────────────────────────────────────────────────
    getSnapshot() {
        const ints: Record<string, unknown> = {};
        for (const [iid, i] of this.intersections) {
            const sig = i.forcedState ?? i.signalState;
            const cong = this._cong(i.queue.size);
            ints[iid] = {
                id: i.id, name: i.name, x: i.x, y: i.y, nodeId: i.nodeId,
                signalState: sig, queueLength: i.queue.size, congestionLevel: cong,
                greenDuration: i.greenDuration, redDuration: i.redDuration,
                manualOverride: i.manualOverride, aiActive: i.aiActive,
            };
        }
        return {
            tick: this.tick, simTime: this.simTime, state: this.state,
            vehicleCount: this.vehicles.size,
            totalSpawned: this.totalSpawned,
            totalDespawned: this.totalDespawned,
            vehicles: Array.from(this.vehicles.values()).map(v => {
                const curIdx = Math.min(v.routeIndex, v.route.length - 1);
                const nextIdx = Math.min(v.routeIndex + 1, v.route.length - 1);
                const curIid = v.route[curIdx] || v.origin;
                const nextIid = v.route[nextIdx] || v.destination;
                const currentRoad = curIid !== nextIid ? `${curIid} → ${nextIid}` : curIid;
                const stopsRemaining = Math.max(0, v.route.length - 1 - v.routeIndex);
                const progress = v.route.length > 1
                    ? Math.round((v.routeIndex / (v.route.length - 1)) * 100)
                    : 100;
                return {
                    vehicleId: v.vehicleId,
                    vehicleType: v.vehicleType,
                    x: v.x, y: v.y,
                    state: v.state,
                    isEmergency: v.isEmergency,
                    colour: v.colour,
                    waitTime: parseFloat(v.waitTime.toFixed(1)),
                    destination: v.destination,
                    origin: v.origin,
                    route: v.route,
                    routeIndex: v.routeIndex,
                    speed: parseFloat((v.speed * (v.state === 'waiting' ? 0 : 1)).toFixed(1)),
                    speedKmh: parseFloat((v.speed * 3.6).toFixed(0)),
                    currentRoad,
                    stopsRemaining,
                    progress,
                };
            }),
            intersections: ints,
            accidents: Array.from(this.accidents.values()),
            blockedRoads: Array.from(this.blockedRoads).map(r => r.split('-')),
            rushHour: this.rushHour,
            rainMode: this.rainMode,
            aiEnabled: this.aiEnabled,
            spawnRate: this.spawnRate,
        };
    }

    getAnalytics() {
        let totalWait = 0;
        for (const v of this.vehicles.values()) totalWait += v.waitTime;
        const count = Math.max(1, this.vehicles.size);
        const congs = Array.from(this.intersections.values()).map(i => this._cong(i.queue.size));
        const avgC = congs.reduce((a, b) => a + b, 0) / Math.max(1, congs.length);
        return {
            totalVehicles: this.vehicles.size,
            avgWaitTime: totalWait / count,
            congestionPct: avgC * 100,
            activeAccidents: this.accidents.size,
            tick: this.tick,
            simTimeS: this.simTime,
            totalSpawned: this.totalSpawned,
            totalDespawned: this.totalDespawned,
        };
    }

    getAIStats() {
        return { decisionCount: this.ai.getCount(), ruleNames: this.ai.getRuleNames() };
    }
}
