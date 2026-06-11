'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { apiLogin } from '@/lib/socket';

export default function LoginPage() {
  const router  = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const doLogin = async () => {
    setLoading(true); setError('');
    try {
      const { token, user } = await apiLogin('admin', 'admin123');
      setAuth(token, user);
      router.replace('/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
      <div className="w-80 space-y-6 text-center">
        <div>
          <div className="text-6xl mb-4">🚦</div>
          <h1 className="text-4xl font-bold text-indigo-400">DITMS</h1>
          <p className="text-slate-400 text-sm mt-2">
            Distributed Intelligent Traffic Management System
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          <div className="bg-slate-900 rounded-lg p-3 text-sm text-slate-300 text-left border border-slate-700">
            <p className="text-xs text-slate-500 mb-1">Administrator Account</p>
            <p><span className="text-slate-400">Username:</span> <span className="text-indigo-400 font-mono">admin</span></p>
            <p><span className="text-slate-400">Password:</span> <span className="text-indigo-400 font-mono">admin123</span></p>
            <p><span className="text-slate-400">Access:</span> <span className="text-green-400">Full</span></p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button onClick={doLogin} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors text-lg">
            {loading ? '⏳ Connecting...' : '🚀 Enter Control Center'}
          </button>
        </div>

        <p className="text-slate-600 text-xs">
          University Final Project — Distributed Databases & Systems
        </p>
      </div>
    </div>
  );
}
