'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('ditms-auth') : null;
    let hasToken = false;
    try { if (raw) hasToken = !!JSON.parse(raw)?.state?.token; } catch {}
    router.replace(hasToken ? '/dashboard' : '/auth/login');
  }, [router]);
  return (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <div className="text-slate-500 text-sm animate-pulse">Loading...</div>
    </div>
  );
}
