'use client';
// Main dashboard — city map always full-width, sliding control panel on right
import { useState, useRef, useCallback, useEffect } from 'react';
import { useSimStore } from '@/store/simStore';
import { useAuthStore } from '@/store/authStore';
import { cn, SIGNAL_COLOURS, DISTRICTS, NODE_STATUS_COLOUR, NODE_STATUS_DOT, NODE_LIST, IID_LIST, VEHICLE_EMOJI, fmtTime, CHART_THEME } from '@/lib/utils';
import { MAP_ROADS } from '@/lib/mapConfig';
import {
  Settings, X, ChevronRight, Activity, Car, AlertTriangle, Clock,
  Play, Pause, Square, Zap, CloudRain, Network, Ambulance, ScrollText,
  BarChart3, TrendingUp, Cpu, Radio,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { fetchAIDecisions, fetchTransactions, fetchPGNodes, fetchWAL, fetchLocks, fetchNodeComms } from '@/lib/socket';
import type { Analytics, VehicleData, AccidentData, NodeData, LogEntry, IntersectionData } from '@/store/simStore';

// ── Map constants ───────────────────────────────────────────
const IR = 12;  // intersection radius
const VR = 5;   // vehicle radius

function roadColour(fromCong: number, toCong: number, blocked: boolean): string {
  if (blocked) return '#ef4444';
  const c = (fromCong + toCong) / 2;
  return c < 0.33 ? '#1e3a5f' : c < 0.66 ? '#92400e' : '#7f1d1d';
}

// ── Panel tabs ─────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview',    icon: Activity   },
  { id: 'signals',     label: 'Signals',     icon: Radio      },
  { id: 'traffic',     label: 'Traffic',     icon: Car        },
  { id: 'emergency',   label: 'Emergency',   icon: Ambulance  },
  { id: 'accidents',   label: 'Accidents',   icon: AlertTriangle },
  { id: 'nodes',       label: 'Nodes',       icon: Network    },
  { id: 'analytics',   label: 'Analytics',   icon: BarChart3  },
  { id: 'logs',        label: 'Logs',        icon: ScrollText },
] as const;
type TabId = typeof TABS[number]['id'];

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const socket        = useSimStore(s => s.socket);
  const simState      = useSimStore(s => s.simState);
  const tick          = useSimStore(s => s.tick);
  const vehicles      = useSimStore(s => s.vehicles);
  const intersections = useSimStore(s => s.intersections);
  const accidents     = useSimStore(s => s.accidents);
  const blockedRoads  = useSimStore(s => s.blockedRoads);
  const analytics     = useSimStore(s => s.analytics);
  const nodeStatuses  = useSimStore(s => s.nodeStatuses);
  const logs          = useSimStore(s => s.logs);
  const rushHour      = useSimStore(s => s.rushHour);
  const rainMode      = useSimStore(s => s.rainMode);
  const aiEnabled     = useSimStore(s => s.aiEnabled);
  const spawnRate     = useSimStore(s => s.spawnRate);
  const connected     = useSimStore(s => s.connected);
  const user          = useAuthStore(s => s.user);
  const logout        = useAuthStore(s => s.logout);

  // Panel state
  const [panelOpen,      setPanelOpen]      = useState(true);
  const [activeTab,      setActiveTab]      = useState<TabId>('overview');
  const [selected,       setSelected]       = useState<string | null>(null);
  const [hoveredVehicle, setHoveredVehicle] = useState<VehicleData | null>(null);
  const [cardPos,        setCardPos]        = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Map zoom/pan
  const [scale, setScale] = useState(0.92);
  const [pan,   setPan]   = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active:boolean; sx:number; sy:number; px:number; py:number }>({
    active:false, sx:0, sy:0, px:0, py:0
  });

  const emit = (ev: string, data?: unknown) =>
    data !== undefined ? socket?.emit(ev, data) : socket?.emit(ev);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.min(4, Math.max(0.3, s * (e.deltaY < 0 ? 1.12 : 0.88))));
  }, []);
  const onMD = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('circle')) return;
    dragRef.current = { active:true, sx:e.clientX, sy:e.clientY, px:pan.x, py:pan.y };
  };
  const onMM = (e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    setPan({ x: dragRef.current.px + e.clientX - dragRef.current.sx, y: dragRef.current.py + e.clientY - dragRef.current.sy });
  };
  const onMU = () => { dragRef.current.active = false; };

  const blockedSet = new Set(blockedRoads.map(r => `${r[0]}-${r[1]}`));
  const selectedInter = selected ? intersections[selected] : null;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#080d1a]">

      {/* ── Top status bar ── */}
      <div className="h-10 flex-shrink-0 bg-slate-900/90 border-b border-slate-800 flex items-center px-3 gap-4 z-20">
        <span className="text-indigo-400 font-bold text-sm">🚦 DITMS</span>

        {/* Connection indicator */}
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', connected ? 'bg-green-400 animate-pulse' : 'bg-red-400')} />
          <span className={cn('text-xs font-medium', connected ? 'text-green-400' : 'text-red-400')}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Sim state */}
        <div className="flex items-center gap-1.5">
          <Activity size={12} className={simState==='running'?'text-green-400':simState==='paused'?'text-yellow-400':'text-slate-500'} />
          <span className={cn('text-xs uppercase font-semibold tracking-wider',
            simState==='running'?'text-green-400':simState==='paused'?'text-yellow-400':'text-slate-500')}>
            {simState}
          </span>
        </div>

        <div className="flex-1 flex items-center gap-5 text-xs text-slate-400">
          <span>Tick <strong className="text-slate-200">{tick.toLocaleString()}</strong></span>
          <span>Vehicles <strong className="text-blue-400">{vehicles.length}</strong></span>
          <span>Spawned <strong className="text-green-400">{analytics.totalSpawned}</strong></span>
          <span>Despawned <strong className="text-slate-400">{analytics.totalDespawned}</strong></span>
          <span>Congestion <strong className={analytics.congestionPct>66?'text-red-400':analytics.congestionPct>33?'text-yellow-400':'text-green-400'}>
            {analytics.congestionPct.toFixed(1)}%
          </strong></span>
          <span>Wait <strong className="text-amber-400">{analytics.avgWaitTime.toFixed(1)}s</strong></span>
          {accidents.length > 0 && <span>Accidents <strong className="text-red-400">{accidents.length}</strong></span>}
          {rushHour && <span className="text-amber-400 font-semibold">⚡ RUSH HOUR</span>}
          {rainMode  && <span className="text-blue-400 font-semibold">🌧 RAIN</span>}
          <span className="text-slate-500">Spawn rate: <strong className="text-slate-300">{spawnRate}/tick</strong></span>
        </div>

        {/* Quick sim controls */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => emit('sim:start')}  disabled={simState==='running'} title="Start"
            className="p-1.5 rounded bg-green-800 hover:bg-green-700 disabled:opacity-30 transition-colors text-green-300">
            <Play size={13}/>
          </button>
          <button onClick={() => simState==='running' ? emit('sim:pause') : emit('sim:start')} title="Pause/Resume"
            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300">
            <Pause size={13}/>
          </button>
          <button onClick={() => emit('sim:stop')} disabled={simState==='stopped'} title="Stop"
            className="p-1.5 rounded bg-red-900 hover:bg-red-800 disabled:opacity-30 transition-colors text-red-300">
            <Square size={13}/>
          </button>
        </div>

        <span className="text-xs text-slate-500">{user?.username}</span>
        <button onClick={() => { logout(); }} className="text-xs text-slate-500 hover:text-red-400 transition-colors">Sign out</button>

        {/* Panel toggle */}
        <button onClick={() => setPanelOpen(o => !o)}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white text-xs transition-colors font-medium ml-2">
          <Settings size={12}/>
          {panelOpen ? 'Hide Panel' : 'Show Panel'}
          <ChevronRight size={12} className={cn('transition-transform', panelOpen ? 'rotate-180' : '')}/>
        </button>
      </div>

      {/* ── Main content: map + sliding panel ── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── City Map — always full behind, gets pushed when panel opens ── */}
        <div
          ref={mapContainerRef}
          onMouseMove={(e) => {
            if (!mapContainerRef.current) return;
            const rect = mapContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            // Keep card on screen — flip left if near right edge, flip up if near bottom
            const CARD_W = 260, CARD_H = 300, OFFSET = 14;
            const cx = x + OFFSET + CARD_W > rect.width  ? x - CARD_W - OFFSET : x + OFFSET;
            const cy = y + OFFSET + CARD_H > rect.height ? y - CARD_H - OFFSET : y + OFFSET;
            setCardPos({ x: cx, y: cy });
          }}
          className={cn('relative flex-1 transition-all duration-300 ease-in-out overflow-hidden',
          panelOpen ? 'mr-[400px]' : 'mr-0')}>

          {/* Zoom controls */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
            {[{l:'+',fn:()=>setScale(s=>Math.min(4,s*1.2))},{l:'−',fn:()=>setScale(s=>Math.max(0.3,s/1.2))},{l:'⊙',fn:()=>{setScale(0.92);setPan({x:0,y:0});}}].map(b=>(
              <button key={b.l} onClick={b.fn}
                className="w-7 h-7 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded font-bold text-sm flex items-center justify-center transition-colors backdrop-blur-sm">
                {b.l}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs border border-slate-700 space-y-1">
            <div className="flex gap-3 text-slate-300">
              <span className="text-green-400">●</span> Green
              <span className="text-yellow-400">●</span> Yellow
              <span className="text-red-400">●</span> Red
            </div>
            <div className="flex gap-3 text-slate-400">
              <span style={{color:'#1e3a5f'}}>━</span> Clear
              <span style={{color:'#92400e'}}>━</span> Medium
              <span style={{color:'#7f1d1d'}}>━</span> Heavy
            </div>
            <div className="text-slate-500 border-t border-slate-700 pt-1">
              Sim time: {fmtTime(analytics.simTimeS)}
            </div>
          </div>

          {/* Intersection inspector tooltip */}
          {selectedInter && (
            <div className="absolute top-3 right-3 z-10 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-xl p-3 w-52">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-bold text-slate-100">{selectedInter.id}</div>
                  <div className="text-xs text-slate-400">{selectedInter.name}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: SIGNAL_COLOURS[selectedInter.signalState]}}/>
                  <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300 ml-1"><X size={13}/></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[['Signal', selectedInter.signalState, SIGNAL_COLOURS[selectedInter.signalState]],
                  ['Queue', selectedInter.queueLength+'', '#e2e8f0'],
                  ['Congestion', (selectedInter.congestionLevel*100).toFixed(0)+'%', '#fb923c'],
                  ['Node', selectedInter.nodeId, '#a5b4fc']].map(([k,v,c])=>(
                  <div key={k} className="bg-slate-800 rounded p-1.5">
                    <div className="text-slate-500">{k}</div>
                    <div className="font-semibold" style={{color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Quick signal override */}
              <div className="mt-2 grid grid-cols-3 gap-1">
                {(['GREEN','RED','YELLOW'] as const).map(s=>(
                  <button key={s} onClick={() => emit('signal:override',{intersectionId:selectedInter.id,state:s})}
                    className="text-xs py-1 rounded font-medium"
                    style={{backgroundColor:`${SIGNAL_COLOURS[s]}22`,color:SIGNAL_COLOURS[s],border:`1px solid ${SIGNAL_COLOURS[s]}44`}}>
                    {s[0]+s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <button onClick={() => emit('signal:override',{intersectionId:selectedInter.id,state:null})}
                className="w-full mt-1 text-xs py-1 rounded bg-indigo-900/40 text-indigo-400 border border-indigo-800 hover:bg-indigo-900/60 transition-colors">
                AI Mode
              </button>
              {selectedInter.manualOverride && <p className="text-xs text-orange-400 mt-1">⚠ Manual override active</p>}
            </div>
          )}

          {/* SVG Map */}
          <svg viewBox="0 0 850 850" className="w-full h-full"
            style={{ cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
            onWheel={onWheel} onMouseDown={onMD} onMouseMove={onMM}
            onMouseUp={onMU} onMouseLeave={onMU}>
            <rect width={850} height={850} fill="#080d1a"/>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>

              {/* District shading */}
              {[{x:100,y:100,w:250,h:250,c:'rgba(30,58,138,0.1)'},{x:490,y:100,w:260,h:250,c:'rgba(88,28,135,0.1)'},
                {x:290,y:295,w:260,h:255,c:'rgba(6,78,59,0.1)'},{x:490,y:490,w:260,h:260,c:'rgba(120,53,15,0.1)'},
                {x:100,y:490,w:250,h:260,c:'rgba(127,29,29,0.1)'}].map((d,i)=>(
                <rect key={i} x={d.x} y={d.y} width={d.w} height={d.h} fill={d.c} rx={8}/>
              ))}

              {/* Roads */}
              {MAP_ROADS.map(r => {
                const from = intersections[r.f]; const to = intersections[r.t];
                if (!from || !to) return null;
                const blocked = blockedSet.has(`${r.f}-${r.t}`);
                return (
                  <line key={`${r.f}-${r.t}`}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={roadColour(from.congestionLevel, to.congestionLevel, blocked)}
                    strokeWidth={Math.max(1.5, r.l)} strokeLinecap="round"
                    strokeOpacity={blocked ? 1 : 0.8}
                  />
                );
              })}

              {/* Intersections */}
              {Object.values(intersections).map(inter => {
                const sig    = inter.signalState;
                const colour = SIGNAL_COLOURS[sig] || '#6b7280';
                const r      = IR + inter.congestionLevel * 6;
                const sel    = selected === inter.id;
                const hasAcc = accidents.some(a => a.intersectionId === inter.id);
                return (
                  <g key={inter.id} onClick={() => setSelected(s => s===inter.id?null:inter.id)}
                    style={{ cursor:'pointer' }}>
                    {/* Glow */}
                    <circle cx={inter.x} cy={inter.y} r={r+6} fill={colour} fillOpacity={0.12}/>
                    {/* Main circle */}
                    <circle cx={inter.x} cy={inter.y} r={r} fill={colour} fillOpacity={0.9}
                      stroke={sel?'#fff':hasAcc?'#ef4444':inter.manualOverride?'#f97316':'rgba(255,255,255,0.2)'}
                      strokeWidth={sel||hasAcc||inter.manualOverride ? 2.5 : 0.5}/>
                    {/* Accident marker */}
                    {hasAcc && <text x={inter.x} y={inter.y-r-5} textAnchor="middle" fontSize={11} fill="#ef4444">⚠</text>}
                    {/* Override dot */}
                    {inter.manualOverride && <circle cx={inter.x+r-2} cy={inter.y-r+2} r={4} fill="#f97316"/>}
                    {/* Label */}
                    <text x={inter.x} y={inter.y+r+11} textAnchor="middle" fontSize={7.5} fill="#64748b">{inter.id}</text>
                  </g>
                );
              })}

              {/* Vehicles — with hover card */}
              {vehicles.map(v => (
                <g key={v.vehicleId}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredVehicle(v)}
                  onMouseLeave={() => setHoveredVehicle(null)}>
                  {/* Hover highlight ring */}
                  {hoveredVehicle?.vehicleId === v.vehicleId && (
                    <circle cx={v.x} cy={v.y} r={VR+10}
                      fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)"
                      strokeWidth={1.5} strokeDasharray="3 2"/>
                  )}
                  {v.isEmergency && (
                    <circle cx={v.x} cy={v.y} r={VR+8} fill="none" stroke="#f97316" strokeWidth={2} opacity={0.6}>
                      <animate attributeName="r" values={`${VR+4};${VR+10};${VR+4}`} dur="0.8s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" values="0.7;0.2;0.7" dur="0.8s" repeatCount="indefinite"/>
                    </circle>
                  )}
                  <circle
                    cx={v.x} cy={v.y}
                    r={v.isEmergency ? VR+3 : VR}
                    fill={v.colour || '#4FC3F7'}
                    fillOpacity={v.state==='waiting'?0.6:1}
                    stroke={hoveredVehicle?.vehicleId===v.vehicleId?'#fff':v.state==='waiting'?'rgba(255,255,255,0.6)':v.isEmergency?'#fff':'none'}
                    strokeWidth={hoveredVehicle?.vehicleId===v.vehicleId?2:v.state==='waiting'||v.isEmergency?1.5:0}
                  />
                </g>
              ))}

            </g>
          </svg>

          {/* ── Vehicle Hover Card ── */}
          {hoveredVehicle && (
            <VehicleHoverCard vehicle={hoveredVehicle} x={cardPos.x} y={cardPos.y}/>
          )}
        </div>

        {/* ── Sliding Sidebar Panel ── */}
        <div className={cn(
          'absolute top-0 right-0 h-full w-[400px] bg-slate-900 border-l border-slate-800 flex flex-col z-10',
          'transition-transform duration-300 ease-in-out',
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        )}>
          {/* Tab bar */}
          <div className="flex-shrink-0 bg-slate-950 border-b border-slate-800 overflow-x-auto">
            <div className="flex">
              {TABS.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={cn('flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors whitespace-nowrap border-b-2 flex-shrink-0',
                      activeTab===t.id
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-950/30'
                        : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50')}>
                    <Icon size={14}/>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto sidebar-panel p-3 space-y-3">
            {activeTab === 'overview'  && <OverviewTab emit={emit} analytics={analytics} simState={simState} rushHour={rushHour} rainMode={rainMode} aiEnabled={aiEnabled} nodeStatuses={nodeStatuses} accidents={accidents} vehicles={vehicles}/>}
            {activeTab === 'signals'   && <SignalsTab emit={emit} intersections={intersections}/>}
            {activeTab === 'traffic'   && <TrafficTab emit={emit} spawnRate={spawnRate} vehicles={vehicles}/>}
            {activeTab === 'emergency' && <EmergencyTab emit={emit} vehicles={vehicles}/>}
            {activeTab === 'accidents' && <AccidentsTab emit={emit} accidents={accidents}/>}
            {activeTab === 'nodes'     && <NodesTab emit={emit} nodeStatuses={nodeStatuses}/>}
            {activeTab === 'analytics' && <AnalyticsTab analytics={analytics} tick={tick}/>}
            {activeTab === 'logs'      && <LogsTab logs={logs}/>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VEHICLE HOVER CARD
// ─────────────────────────────────────────────────────────────

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car:        'Passenger Car',
  bus:        'City Bus',
  truck:      'Freight Truck',
  bike:       'Motorcycle',
  ambulance:  'Ambulance',
  police:     'Police Vehicle',
  fire_truck: 'Fire Truck',
};

const STATE_CONFIG: Record<string, { label: string; colour: string; dot: string }> = {
  moving:  { label: 'Moving',  colour: 'text-green-400',  dot: 'bg-green-400'  },
  waiting: { label: 'Waiting', colour: 'text-yellow-400', dot: 'bg-yellow-400' },
  arrived: { label: 'Arrived', colour: 'text-slate-400',  dot: 'bg-slate-400'  },
};

function VehicleHoverCard({ vehicle: v, x, y }: {
  vehicle: VehicleData;
  x: number;
  y: number;
}) {
  const stateConf = STATE_CONFIG[v.state] || STATE_CONFIG.moving;
  const isEmergency = v.isEmergency;

  return (
    <div
      className="absolute z-50 pointer-events-none select-none animate-fade-in"
      style={{ left: x, top: y, width: 252 }}
    >
      {/* Card */}
      <div className="rounded-xl overflow-hidden shadow-2xl"
        style={{ border: `1px solid ${isEmergency ? '#f97316' : '#334155'}`, background: '#0f1929' }}>

        {/* Header — vehicle type + ID */}
        <div className="px-3.5 py-2.5 flex items-center gap-2.5"
          style={{ background: isEmergency ? 'rgba(249,115,22,0.15)' : 'rgba(30,58,138,0.25)', borderBottom: `1px solid ${isEmergency ? 'rgba(249,115,22,0.3)' : '#1e3a5f'}` }}>
          <span className="text-2xl">{VEHICLE_EMOJI[v.vehicleType] || '🚗'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold" style={{ color: v.colour }}>{v.vehicleId}</span>
              {isEmergency && (
                <span className="text-xs font-bold text-orange-400 bg-orange-900/40 px-1.5 py-0.5 rounded-full animate-pulse">
                  🚨 EMERGENCY
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 truncate">{VEHICLE_TYPE_LABELS[v.vehicleType] || v.vehicleType}</div>
          </div>
        </div>

        {/* Body — stats grid */}
        <div className="p-3 space-y-2.5">

          {/* Status + Speed row */}
          <div className="grid grid-cols-2 gap-2">
            <StatCell
              label="Status"
              value={stateConf.label}
              valueClass={stateConf.colour}
              icon={<span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${stateConf.dot} ${v.state === 'moving' ? 'animate-pulse' : ''}`}/>}
            />
            <StatCell
              label="Speed"
              value={v.state === 'waiting' ? '0 km/h' : `${v.speedKmh} km/h`}
              valueClass={v.state === 'waiting' ? 'text-yellow-400' : 'text-green-400'}
            />
          </div>

          {/* Current road */}
          <div className="bg-slate-900/80 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500 mb-0.5">Current Road</div>
            <div className="text-sm font-mono font-semibold text-sky-400">{v.currentRoad}</div>
          </div>

          {/* Origin → Destination */}
          <div className="bg-slate-900/80 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-500 mb-1">Route</div>
            <div className="flex items-center gap-2 text-sm">
              <div className="flex flex-col items-center gap-0.5">
                <span className="w-2 h-2 rounded-full bg-green-400"/>
                <div className="w-px h-3 bg-slate-600"/>
                <span className="w-2 h-2 rounded-full bg-red-400"/>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-green-400 font-semibold">{v.origin}</div>
                <div className="font-mono text-red-400 font-semibold">{v.destination}</div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Route progress</span>
              <span className="text-slate-300 font-medium">{v.progress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${v.progress}%`,
                  background: isEmergency
                    ? 'linear-gradient(90deg, #f97316, #ef4444)'
                    : `linear-gradient(90deg, ${v.colour}99, ${v.colour})`,
                }}
              />
            </div>
          </div>

          {/* Bottom stats row */}
          <div className="grid grid-cols-3 gap-1.5">
            <MiniStat label="Stops left" value={v.stopsRemaining} />
            <MiniStat
              label="Wait time"
              value={v.waitTime > 0 ? `${v.waitTime}s` : '—'}
              valueClass={v.waitTime > 30 ? 'text-red-400' : v.waitTime > 10 ? 'text-yellow-400' : 'text-slate-300'}
            />
            <MiniStat
              label="Total hops"
              value={v.route.length > 0 ? v.route.length - 1 : 0}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 bg-slate-900/60 border-t border-slate-800">
          <div className="text-xs text-slate-600 text-center font-mono">
            route [{v.routeIndex + 1}/{v.route.length}]
          </div>
        </div>
      </div>

      {/* Pointer triangle */}
      <div className="absolute -top-1.5 left-4 w-3 h-3 rotate-45 rounded-sm"
        style={{ background: '#0f1929', borderLeft: `1px solid ${isEmergency ? '#f97316' : '#334155'}`, borderTop: `1px solid ${isEmergency ? '#f97316' : '#334155'}` }}
      />
    </div>
  );
}

// Sub-components for the hover card
function StatCell({ label, value, valueClass = 'text-slate-200', icon }: {
  label: string; value: string | number;
  valueClass?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/80 rounded-lg px-2.5 py-2">
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold flex items-center ${valueClass}`}>
        {icon}{value}
      </div>
    </div>
  );
}

function MiniStat({ label, value, valueClass = 'text-slate-300' }: {
  label: string; value: string | number; valueClass?: string;
}) {
  return (
    <div className="bg-slate-900/80 rounded-lg px-2 py-1.5 text-center">
      <div className="text-slate-500" style={{ fontSize: 9 }}>{label}</div>
      <div className={`text-xs font-bold mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB CONTENT COMPONENTS
// ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title:string; children:React.ReactNode }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2.5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────
function OverviewTab({ emit, analytics, simState, rushHour, rainMode, aiEnabled, nodeStatuses, accidents, vehicles }: {
  emit:(ev:string,d?:unknown)=>void; analytics:Analytics; simState:string;
  rushHour:boolean; rainMode:boolean; aiEnabled:boolean;
  nodeStatuses:Record<string,NodeData>; accidents:AccidentData[]; vehicles:VehicleData[];
}) {
  const { totalVehicles, avgWaitTime, congestionPct, tick, simTimeS, totalSpawned, totalDespawned } = analytics;
  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label:'Active Vehicles',  v:totalVehicles,               c:'text-blue-400' },
          { label:'Congestion',       v:congestionPct.toFixed(1)+'%', c:congestionPct>66?'text-red-400':congestionPct>33?'text-yellow-400':'text-green-400' },
          { label:'Avg Wait',         v:avgWaitTime.toFixed(1)+'s',  c:'text-amber-400' },
          { label:'Accidents',        v:accidents.length,            c:accidents.length?'text-red-400':'text-green-400' },
          { label:'Total Spawned',    v:totalSpawned,                c:'text-green-400' },
          { label:'Despawned',        v:totalDespawned,              c:'text-slate-400' },
        ].map(k => (
          <div key={k.label} className="bg-slate-900 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className={cn('text-xl font-bold mt-0.5', k.c)}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Sim controls */}
      <Section title="Simulation">
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => emit('sim:start')}  disabled={simState==='running'} className="btn-success text-xs py-2"><Play size={12} className="inline mr-1"/>Start</button>
          <button onClick={() => simState==='running'?emit('sim:pause'):emit('sim:start')} className="btn-ghost text-xs py-2"><Pause size={12} className="inline mr-1"/>{simState==='paused'?'Resume':'Pause'}</button>
          <button onClick={() => emit('sim:stop')} disabled={simState==='stopped'} className="btn-danger text-xs py-2"><Square size={12} className="inline mr-1"/>Stop</button>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Speed Factor</span><span id="spd-v">1.0×</span>
          </div>
          <input type="range" min={1} max={50} defaultValue={10} className="w-full accent-indigo-500"
            onChange={e=>{const v=parseInt(e.target.value)/10;emit('sim:setSpeedFactor',v);const el=document.getElementById('spd-v');if(el)el.textContent=v.toFixed(1)+'×';}}/>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => emit('sim:setRushHour',!rushHour)}
            className={cn('text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1',
              rushHour?'bg-amber-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600')}>
            <Zap size={12}/> Rush Hour
          </button>
          <button onClick={() => emit('sim:setRainMode',!rainMode)}
            className={cn('text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1',
              rainMode?'bg-blue-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600')}>
            <CloudRain size={12}/> Rain
          </button>
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>Sim Time</span>
          <span className="text-slate-200 font-mono">{fmtTime(simTimeS)}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>Tick</span>
          <span className="text-slate-200 font-mono">{tick.toLocaleString()}</span>
        </div>
      </Section>

      {/* Node health */}
      <Section title="Node Health">
        <div className="space-y-1.5">
          {NODE_LIST.map(nid => {
            const nd = nodeStatuses[nid]; const st = nd?.status||'online';
            const dot = NODE_STATUS_DOT[st]||'bg-slate-400';
            const col = NODE_STATUS_COLOUR[st]||'text-slate-400';
            return (
              <div key={nid} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full',dot)}/>
                  <span className="text-xs text-slate-300">{nid}</span>
                  <span className="text-xs text-slate-500">{DISTRICTS[nid]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs capitalize',col)}>{st}</span>
                  {st==='online'
                    ? <button onClick={()=>emit('node:crash',nid)} className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded bg-red-900/30 transition-colors">Crash</button>
                    : <button onClick={()=>emit('node:recover',nid)} className="text-xs text-green-400 hover:text-green-300 px-1.5 py-0.5 rounded bg-green-900/30 transition-colors">Recover</button>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ── Signals Tab ──────────────────────────────────────────────
function SignalsTab({ emit, intersections }: { emit:(ev:string,d?:unknown)=>void; intersections:Record<string,IntersectionData> }) {
  const [selIid, setSelIid] = useState(IID_LIST[0]);
  const [green, setGreen]   = useState(30);
  const [red, setRed]       = useState(30);
  return (
    <div className="space-y-3">
      <Section title="Manual Signal Control">
        <select className="select text-xs" value={selIid} onChange={e=>setSelIid(e.target.value)}>
          {IID_LIST.map(id=><option key={id} value={id}>{id} — {intersections[id]?.name||''}</option>)}
        </select>
        {intersections[selIid] && (
          <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900 rounded p-2">
            <span>Current: <strong style={{color:SIGNAL_COLOURS[intersections[selIid].signalState]}}>{intersections[selIid].signalState}</strong></span>
            <span>Queue: <strong className="text-slate-200">{intersections[selIid].queueLength}</strong></span>
            <span>Cong: <strong className="text-orange-400">{(intersections[selIid].congestionLevel*100).toFixed(0)}%</strong></span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {(['GREEN','RED','YELLOW'] as const).map(s=>(
            <button key={s} onClick={()=>emit('signal:override',{intersectionId:selIid,state:s})}
              className="text-xs py-2 rounded font-semibold"
              style={{backgroundColor:`${SIGNAL_COLOURS[s]}22`,color:SIGNAL_COLOURS[s],border:`1px solid ${SIGNAL_COLOURS[s]}44`}}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={()=>emit('signal:override',{intersectionId:selIid,state:null})}
          className="w-full btn-ghost text-xs py-1.5">
          🤖 Restore AI Mode
        </button>
      </Section>

      <Section title="Signal Timing">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Green (s)</label>
            <input type="number" className="input text-xs" min={10} max={90} value={green} onChange={e=>setGreen(+e.target.value)}/>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Red (s)</label>
            <input type="number" className="input text-xs" min={10} max={90} value={red} onChange={e=>setRed(+e.target.value)}/>
          </div>
        </div>
        <button onClick={()=>emit('signal:setTiming',{intersectionId:selIid,green,red})} className="btn-primary w-full text-xs">Apply Timing</button>
      </Section>

      <Section title="Bulk Signal Override">
        <div className="grid grid-cols-3 gap-1.5">
          {(['GREEN','RED','YELLOW'] as const).map(s=>(
            <button key={s} onClick={()=>IID_LIST.forEach(id=>emit('signal:override',{intersectionId:id,state:s}))}
              className="text-xs py-2 rounded font-semibold"
              style={{backgroundColor:`${SIGNAL_COLOURS[s]}22`,color:SIGNAL_COLOURS[s],border:`1px solid ${SIGNAL_COLOURS[s]}44`}}>
              All {s}
            </button>
          ))}
        </div>
        <button onClick={()=>IID_LIST.forEach(id=>emit('signal:override',{intersectionId:id,state:null}))}
          className="w-full btn-ghost text-xs">All AI Mode</button>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Global AI</span>
          <div className="flex gap-1.5">
            <button onClick={()=>emit('signal:setAI',true)}  className="btn-success text-xs py-1 px-2">ON</button>
            <button onClick={()=>emit('signal:setAI',false)} className="btn-danger  text-xs py-1 px-2">OFF</button>
          </div>
        </div>
        <button onClick={()=>emit('2pc:run',{type:'SIGNAL_SYNC',participantIds:NODE_LIST.slice(0,3)})}
          className="btn-primary w-full text-xs">🔀 Run 2PC Signal Sync</button>
      </Section>
    </div>
  );
}

// ── Traffic Tab ───────────────────────────────────────────────
function TrafficTab({ emit, spawnRate, vehicles }: { emit:(ev:string,d?:unknown)=>void; spawnRate:number; vehicles:VehicleData[] }) {
  const [vtype,  setVtype]  = useState('car');
  const [origin, setOrigin] = useState('');
  const [dest,   setDest]   = useState('');
  const TYPES = ['car','bus','truck','bike','ambulance','police','fire_truck'];

  return (
    <div className="space-y-3">
      <Section title="Spawn Rate">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Vehicles per tick</span>
          <span className="text-slate-200 font-bold">{spawnRate}</span>
        </div>
        <input type="range" min={0} max={20} value={spawnRate} className="w-full accent-indigo-500"
          onChange={e=>emit('sim:setSpawnRate',parseInt(e.target.value))}/>
        <div className="flex gap-1.5">
          {[0,1,2,5,10,15].map(v=>(
            <button key={v} onClick={()=>emit('sim:setSpawnRate',v)}
              className={cn('flex-1 text-xs py-1 rounded transition-colors',
                spawnRate===v?'bg-indigo-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600')}>
              {v}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Spawn Vehicle">
        <select className="select text-xs" value={vtype} onChange={e=>setVtype(e.target.value)}>
          {TYPES.map(t=><option key={t} value={t}>{VEHICLE_EMOJI[t]} {t.replace('_',' ')}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Origin</label>
            <select className="select text-xs" value={origin} onChange={e=>setOrigin(e.target.value)}>
              <option value="">Random</option>
              {IID_LIST.map(id=><option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Destination</label>
            <select className="select text-xs" value={dest} onChange={e=>setDest(e.target.value)}>
              <option value="">Random</option>
              {IID_LIST.filter(id=>id!==origin).map(id=><option key={id} value={id}>{id}</option>)}
            </select>
          </div>
        </div>
        <button onClick={()=>emit('vehicle:spawn',{vehicleType:vtype||undefined,origin:origin||undefined,destination:dest||undefined})}
          className="btn-primary w-full text-xs">{VEHICLE_EMOJI[vtype]} Spawn Vehicle</button>
      </Section>

      <Section title={`Active Vehicles (${vehicles.length})`}>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {Object.entries(
            vehicles.reduce((acc,v)=>{ acc[v.vehicleType]=(acc[v.vehicleType]||0)+1; return acc; },{} as Record<string,number>)
          ).map(([t,c])=>(
            <div key={t} className="flex items-center justify-between text-xs">
              <span className="text-slate-300">{VEHICLE_EMOJI[t]} {t.replace('_',' ')}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-slate-900 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{width:`${Math.min(100,(c/Math.max(1,vehicles.length))*100)}%`}}/>
                </div>
                <span className="text-slate-200 w-5 text-right">{c}</span>
              </div>
            </div>
          ))}
          {vehicles.length===0 && <p className="text-slate-500 text-xs text-center py-2">No vehicles — increase spawn rate</p>}
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-xs text-center pt-1 border-t border-slate-700">
          <div><div className="text-green-400 font-bold">{vehicles.filter(v=>v.state==='moving').length}</div><div className="text-slate-500">Moving</div></div>
          <div><div className="text-yellow-400 font-bold">{vehicles.filter(v=>v.state==='waiting').length}</div><div className="text-slate-500">Waiting</div></div>
          <div><div className="text-orange-400 font-bold">{vehicles.filter(v=>v.isEmergency).length}</div><div className="text-slate-500">Emergency</div></div>
        </div>
      </Section>
    </div>
  );
}

// ── Emergency Tab ─────────────────────────────────────────────
function EmergencyTab({ emit, vehicles }: { emit:(ev:string,d?:unknown)=>void; vehicles:VehicleData[] }) {
  const [vtype, setVtype] = useState('ambulance');
  const [origin,setOrigin]=useState('');
  const [dest,  setDest]  =useState('');
  const [status,setStatus]=useState('');
  const ETYPES = ['ambulance','police','fire_truck'];
  const socket = useSimStore(s=>s.socket);
  useEffect(()=>{
    if(!socket)return;
    const h=(d:{success:boolean;vehicleId?:string;error?:string})=>{
      setStatus(d.success?`✅ Dispatched: ${d.vehicleId}`:`❌ ${d.error}`);
    };
    socket.on('emergency:ack',h);
    return ()=>{socket.off('emergency:ack',h);};
  },[socket]);
  const dispatch=()=>{
    const o=origin||IID_LIST[Math.floor(Math.random()*IID_LIST.length)];
    const d=dest||(IID_LIST.filter(i=>i!==o))[Math.floor(Math.random()*(IID_LIST.length-1))];
    emit('emergency:dispatch',{vehicleType:vtype,origin:o,destination:d});
    setStatus('Dispatching…');
  };
  return (
    <div className="space-y-3">
      <Section title="Dispatch Emergency">
        <div className="grid grid-cols-3 gap-1.5">
          {ETYPES.map(t=>(
            <button key={t} onClick={()=>setVtype(t)}
              className={cn('py-2 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-colors',
                vtype===t?'bg-red-700 text-white border border-red-600':'bg-slate-700 text-slate-300 hover:bg-slate-600')}>
              <span className="text-lg">{VEHICLE_EMOJI[t]}</span>
              <span>{t.replace('_',' ')}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">From</label>
            <select className="select text-xs" value={origin} onChange={e=>setOrigin(e.target.value)}>
              <option value="">Random</option>
              {IID_LIST.map(id=><option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">To</label>
            <select className="select text-xs" value={dest} onChange={e=>setDest(e.target.value)}>
              <option value="">Random</option>
              {IID_LIST.filter(id=>id!==origin).map(id=><option key={id} value={id}>{id}</option>)}
            </select>
          </div>
        </div>
        {status && <div className={cn('text-xs p-2 rounded',status.startsWith('✅')?'bg-green-900/40 text-green-400':status.startsWith('❌')?'bg-red-900/40 text-red-400':'bg-slate-800 text-slate-300')}>{status}</div>}
        <button onClick={dispatch} className="btn-danger w-full text-xs py-2 font-semibold">
          {VEHICLE_EMOJI[vtype]} Dispatch Emergency Vehicle
        </button>
      </Section>
      <Section title={`Active Emergency (${vehicles.filter(v=>v.isEmergency).length})`}>
        {vehicles.filter(v=>v.isEmergency).length===0
          ? <p className="text-slate-500 text-xs text-center py-3">None active</p>
          : vehicles.filter(v=>v.isEmergency).map(v=>(
            <div key={v.vehicleId} className="flex items-center gap-2 p-2 bg-slate-900 rounded border border-red-900/40">
              <span className="text-lg">{VEHICLE_EMOJI[v.vehicleType]||'🚨'}</span>
              <div>
                <div className="text-xs font-mono text-slate-200">{v.vehicleId}</div>
                <div className="text-xs text-slate-500">{v.origin}→{v.destination}</div>
              </div>
            </div>
          ))
        }
      </Section>
    </div>
  );
}

// ── Accidents Tab ─────────────────────────────────────────────
function AccidentsTab({ emit, accidents }: { emit:(ev:string,d?:unknown)=>void; accidents:AccidentData[] }) {
  const [iid,setIid]=useState('I01'); const [sev,setSev]=useState('MEDIUM');
  const [lanes,setLanes]=useState(1); const [dur,setDur]=useState(10);
  const SEV=['LOW','MEDIUM','HIGH','CRITICAL'];
  const SEV_C:Record<string,string>={LOW:'text-blue-400',MEDIUM:'text-yellow-400',HIGH:'text-orange-400',CRITICAL:'text-red-400'};
  return (
    <div className="space-y-3">
      <Section title="Create Accident">
        <select className="select text-xs" value={iid} onChange={e=>setIid(e.target.value)}>
          {IID_LIST.map(id=><option key={id} value={id}>{id}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-1.5">
          {SEV.map(s=>(
            <button key={s} onClick={()=>setSev(s)}
              className={cn('text-xs py-1.5 rounded font-semibold transition-colors',
                sev===s?'bg-red-800 text-white':'bg-slate-700 text-slate-400 hover:bg-slate-600')}>
              {s}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Lanes blocked</label>
            <input type="number" className="input text-xs" min={1} max={4} value={lanes} onChange={e=>setLanes(+e.target.value)}/>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Duration (min)</label>
            <input type="number" className="input text-xs" min={1} max={60} value={dur} onChange={e=>setDur(+e.target.value)}/>
          </div>
        </div>
        <button onClick={()=>emit('accident:create',{intersectionId:iid,severity:sev,blockedLanes:lanes,durationMinutes:dur})}
          className="btn-danger w-full text-xs">💥 Create Accident at {iid}</button>
      </Section>
      <Section title={`Active Accidents (${accidents.length})`}>
        {accidents.length===0
          ? <p className="text-slate-500 text-xs text-center py-3">No active accidents ✅</p>
          : accidents.map(acc=>(
            <div key={acc.accidentId} className="p-2.5 bg-slate-900 rounded-lg border border-red-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-200">{acc.accidentId}</span>
                <span className={cn('text-xs font-bold',SEV_C[acc.severity]||'text-slate-400')}>{acc.severity}</span>
              </div>
              <div className="text-xs text-slate-500">{acc.intersectionId} · {acc.blockedLanes} lane(s)</div>
              <button onClick={()=>emit('accident:resolve',acc.accidentId)}
                className="w-full text-xs text-green-400 py-1 rounded bg-green-900/30 hover:bg-green-900/50 transition-colors">
                ✅ Resolve
              </button>
            </div>
          ))
        }
      </Section>
    </div>
  );
}

// ── Nodes Tab ─────────────────────────────────────────────────
function NodesTab({ emit, nodeStatuses }: { emit:(ev:string,d?:unknown)=>void; nodeStatuses:Record<string,NodeData> }) {
  const [selNode,setSelNode]=useState('node_a');
  const [delay,setDelay]=useState(0);
  const [wal,setWal]=useState<Record<string,unknown>[]>([]);
  const [txns,setTxns]=useState<Record<string,unknown>[]>([]);
  const [tab,setTab]=useState<'status'|'wal'|'txns'>('status');

  useEffect(()=>{
    const load=async()=>{
      try{
        const [w,t]=await Promise.all([fetchWAL(selNode),fetchTransactions()]);
        setWal(w.walEntries||[]);
        setTxns(t.transactions||[]);
      }catch{}
    };
    load();
    const i=setInterval(load,5000);
    return ()=>clearInterval(i);
  },[selNode]);

  return (
    <div className="space-y-3">
      <Section title="Node Control">
        <select className="select text-xs" value={selNode} onChange={e=>setSelNode(e.target.value)}>
          {NODE_LIST.map(n=><option key={n} value={n}>{n} — {DISTRICTS[n]}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={()=>emit('node:crash',selNode)} className="btn-danger text-xs">💀 Crash</button>
          <button onClick={()=>emit('node:recover',selNode)} className="btn-success text-xs">🔄 Recover</button>
        </div>
        <div className="flex gap-2">
          <input type="number" className="input text-xs" min={0} max={5000} step={100} value={delay} onChange={e=>setDelay(+e.target.value)} placeholder="Delay ms"/>
          <button onClick={()=>emit('node:setDelay',{nodeId:selNode,delayMs:delay})} className="btn-ghost text-xs px-2">Set</button>
          <button onClick={()=>{setDelay(0);emit('node:setDelay',{nodeId:selNode,delayMs:0});}} className="btn-ghost text-xs px-2">Clear</button>
        </div>
      </Section>

      <Section title="2PC Demo">
        <button onClick={()=>emit('2pc:run',{type:'SIGNAL_SYNC',participantIds:NODE_LIST.slice(0,3)})} className="btn-primary w-full text-xs">🔀 Run 2PC Signal Sync</button>
      </Section>

      <div className="flex gap-1 bg-slate-900 rounded p-0.5">
        {(['status','wal','txns'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={cn('flex-1 text-xs py-1 rounded transition-colors',tab===t?'bg-indigo-600 text-white':'text-slate-400 hover:text-slate-200')}>
            {t==='status'?'Status':t==='wal'?'WAL':'2PC'}
          </button>
        ))}
      </div>

      {tab==='status' && (
        <div className="space-y-1.5">
          {NODE_LIST.map(nid=>{
            const nd=nodeStatuses[nid]; const st=nd?.status||'online';
            const col=NODE_STATUS_COLOUR[st]||'text-slate-400';
            return (
              <div key={nid} className="flex items-center justify-between p-2 bg-slate-900 rounded text-xs">
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full',NODE_STATUS_DOT[st]||'bg-slate-400')}/>
                  <span className="text-slate-300">{nid}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{DISTRICTS[nid].split(' ')[0]}</span>
                  <span className={cn('font-medium capitalize',col)}>{st}</span>
                  {nd && <span className="text-slate-500">{(nd.congestionAvg*100).toFixed(0)}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==='wal' && (
        <div className="bg-slate-900 rounded overflow-auto max-h-52 text-xs">
          {wal.length===0?<p className="text-slate-500 p-3 text-center">No WAL entries</p>:wal.slice(0,20).map((r,i)=>(
            <div key={i} className="flex gap-2 px-2 py-1.5 border-b border-slate-800">
              <span className="text-indigo-400 font-mono w-8">{String(r['lsn'])}</span>
              <span className={cn('w-14',r['operation']==='COMMIT'?'text-green-400':r['operation']==='ABORT'?'text-red-400':'text-slate-300')}>{String(r['operation'])}</span>
              <span className="text-slate-400 truncate">{String(r['table_name'])}</span>
            </div>
          ))}
        </div>
      )}

      {tab==='txns' && (
        <div className="bg-slate-900 rounded overflow-auto max-h-52 text-xs">
          {txns.length===0?<p className="text-slate-500 p-3 text-center">No transactions</p>:txns.slice(0,15).map((tx,i)=>(
            <div key={i} className="flex gap-2 px-2 py-1.5 border-b border-slate-800">
              <span className="text-indigo-400 font-mono">{String(tx['txnId']).slice(0,8)}</span>
              <span className={cn('font-medium',tx['phase']==='COMMITTED'?'text-green-400':tx['phase']==='ABORTED'?'text-red-400':'text-yellow-400')}>{String(tx['phase'])}</span>
              <span className="text-slate-500">{String(tx['txnType'])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────
function AnalyticsTab({ analytics, tick }: { analytics:Analytics; tick:number }) {
  const histRef = useRef<{tick:number;vehicles:number;congestion:number;wait:number}[]>([]);
  const [hist,setHist]=useState<typeof histRef.current>([]);
  const [aiData,setAiData]=useState<{ruleCounts:{_id:string;count:number}[]}>({ruleCounts:[]});

  useEffect(()=>{
    if(tick%2!==0)return;
    histRef.current=[...histRef.current.slice(-80),{tick,vehicles:analytics.totalVehicles,congestion:+analytics.congestionPct.toFixed(1),wait:+analytics.avgWaitTime.toFixed(1)}];
    setHist([...histRef.current]);
  },[tick,analytics]);

  useEffect(()=>{
    const load=async()=>{try{const d=await fetchAIDecisions();setAiData({ruleCounts:d.ruleCounts||[]});}catch{}};
    load(); const t=setInterval(load,10000); return ()=>clearInterval(t);
  },[]);

  const {grid,axis,tooltip}=CHART_THEME;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[{l:'AI Decisions',v:aiData.ruleCounts.reduce((a,b)=>a+b.count,0),c:'text-purple-400'},
          {l:'Spawned',v:analytics.totalSpawned,c:'text-green-400'},
          {l:'Despawned',v:analytics.totalDespawned,c:'text-slate-400'},
          {l:'Active',v:analytics.totalVehicles,c:'text-blue-400'}].map(k=>(
          <div key={k.l} className="bg-slate-900 rounded-lg p-2">
            <div className="text-xs text-slate-500">{k.l}</div>
            <div className={cn('text-lg font-bold',k.c)}>{k.v.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
        <p className="text-xs text-slate-400 mb-2">Vehicles & Congestion</p>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={hist} margin={{top:5,right:5,bottom:0,left:-20}}>
            <CartesianGrid {...grid}/><XAxis dataKey="tick" tick={axis}/><YAxis yAxisId="v" tick={axis}/>
            <YAxis yAxisId="c" orientation="right" tick={axis} domain={[0,100]}/>
            <Tooltip {...tooltip}/>
            <Line yAxisId="v" type="monotone" dataKey="vehicles" stroke="#4FC3F7" dot={false} strokeWidth={2} name="Vehicles"/>
            <Line yAxisId="c" type="monotone" dataKey="congestion" stroke="#FF7043" dot={false} strokeWidth={2} name="Cong%"/>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
        <p className="text-xs text-slate-400 mb-2">AI Rule Activations</p>
        {aiData.ruleCounts.length===0?<p className="text-slate-500 text-xs text-center py-3">No data yet</p>:
          <div className="space-y-1.5">
            {aiData.ruleCounts.slice(0,6).map(r=>(
              <div key={r._id} className="flex items-center gap-2">
                <div className="text-xs text-slate-400 w-28 truncate">{r._id.replace(/_/g,' ')}</div>
                <div className="flex-1 bg-slate-900 rounded-full h-1.5">
                  <div className="bg-purple-500 h-1.5 rounded-full" style={{width:`${Math.min(100,(r.count/(aiData.ruleCounts[0]?.count||1))*100)}%`}}/>
                </div>
                <div className="text-xs text-slate-300 w-5 text-right">{r.count}</div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

// ── Logs Tab ──────────────────────────────────────────────────
function LogsTab({ logs }: { logs:LogEntry[] }) {
  const clearLogs = useSimStore(s=>s.clearLogs);
  const [filter,setFilter]=useState('ALL');
  const LEVELS=['ALL','INFO','WARNING','ERROR','EMERGENCY','SUCCESS','2PC'];
  const filtered=logs.filter(e=>filter==='ALL'||e.level===filter);
  const LCOLOUR:Record<string,string>={DEBUG:'text-slate-500',INFO:'text-blue-400',WARNING:'text-yellow-400',
    ERROR:'text-red-400',EMERGENCY:'text-orange-400 font-bold',SUCCESS:'text-green-400','2PC':'text-purple-400',RECOVERY:'text-amber-400'};
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{logEndRef.current?.scrollIntoView({behavior:'smooth'});},[logs]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {LEVELS.map(l=>(
          <button key={l} onClick={()=>setFilter(l)}
            className={cn('px-2 py-0.5 rounded text-xs transition-colors',filter===l?'bg-indigo-600 text-white':'bg-slate-700 text-slate-400 hover:text-slate-200')}>
            {l}
          </button>
        ))}
        <button onClick={clearLogs} className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400 hover:text-red-400 transition-colors ml-auto">Clear</button>
      </div>
      <div className="bg-slate-900 rounded-lg overflow-y-auto max-h-[calc(100vh-260px)]" style={{fontFamily:'Consolas,monospace'}}>
        {filtered.length===0?<p className="text-slate-500 text-xs text-center py-8">No log entries</p>:
          filtered.map(e=>(
            <div key={e.id} className="flex gap-2 px-2 py-1 border-b border-slate-800/50 hover:bg-slate-800/30 text-xs">
              <span className="text-slate-600 flex-shrink-0 w-20">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span className={cn('flex-shrink-0 w-16 uppercase',LCOLOUR[e.level]||'text-slate-400')}>{e.level}</span>
              <span className="text-slate-500 flex-shrink-0">[{e.source}]</span>
              <span className="text-slate-300 break-all">{e.message}</span>
            </div>
          ))
        }
        <div ref={logEndRef}/>
      </div>
    </div>
  );
}

