'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import TestimonyBoard from '../components/testimonies/TestimonyBoard';

function FriendProfile() {
  const params = useSearchParams();
  const userId = params.get('user');
  if (!userId || !/^[a-f\d]{24}$/i.test(userId)) return <div className="mx-auto max-w-2xl px-5 py-16 text-center text-slate-300"><h1 className="mb-3 text-xl font-semibold text-white">Profile unavailable</h1><Link href="/friends" className="text-sky-300">Back to friends</Link></div>;
  return <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6"><TestimonyBoard profileUserId={userId} showProfileHeader /></div>;
}

export default function FriendProfilePage() {
  return <Suspense fallback={<div className="p-12 text-center text-slate-400" role="status">Loading profile…</div>}><FriendProfile /></Suspense>;
}
