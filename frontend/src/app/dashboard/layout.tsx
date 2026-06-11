'use client';
// New layout: city map always visible full-width, sliding panel on right
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useSimStore } from '@/store/simStore';
import { useSocketInit } from '@/hooks/useSocket';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useSocketInit();
  const router = useRouter();
  const token  = useAuthStore(s => s.token);

  useEffect(() => {
    if (!token) router.replace('/auth/login');
  }, [token, router]);

  if (!token) return null;

  // The layout is just a full-screen container.
  // The actual map + sliding panel are in page.tsx (the overview page).
  // Sub-pages (nodes, analytics, etc.) are rendered in the sliding panel.
  return <>{children}</>;
}
