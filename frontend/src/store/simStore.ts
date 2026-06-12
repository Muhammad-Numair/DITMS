// frontend/src/store/simStore.ts — Updated with all new snapshot fields
import { create } from 'zustand';
import type { Socket } from 'socket.io-client';

export interface IntersectionData {
  id: string; name: string; x: number; y: number; nodeId: string;
  signalState: 'RED'|'YELLOW'|'GREEN';
  queueLength: number; congestionLevel: number;
  greenDuration: number; redDuration: number;
  manualOverride: boolean; aiActive: boolean;
}
export interface VehicleData {
  vehicleId:      string;
  vehicleType:    string;
  x:              number;
  y:              number;
  state:          string;
  isEmergency:    boolean;
  colour:         string;
  waitTime:       number;
  destination:    string;
  origin:         string;
  route:          string[];
  routeIndex:     number;
  speed:          number;   // px/s (0 when waiting)
  speedKmh:       number;   // km/h equivalent
  currentRoad:    string;   // e.g. "I04 → I09"
  stopsRemaining: number;   // intersections left to destination
  progress:       number;   // 0-100 % of route completed
}
export interface AccidentData {
  accidentId: string; intersectionId: string; severity: string;
  blockedLanes: number; status: string; createdAt: string;
}
export interface NodeData {
  nodeId: string; status: string; commDelayMs: number;
  pendingTxns: number; congestionAvg: number; vehicleCount: number;
  aiActive: boolean; lastHeartbeat: string;
}
export interface Analytics {
  totalVehicles: number; avgWaitTime: number;
  congestionPct: number; activeAccidents: number;
  tick: number; simTimeS: number;
  totalSpawned: number; totalDespawned: number;
}
export interface LogEntry {
  id: string; level: string; source: string;
  message: string; timestamp: string;
}

const DEF: Analytics = {
  totalVehicles:0, avgWaitTime:0, congestionPct:0,
  activeAccidents:0, tick:0, simTimeS:0,
  totalSpawned:0, totalDespawned:0,
};

interface SimStore {
  socket:        Socket | null;
  simState:      'running'|'paused'|'stopped';
  tick:          number;
  vehicles:      VehicleData[];
  intersections: Record<string, IntersectionData>;
  accidents:     AccidentData[];
  blockedRoads:  string[][];
  analytics:     Analytics;
  nodeStatuses:  Record<string, NodeData>;
  logs:          LogEntry[];
  rushHour:      boolean;
  rainMode:      boolean;
  aiEnabled:     boolean;
  spawnRate:     number;
  connected:     boolean;

  initSocket:  (s: Socket) => void;
  addLog:      (e: LogEntry) => void;
  clearLogs:   () => void;
}

export const useSimStore = create<SimStore>((set, get) => ({
  socket:null, simState:'stopped', tick:0,
  vehicles:[], intersections:{}, accidents:[],
  blockedRoads:[], analytics:DEF, nodeStatuses:{},
  logs:[], rushHour:false, rainMode:false,
  aiEnabled:true, spawnRate:1, connected:false,

  initSocket(socket) {
    set({ socket, connected: false });

    socket.on('connect',    () => set({ connected: true  }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('sim:tick', (snap: {
      tick:number; state:string; vehicleCount:number;
      vehicles:VehicleData[]; intersections:Record<string,IntersectionData>;
      accidents:AccidentData[]; blockedRoads:string[][];
      rushHour:boolean; rainMode:boolean; aiEnabled:boolean; spawnRate:number;
      totalSpawned:number; totalDespawned:number;
    }) => {
      set({
        tick:          snap.tick,
        simState:      snap.state as 'running'|'paused'|'stopped',
        vehicles:      snap.vehicles,
        intersections: snap.intersections,
        accidents:     snap.accidents,
        blockedRoads:  snap.blockedRoads,
        rushHour:      snap.rushHour,
        rainMode:      snap.rainMode,
        aiEnabled:     snap.aiEnabled,
        spawnRate:     snap.spawnRate,
      });
    });

    socket.on('sim:analytics', (a: Analytics) => set({ analytics: a }));
    socket.on('sim:stateChange', ({ state }: {state:string}) =>
      set({ simState: state as 'running'|'paused'|'stopped' })
    );
    socket.on('node:statuses', (s: Record<string, NodeData>) => set({ nodeStatuses: s }));
    socket.on('node:status', ({ nodeId, status }: {nodeId:string;status:string}) =>
      set(s => ({ nodeStatuses: { ...s.nodeStatuses, [nodeId]: { ...s.nodeStatuses[nodeId], nodeId, status } as NodeData }}))
    );
    socket.on('log:entry',         (e: LogEntry)      => get().addLog(e));
    socket.on('accident:created',  (a: AccidentData)  => set(s => ({ accidents: [a, ...s.accidents] })));
    socket.on('accident:resolved', (id: string)        => set(s => ({ accidents: s.accidents.filter(a => a.accidentId !== id) })));
  },

  addLog:    (e) => set(s => ({ logs: [e, ...s.logs].slice(0, 600) })),
  clearLogs: ()  => set({ logs: [] }),
}));
