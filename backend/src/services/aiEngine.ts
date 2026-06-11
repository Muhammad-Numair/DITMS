// backend/src/services/aiEngine.ts
import { SIM_CONFIG } from '../config/cityConfig';

interface AICtx {
  intersectionId:string; nodeId:string; queueLength:number; congestionLevel:number;
  avgWaitTime:number; emergencyPresent:boolean; accidentPresent:boolean;
  neighborCongestions:Record<string,number>; timeOfDay:number;
  rushHour:boolean; rainMode:boolean; currentGreenTime:number; currentRedTime:number;
}
interface AIAction { action:string; params:Record<string,number>; reason:string; rule:string; }
type Rule = { name:string; priority:number; cond:(c:AICtx)=>boolean; act:(c:AICtx)=>AIAction; };

export class AIDecisionEngine {
  private rules: Rule[];
  private count = 0;
  constructor() {
    this.rules = [
      { name:'EMERGENCY_GREEN', priority:0, cond:c=>c.emergencyPresent,
        act:()=>({action:'FORCE_GREEN',params:{},reason:'Emergency vehicle',rule:'EMERGENCY_GREEN'})},
      { name:'ACCIDENT_RED', priority:1, cond:c=>c.accidentPresent,
        act:()=>({action:'FORCE_RED',params:{},reason:'Active accident',rule:'ACCIDENT_RED'})},
      { name:'CRITICAL_CONG', priority:2, cond:c=>c.congestionLevel>=0.85&&!c.emergencyPresent&&!c.accidentPresent,
        act:c=>({action:'EXTEND_GREEN',params:{extra_seconds:20},reason:`Critical ${(c.congestionLevel*100).toFixed(0)}%`,rule:'CRITICAL_CONG'})},
      { name:'RUSH_EXTEND', priority:3, cond:c=>c.rushHour&&c.queueLength>SIM_CONFIG.QUEUE_THRESHOLD,
        act:c=>({action:'EXTEND_GREEN',params:{extra_seconds:Math.min(20,(c.queueLength-SIM_CONFIG.QUEUE_THRESHOLD)*2)},reason:'Rush hour queue',rule:'RUSH_EXTEND'})},
      { name:'HIGH_QUEUE', priority:4, cond:c=>c.queueLength>SIM_CONFIG.QUEUE_THRESHOLD&&!c.emergencyPresent&&!c.accidentPresent,
        act:c=>({action:'EXTEND_GREEN',params:{extra_seconds:Math.min(15,(c.queueLength-SIM_CONFIG.QUEUE_THRESHOLD)*1.5)},reason:`Queue ${c.queueLength}`,rule:'HIGH_QUEUE'})},
      { name:'NEIGHBOR_CONG', priority:5, cond:c=>Object.values(c.neighborCongestions).some((v:number)=>v>=0.7)&&c.congestionLevel<0.5,
        act:()=>({action:'REDUCE_RED',params:{reduce_seconds:8},reason:'Neighbor congested',rule:'NEIGHBOR_CONG'})},
      { name:'LONG_WAIT', priority:6, cond:c=>c.avgWaitTime>45,
        act:()=>({action:'REDUCE_RED',params:{reduce_seconds:10},reason:'Long wait',rule:'LONG_WAIT'})},
      { name:'RAIN_MODE', priority:7, cond:c=>c.rainMode&&c.queueLength>3,
        act:()=>({action:'EXTEND_GREEN',params:{extra_seconds:5},reason:'Rain mode',rule:'RAIN_MODE'})},
      { name:'RESTORE_AI', priority:9, cond:c=>c.congestionLevel<0.1&&c.queueLength===0&&c.currentGreenTime!==SIM_CONFIG.DEFAULT_GREEN_TIME,
        act:()=>({action:'RESTORE_AI',params:{},reason:'Intersection clear',rule:'RESTORE_AI'})},
    ].sort((a,b)=>a.priority-b.priority);
  }
  decide(ctx:AICtx): AIAction|null {
    for (const r of this.rules) { try { if (r.cond(ctx)) { this.count++; return r.act(ctx); } } catch {} }
    return null;
  }
  getCount() { return this.count; }
  getRuleNames() { return this.rules.map(r=>r.name); }
}

