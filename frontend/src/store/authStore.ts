// frontend/src/store/authStore.ts — single admin user
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User { userId: number; username: string; role: string; }

// Single admin role — all permissions
const ALL_PERMS = [
  'can_crash_nodes','can_recover_nodes','can_manage_users',
  'can_override_signals','can_spawn_vehicles','can_spawn_emergency',
  'can_create_accidents','can_view_analytics','can_view_logs',
];

interface AuthStore {
  token: string | null;
  user:  User  | null;
  setAuth: (token: string, user: User) => void;
  logout:  () => void;
  can:     (perm: string) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null, user: null,
      setAuth: (token, user) => set({ token, user }),
      logout:  () => set({ token: null, user: null }),
      can: (_perm) => {
        // Admin has all permissions — always return true when logged in
        return get().token !== null;
      },
    }),
    { name: 'ditms-auth', partialize: s => ({ token: s.token, user: s.user }) }
  )
);
