'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth';
import RoleToggle from '@/components/RoleToggle';
import UserProfile from '@/components/UserProfile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, User } from 'lucide-react';

export default function InterviewerUpcomingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!authService.isAuthenticated() || !authService.hasRole('Interviewer')) {
      router.push('/');
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const res = await authService.fetchWithAuth('/dashboard/interviewer/upcoming');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load upcoming interviews');
        setItems(data.upcoming || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header to match Interviewer main page */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">AITF</h1>
            <div className="flex items-center space-x-1 sm:space-x-4">
              <Link href="/interviewer" className="hidden sm:block">
                <Button size="sm" variant="outline">Back to Jobs</Button>
              </Link>
              <Link href="/interviewer" className="sm:hidden">
                <Button size="sm" variant="outline" className="px-2">
                  <span className="text-xs">Back to Jobs</span>
                </Button>
              </Link>
              <RoleToggle currentRole="Interviewer" userRoles={authService.getUser()?.roles} />
              <UserProfile userName={authService.getUser()?.name} />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Upcoming Interviews</h1>
              <p className="text-gray-600">Your next scheduled interviews</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-gray-600">Loading...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-gray-600">No upcoming interviews scheduled.</div>
        ) : (
          <div>
            {(() => {
              const total = items.length;
              const totalPages = Math.max(1, Math.ceil(total / pageSize));
              const startIndex = (page - 1) * pageSize;
              const pageItems = items.slice(startIndex, startIndex + pageSize);
              const list = pageItems.map((it, idx) => {
                const when = new Date(it.scheduled_time);
                const dateStr = when.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const timeStr = when.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                return (
                  <Card key={startIndex + idx}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{it.job_name} — {it.round_name}</span>
                        <a href={it.meet_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm underline">Join Meet</a>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-700">
                        <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {dateStr}</div>
                        <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> {timeStr} ({it.duration_minutes || 60} min)</div>
                        {/* <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" /> 
                          Duration: {it.duration_minutes || 60} min
                        </div> */}
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <User className="w-4 h-4" /> 
                          {it.candidate_resume_url ? (
                            <a 
                              href={it.candidate_resume_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline font-medium"
                            >
                              {it.candidate_name}
                            </a>
                          ) : (
                            <span className="font-medium">{it.candidate_name}</span>
                          )}
                          <span className="text-gray-500">({it.candidate_email})</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              });
              return (
                <>
                  <div className="space-y-4">{list}</div>
                  <div className="mt-6 flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-600">
                      Showing {Math.min(total, startIndex + 1)}–{Math.min(total, startIndex + pageItems.length)} of {total}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={pageSize}
                        onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value, 10)); }}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value={5}>5 / page</option>
                        <option value={10}>10 / page</option>
                        <option value={20}>20 / page</option>
                        <option value={50}>50 / page</option>
                      </select>
                      <button
                        className="px-3 py-1 border rounded disabled:opacity-50"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >Prev</button>
                      <span className="text-sm">Page {page} / {totalPages}</span>
                      <button
                        className="px-3 py-1 border rounded disabled:opacity-50"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >Next</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
