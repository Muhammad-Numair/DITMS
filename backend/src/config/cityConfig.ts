// backend/src/config/cityConfig.ts
export interface IntersectionDef { id: string; name: string; x: number; y: number; district: string; }
export interface RoadDef { fromId: string; toId: string; distance: number; speedLimit: number; lanes: number; bidirectional: boolean; }

export const DISTRICTS: Record<string, string> = {
  node_a: 'NW District', node_b: 'NE District', node_c: 'Central Hub',
  node_d: 'SE District', node_e: 'SW District',
};

export const INTERSECTIONS: IntersectionDef[] = [
  { id: 'I01', name: 'NW-Alpha',  x: 150, y: 150, district: 'node_a' },
  { id: 'I02', name: 'NW-Beta',   x: 300, y: 150, district: 'node_a' },
  { id: 'I03', name: 'NW-Gamma',  x: 150, y: 300, district: 'node_a' },
  { id: 'I04', name: 'NW-Delta',  x: 300, y: 300, district: 'node_a' },
  { id: 'I05', name: 'NE-Alpha',  x: 550, y: 150, district: 'node_b' },
  { id: 'I06', name: 'NE-Beta',   x: 700, y: 150, district: 'node_b' },
  { id: 'I07', name: 'NE-Gamma',  x: 550, y: 300, district: 'node_b' },
  { id: 'I08', name: 'NE-Delta',  x: 700, y: 300, district: 'node_b' },
  { id: 'I09', name: 'Central-N', x: 350, y: 350, district: 'node_c' },
  { id: 'I10', name: 'Central-W', x: 500, y: 350, district: 'node_c' },
  { id: 'I11', name: 'Central-E', x: 350, y: 500, district: 'node_c' },
  { id: 'I12', name: 'Central-S', x: 500, y: 500, district: 'node_c' },
  { id: 'I13', name: 'SE-Alpha',  x: 550, y: 550, district: 'node_d' },
  { id: 'I14', name: 'SE-Beta',   x: 700, y: 550, district: 'node_d' },
  { id: 'I15', name: 'SE-Gamma',  x: 550, y: 700, district: 'node_d' },
  { id: 'I16', name: 'SE-Delta',  x: 700, y: 700, district: 'node_d' },
  { id: 'I17', name: 'SW-Alpha',  x: 150, y: 550, district: 'node_e' },
  { id: 'I18', name: 'SW-Beta',   x: 300, y: 550, district: 'node_e' },
  { id: 'I19', name: 'SW-Gamma',  x: 150, y: 700, district: 'node_e' },
  { id: 'I20', name: 'SW-Delta',  x: 300, y: 700, district: 'node_e' },
];

export const ROADS: RoadDef[] = [
  { fromId:'I01',toId:'I02',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I01',toId:'I03',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I02',toId:'I04',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I03',toId:'I04',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I05',toId:'I06',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I05',toId:'I07',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I06',toId:'I08',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I07',toId:'I08',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I09',toId:'I10',distance:150,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I09',toId:'I11',distance:150,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I10',toId:'I12',distance:150,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I11',toId:'I12',distance:150,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I13',toId:'I14',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I13',toId:'I15',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I14',toId:'I16',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I15',toId:'I16',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I17',toId:'I18',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I17',toId:'I19',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I18',toId:'I20',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I19',toId:'I20',distance:150,speedLimit:50,lanes:2,bidirectional:true },
  { fromId:'I02',toId:'I05',distance:250,speedLimit:80,lanes:4,bidirectional:true },
  { fromId:'I04',toId:'I07',distance:250,speedLimit:80,lanes:4,bidirectional:true },
  { fromId:'I04',toId:'I09',distance:200,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I03',toId:'I11',distance:200,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I07',toId:'I10',distance:200,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I08',toId:'I12',distance:200,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I12',toId:'I13',distance:200,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I10',toId:'I14',distance:250,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I11',toId:'I18',distance:200,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I09',toId:'I17',distance:250,speedLimit:60,lanes:3,bidirectional:true },
  { fromId:'I15',toId:'I20',distance:250,speedLimit:80,lanes:4,bidirectional:true },
];

export const SIM_CONFIG = {
  TICK_RATE_HZ: 1, TICK_INTERVAL_MS: 50,
  DEFAULT_SPAWN_RATE: 1, MAX_VEHICLES: 200,
  DEFAULT_GREEN_TIME: 30, DEFAULT_RED_TIME: 30, DEFAULT_YELLOW_TIME: 5,
  MIN_GREEN_TIME: 10, MAX_GREEN_TIME: 90,
  LOW_CONGESTION: 5, MEDIUM_CONGESTION: 10, HIGH_CONGESTION: 20,
  AI_DECISION_INTERVAL: 5, QUEUE_THRESHOLD: 8,
};

export const VEHICLE_SPEEDS: Record<string, number> = {
  car:70, bus:55, truck:40, bike:30, ambulance:110, police:110, fire_truck:90,
};
export const VEHICLE_COLOURS: Record<string, string> = {
  car:'#4FC3F7', bus:'#FFB74D', truck:'#A1887F', bike:'#81C784',
  ambulance:'#EF5350', police:'#5C6BC0', fire_truck:'#FF7043',
};
export const DEFAULT_USERS = [
  { username:'admin', password:'admin123', role:'admin' },
];
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'can_crash_nodes','can_recover_nodes','can_manage_users',
    'can_override_signals','can_spawn_vehicles','can_spawn_emergency',
    'can_create_accidents','can_view_analytics','can_view_logs',
  ],
};
