// backend/src/models/index.ts
import mongoose, { Schema, Document } from 'mongoose';

// Traffic Event
const TrafficEventSchema = new Schema({
  nodeId:{ type:String,index:true }, intersectionId:{ type:String,index:true },
  eventType:{ type:String,index:true }, data:{ type:Schema.Types.Mixed },
  timestamp:{ type:Date,default:Date.now,expires:'7d' }
});
export const TrafficEvent = mongoose.model('TrafficEvent', TrafficEventSchema);

// Accident
const AccidentSchema = new Schema({
  accidentId:{ type:String,unique:true,index:true }, intersectionId:{ type:String,index:true },
  nodeId:String, severity:String, blockedLanes:{ type:Number,default:1 },
  durationMinutes:{ type:Number,default:10 }, status:{ type:String,default:'ACTIVE',index:true },
  createdAt:{ type:Date,default:Date.now }, resolvedAt:Date,
});
export const Accident = mongoose.model('Accident', AccidentSchema);

// AI Decision
const AIDecisionSchema = new Schema({
  intersectionId:{ type:String,index:true }, nodeId:{ type:String,index:true },
  ruleTriggered:{ type:String,index:true }, inputs:Schema.Types.Mixed,
  action:String, actionParams:Schema.Types.Mixed,
  decidedAt:{ type:Date,default:Date.now,expires:'3d' },
});
export const AIDecision = mongoose.model('AIDecision', AIDecisionSchema);

// Vehicle History
const VehicleHistorySchema = new Schema({
  vehicleId:{ type:String,index:true }, vehicleType:String,
  position:{ x:Number,y:Number }, state:String,
  timestamp:{ type:Date,default:Date.now,expires:'2h' },
});
export const VehicleHistory = mongoose.model('VehicleHistory', VehicleHistorySchema);

// Node Communication
const NodeCommSchema = new Schema({
  fromNode:String, toNode:String, messageType:String,
  txnId:{ type:String,index:true }, payload:{ type:Schema.Types.Mixed,default:{} },
  success:{ type:Boolean,default:true }, error:String,
  sentAt:{ type:Date,default:Date.now,expires:'24h' },
});
export const NodeComm = mongoose.model('NodeComm', NodeCommSchema);

// Failure Log
const FailureLogSchema = new Schema({
  nodeId:{ type:String,index:true }, eventType:{ type:String,index:true },
  details:{ type:Schema.Types.Mixed,default:{} }, occurredAt:{ type:Date,default:Date.now },
});
export const FailureLog = mongoose.model('FailureLog', FailureLogSchema);

// System Event
const SystemEventSchema = new Schema({
  category:{ type:String,index:true }, message:String,
  details:{ type:Schema.Types.Mixed,default:{} }, user:String,
  timestamp:{ type:Date,default:Date.now },
});
export const SystemEvent = mongoose.model('SystemEvent', SystemEventSchema);

// Emergency Event
const EmergencyEventSchema = new Schema({
  vehicleId:{ type:String,index:true }, vehicleType:String,
  origin:String, destination:String, route:[String],
  status:{ type:String,default:'ACTIVE',index:true },
  startedAt:{ type:Date,default:Date.now }, completedAt:Date, responseTimeS:Number,
});
export const EmergencyEvent = mongoose.model('EmergencyEvent', EmergencyEventSchema);

// Distributed Transaction
const DistributedTxnSchema = new Schema({
  txnId:{ type:String,unique:true,index:true }, txnType:String,
  coordinatorId:String, participantIds:[String],
  phase:{ type:String,default:'PREPARING',index:true }, payload:Schema.Types.Mixed,
  startedAt:{ type:Date,default:Date.now }, committedAt:Date, abortedAt:Date, abortReason:String,
});
export const DistributedTxn = mongoose.model('DistributedTxn', DistributedTxnSchema);
