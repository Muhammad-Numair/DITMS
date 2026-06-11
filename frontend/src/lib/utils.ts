// frontend/src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const fmtTime = (s: number) => {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return h > 0
    ? `${h}h ${String(m).padStart(2,'0')}m ${String(ss).padStart(2,'0')}s`
    : `${m}m ${String(ss).padStart(2,'0')}s`;
};

export const SIGNAL_COLOURS: Record<string, string> = {
  GREEN:  '#22c55e',
  YELLOW: '#eab308',
  RED:    '#ef4444',
};

export const NODE_STATUS_COLOUR: Record<string, string> = {
  online:     'text-green-400',
  offline:    'text-red-400',
  recovering: 'text-yellow-400',
  degraded:   'text-orange-400',
};

export const NODE_STATUS_DOT: Record<string, string> = {
  online:     'bg-green-400',
  offline:    'bg-red-400',
  recovering: 'bg-yellow-400',
  degraded:   'bg-orange-400',
};

export const VEHICLE_EMOJI: Record<string, string> = {
  car:        '🚗',
  bus:        '🚌',
  truck:      '🚛',
  bike:       '🏍',
  ambulance:  '🚑',
  police:     '🚓',
  fire_truck: '🚒',
};

export const DISTRICTS: Record<string, string> = {
  node_a: 'NW District',
  node_b: 'NE District',
  node_c: 'Central Hub',
  node_d: 'SE District',
  node_e: 'SW District',
};

export const NODE_LIST  = ['node_a','node_b','node_c','node_d','node_e'];

export const IID_LIST = [
  'I01','I02','I03','I04','I05','I06','I07','I08',
  'I09','I10','I11','I12','I13','I14','I15','I16',
  'I17','I18','I19','I20',
];

export const CHART_THEME = {
  grid:    { stroke: '#1e3a5f', strokeDasharray: '3 3' as const },
  axis:    { stroke: '#64748b', fontSize: 10 },
  tooltip: {
    contentStyle: {
      background:   '#1e293b',
      border:       '1px solid #1e3a5f',
      borderRadius: 8,
      fontSize:     12,
    },
  },
};