// ── Neo4j Routing ────────────────────────────────────────────────────────────
import { runCypher } from '../config/database';
import { INTERSECTIONS, ROADS } from '../config/cityConfig';

export class Neo4jRoutingService {
  async shortestPath(from:string, to:string): Promise<string[]|null> {
    try {
      const r = await runCypher(
        `MATCH(s:Intersection{id:$from}),(e:Intersection{id:$to})
         MATCH path=shortestPath((s)-[r:ROAD*..20]->(e))
         WHERE ALL(rel IN relationships(path) WHERE rel.blocked=false)
         RETURN [n IN nodes(path)|n.id] AS ids,
                REDUCE(w=0.0,rel IN relationships(path)|w+rel.weight) AS tw
         ORDER BY tw LIMIT 1`,
        { from, to }
      );
      return r[0] ? (r[0]['ids'] as string[]) : this.bfs(from,to);
    } catch { return this.bfs(from,to); }
  }
  async emergencyRoute(from:string, to:string): Promise<string[]|null> {
    try {
      const r = await runCypher(
        `MATCH(s:Intersection{id:$from}),(e:Intersection{id:$to})
         MATCH path=shortestPath((s)-[r:ROAD*..20]->(e))
         WHERE ALL(rel IN relationships(path) WHERE rel.blocked=false)
         RETURN [n IN nodes(path)|n.id] AS ids,
                REDUCE(d=0.0,rel IN relationships(path)|d+rel.distance) AS td
         ORDER BY td LIMIT 1`,
        { from, to }
      );
      return r[0] ? (r[0]['ids'] as string[]) : this.bfs(from,to);
    } catch { return this.bfs(from,to); }
  }
  async congestionAwareRoute(from:string, to:string): Promise<string[]|null> {
    try {
      const r = await runCypher(
        `MATCH(s:Intersection{id:$from}),(e:Intersection{id:$to})
         MATCH path=shortestPath((s)-[r:ROAD*..20]->(e))
         WHERE ALL(rel IN relationships(path) WHERE rel.blocked=false)
         WITH path,REDUCE(w=0.0,rel IN relationships(path)|w+rel.weight*(1+2.0*rel.congestion)) AS wc
         RETURN [n IN nodes(path)|n.id] AS ids,wc ORDER BY wc LIMIT 1`,
        { from, to }
      );
      return r[0] ? (r[0]['ids'] as string[]) : this.bfs(from,to);
    } catch { return this.bfs(from,to); }
  }
  bfs(start:string,end:string): string[]|null {
    const adj:Record<string,string[]>={};
    for (const i of INTERSECTIONS) adj[i.id]=[];
    for (const r of ROADS) { adj[r.fromId]?.push(r.toId); if(r.bidirectional) adj[r.toId]?.push(r.fromId); }
    const vis=new Set([start]);
    const q:Array<{id:string;path:string[]}>=[{id:start,path:[start]}];
    while(q.length){ const{id,path}=q.shift()!; if(id===end)return path; for(const n of adj[id]||[]){if(!vis.has(n)){vis.add(n);q.push({id:n,path:[...path,n]});}}}
    return null;
  }
}

// ── Distributed Coordinator (2PC) ────────────────────────────────────────────
import { v4 as uuid } from 'uuid';
import { NodeComm, DistributedTxn, FailureLog } from '../models';
import { logger } from '../utils/logger';

interface NodeState { status:'online'|'offline'|'recovering'; commDelayMs:number; congestionAvg:number; vehicleCount:number; pendingTxns:number; aiActive:boolean; }

