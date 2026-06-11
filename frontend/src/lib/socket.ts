// frontend/src/lib/socket.ts
import { io, Socket } from 'socket.io-client';
let _socket: Socket | null = null;
export function createSocket(): Socket {
  if (_socket?.connected) return _socket;
  _socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  });
  return _socket;
}
export const getSocket = () => _socket;

// frontend/src/lib/api.ts
import axios from 'axios';
export const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api`,
  timeout: 10000,
});
api.interceptors.request.use(cfg => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('ditms-auth') : null;
    if (raw) { const { state } = JSON.parse(raw); if (state?.token) cfg.headers['Authorization'] = `Bearer ${state.token}`; }
  } catch {}
  return cfg;
});
export const apiLogin = async (username: string, password: string) => {
  const { data } = await api.post('/auth/login', { username, password });
  return data as { token: string; user: { userId: number; username: string; role: string } };
};
export const fetchAccidents    = async () => (await api.get('/analytics/accidents')).data;
export const fetchAIDecisions  = async () => (await api.get('/analytics/ai-decisions')).data;
export const fetchTransactions = async () => (await api.get('/analytics/transactions')).data;
export const fetchNodeComms    = async (nodeId?: string) => (await api.get(`/analytics/node-comms${nodeId ? `?nodeId=${nodeId}` : ''}`)).data;
export const fetchFailures     = async () => (await api.get('/analytics/failures')).data;
export const fetchPGNodes      = async () => (await api.get('/nodes/pg-status')).data;
export const fetchWAL          = async (nodeId: string) => (await api.get(`/nodes/wal/${nodeId}`)).data;
export const fetchLocks        = async () => (await api.get('/nodes/locks')).data;
export const fetchTransactionList = async () => (await api.get('/analytics/transactions')).data;
export const fetchAuditLog     = async () => (await api.get('/audit')).data;
