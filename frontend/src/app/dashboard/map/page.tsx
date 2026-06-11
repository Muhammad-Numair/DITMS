'use client';
// Redirect to main dashboard — map is now always visible there
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function MapPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
