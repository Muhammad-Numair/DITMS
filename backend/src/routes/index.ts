// backend/src/routes/index.ts
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pgPool } from '../config/database';
import { Accident, AIDecision, FailureLog, SystemEvent, DistributedTxn, NodeComm } from '../models';
import { DISTRICTS, INTERSECTIONS, ROADS, ROLE_PERMISSIONS } from '../config/cityConfig';

const router = Router();

export interface AuthRequest extends Request { user?: { userId: number; username: string; role: string }; }

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret') as AuthRequest['user'];
        next();
    } catch { res.status(401).json({ error: 'Invalid token' }); }
}
export function requirePerm(perm: string) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const role = req.user?.role || '';
        if (!(ROLE_PERMISSIONS[role] || []).includes(perm)) return res.status(403).json({ error: `Permission denied: ${perm}` });
        next();
    };
}

// Auth
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Required' });
        const result = await pgPool.query('SELECT * FROM public.users WHERE username=$1 AND is_active=TRUE', [username]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ userId: user.user_id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
        await pgPool.query('INSERT INTO public.audit_log(username,action,result) VALUES($1,$2,$3)', [username, 'LOGIN', 'SUCCESS']);
        res.json({ token, user: { userId: user.user_id, username: user.username, role: user.role } });
    } catch { res.status(500).json({ error: 'Login failed' }); }
});
router.get('/auth/me', authMiddleware, (req: AuthRequest, res) => res.json(req.user));

// City static data
router.get('/city/intersections', authMiddleware, (_req, res) => res.json(INTERSECTIONS));
router.get('/city/roads', authMiddleware, (_req, res) => res.json(ROADS));
router.get('/city/districts', authMiddleware, (_req, res) => res.json(Object.entries(DISTRICTS).map(([id, name]) => ({ id, name }))));

// Analytics
router.get('/analytics/accidents', authMiddleware, async (_req, res) => {
    try {
        const accidents = await Accident.find().sort({ createdAt: -1 }).limit(100);
        const stats = await Accident.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 }, avgDuration: { $avg: '$durationMinutes' } } }, { $sort: { count: -1 } }]);
        res.json({ accidents, stats });
    } catch { res.status(500).json({ error: 'Failed' }); }
});
router.get('/analytics/ai-decisions', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query['limit'] as string) || 50;
        const decisions = await AIDecision.find().sort({ decidedAt: -1 }).limit(limit);
        const ruleCounts = await AIDecision.aggregate([{ $group: { _id: '$ruleTriggered', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]);
        res.json({ decisions, ruleCounts });
    } catch { res.status(500).json({ error: 'Failed' }); }
});
router.get('/analytics/transactions', authMiddleware, async (_req, res) => {
    try {
        const transactions = await DistributedTxn.find().sort({ startedAt: -1 }).limit(50);
        const phaseCounts = await DistributedTxn.aggregate([{ $group: { _id: '$phase', count: { $sum: 1 } } }]);
        res.json({ transactions, phaseCounts });
    } catch { res.status(500).json({ error: 'Failed' }); }
});
router.get('/analytics/node-comms', authMiddleware, async (req, res) => {
    try {
        const nodeId = req.query['nodeId'] as string;
        const query = nodeId ? { $or: [{ fromNode: nodeId }, { toNode: nodeId }] } : {};
        const comms = await NodeComm.find(query).sort({ sentAt: -1 }).limit(100);
        res.json({ comms });
    } catch { res.status(500).json({ error: 'Failed' }); }
});
router.get('/analytics/failures', authMiddleware, async (_req, res) => {
    try { const failures = await FailureLog.find().sort({ occurredAt: -1 }).limit(100); res.json({ failures }); } catch { res.status(500).json({ error: 'Failed' }); }
});
router.get('/analytics/system-events', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query['limit'] as string) || 100;
        const events = await SystemEvent.find().sort({ timestamp: -1 }).limit(limit);
        res.json({ events });
    } catch { res.status(500).json({ error: 'Failed' }); }
});

// PG node data
router.get('/nodes/pg-status', authMiddleware, async (_req, res) => {
    try { const r = await pgPool.query('SELECT * FROM public.nodes ORDER BY node_id'); res.json({ nodes: r.rows }); } catch { res.status(500).json({ error: 'PG error' }); }
});
router.get('/nodes/locks', authMiddleware, async (_req, res) => {
    try { const r = await pgPool.query('SELECT * FROM public.distributed_locks ORDER BY acquired_at DESC'); res.json({ locks: r.rows }); } catch { res.status(500).json({ error: 'PG error' }); }
});
router.get('/nodes/wal/:nodeId', authMiddleware, async (req, res) => {
    const { nodeId } = req.params;
    if (!Object.keys(DISTRICTS).includes(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });
    try { const r = await pgPool.query('SELECT * FROM public.wal_log WHERE node_id=$1 ORDER BY lsn DESC LIMIT 50', [nodeId]); res.json({ walEntries: r.rows }); } catch { res.status(500).json({ error: 'PG error' }); }
});
router.get('/nodes/:nodeId/signals', authMiddleware, async (req, res) => {
    const { nodeId } = req.params;
    if (!Object.keys(DISTRICTS).includes(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });
    try { const r = await pgPool.query(`SELECT * FROM ${nodeId}.traffic_signals ORDER BY intersection_id`); res.json({ signals: r.rows }); } catch { res.status(500).json({ error: 'PG error' }); }
});

router.get('/audit', authMiddleware, requirePerm('can_view_logs'), async (req, res) => {
    try {
        const limit = parseInt(req.query['limit'] as string) || 100;
        const r = await pgPool.query('SELECT * FROM public.audit_log ORDER BY logged_at DESC LIMIT $1', [limit]);
        res.json({ entries: r.rows });
    } catch { res.status(500).json({ error: 'PG error' }); }
});

export default router;