export class DistributedCoordinator {
  private nodes:Map<string,NodeState>=new Map();

  constructor() {
    for (const nid of ['node_a','node_b','node_c','node_d','node_e']) {
      this.nodes.set(nid,{status:'online',commDelayMs:0,congestionAvg:0,vehicleCount:0,pendingTxns:0,aiActive:true});
    }
  }

  async runTransaction(txnType:string, participantIds:string[], payload:Record<string,unknown>): Promise<{committed:boolean;txnId:string;reason?:string}> {
    const online=participantIds.filter(p=>this.nodes.get(p)?.status==='online');
    if(!online.length) return {committed:false,txnId:'',reason:'no_online_participants'};
    const txnId=uuid();
    await DistributedTxn.create({txnId,txnType,coordinatorId:'coordinator',participantIds:online,phase:'PREPARING',payload});
    logger.info(`2PC START txn=${txnId.substring(0,8)} type=${txnType}`);

    // Phase 1: PREPARE
    const votes:Record<string,string>={};
    await Promise.all(online.map(async pid=>{
      const node=this.nodes.get(pid);
      if(node?.commDelayMs) await new Promise(r=>setTimeout(r,node.commDelayMs));
      votes[pid]=node?.status==='online'?'YES':'NO';
      await NodeComm.create({fromNode:'coordinator',toNode:pid,messageType:'PREPARE',txnId,payload}).catch(()=>{});
    }));

    const allYes=Object.values(votes).every(v=>v==='YES');
    if(allYes){
      await DistributedTxn.updateOne({txnId},{phase:'COMMITTED',committedAt:new Date()});
      await NodeComm.create({fromNode:'coordinator',toNode:'all',messageType:'COMMIT',txnId}).catch(()=>{});
      logger.info(`2PC COMMITTED txn=${txnId.substring(0,8)}`);
      return {committed:true,txnId};
    } else {
      const nv=Object.entries(votes).filter(([,v])=>v==='NO').map(([k])=>k);
      await DistributedTxn.updateOne({txnId},{phase:'ABORTED',abortedAt:new Date(),abortReason:`NO from:${nv}`});
      logger.warn(`2PC ABORTED txn=${txnId.substring(0,8)} reason=NO from ${nv}`);
      return {committed:false,txnId,reason:`NO votes from: ${nv}`};
    }
  }

  crashNode(nodeId:string){
    const n=this.nodes.get(nodeId);
    if(n){n.status='offline'; logger.warn(`Node ${nodeId} CRASHED`);}
    FailureLog.create({nodeId,eventType:'CRASH',details:{}}).catch(()=>{});
  }
  recoverNode(nodeId:string){
    const n=this.nodes.get(nodeId);
    if(n){n.status='online'; logger.info(`Node ${nodeId} RECOVERED`);}
    FailureLog.create({nodeId,eventType:'RECOVERY_COMPLETE',details:{}}).catch(()=>{});
  }
  setCommDelay(nodeId:string,delayMs:number){ const n=this.nodes.get(nodeId); if(n) n.commDelayMs=delayMs; }
  updateNodeMetrics(nodeId:string,congestionAvg:number,vehicleCount:number){
    const n=this.nodes.get(nodeId); if(n){n.congestionAvg=congestionAvg;n.vehicleCount=vehicleCount;}
  }
  getNodeStatuses():Record<string,Record<string,unknown>>{
    const out:Record<string,Record<string,unknown>>={};
    for(const[nid,n]of this.nodes){
      out[nid]={nodeId:nid,status:n.status,commDelayMs:n.commDelayMs,
        congestionAvg:n.congestionAvg,vehicleCount:n.vehicleCount,
        pendingTxns:n.pendingTxns,aiActive:n.aiActive,
        lastHeartbeat:new Date().toISOString()};
    }
    return out;
  }
  getInFlight(){ return []; }
}
