// frontend/src/hooks/useSocket.ts
'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSimStore } from '@/store/simStore';
import { createSocket } from '@/lib/socket';

export function useSocketInit() {
  const token     = useAuthStore(s => s.token);
  const initSocket = useSimStore(s => s.initSocket);

  useEffect(() => {
    if (!token) return;
    const socket = createSocket();
    initSocket(socket);
    return () => { socket.disconnect(); };
  }, [token, initSocket]);
}
