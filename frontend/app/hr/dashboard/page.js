'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth';
import HRHeader from '@/components/hr/HRHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Briefcase, CalendarDays } from 'lucide-react';

export default function HRDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('scheduled'); // Default to 'scheduled'
  const [showOffers, setShowOffers] = useState(false); // Toggle for offers view
  const [offersData, setOffersData] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [sortKey, setSortKey] = useState('scheduled_time');
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!authService.isAuthenticated() || !authService.hasRole('HR')) {
      router.push('/');
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const res = await authService.fetchWithAuth('/dashboard/hr/summary');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load dashboard');
        setSummary(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  useEffect(() => {
    const loadTable = async () => {
      try {
        setTableLoading(true);
        const statusParam = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
        const res = await authService.fetchWithAuth(`/dashboard/hr/interviews${statusParam}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load interviews mapping');
        setRows(data.rows || []);
      } catch (e) {
        console.error(e);
      } finally {
        setTableLoading(false);
      }
    };
    
    if (!showOffers) {
      loadTable();
    }
  }, [statusFilter, showOffers]); // Reload when status filter changes or offers toggle changes

  const loadOffers = async () => {
    try {
      setOffersLoading(true);
      const res = await authService.fetchWithAuth('/candidates/offers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load offers');
      setOffersData(data.offers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setOffersLoading(false);
    }
  };

  useEffect(() => {
    if (showOffers) {
      loadOffers();
    }
  }, [showOffers]);

  const filteredSortedPaged = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = showOffers ? offersData : rows;
    
    if (term) {
      if (showOffers) {
        // Filter offers data
        list = offersData.filter(r => 
          (r.candidate_name || '').toLowerCase().includes(term) ||
          (r.candidate_email || '').toLowerCase().includes(term) ||
          (r.job_name || '').toLowerCase().includes(term) ||
          (r.round_name || '').toLowerCase().includes(term)
        );
      } else {
        // Filter interviews data
        list = rows.filter(r => {
          const interviewerHit = Array.isArray(r.interviewers) && r.interviewers.some(iv =>
            (iv.name || '').toLowerCase().includes(term)
          );
          return interviewerHit ||
            (r.candidate_name || '').toLowerCase().includes(term) ||
            (r.candidate_email || '').toLowerCase().includes(term) ||
            (r.job_name || '').toLowerCase().includes(term) ||
            (r.round_name || '').toLowerCase().includes(term) ||
            (r.status || '').toLowerCase().includes(term);
        });
      }
    }
    
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      
      if (showOffers) {
        // Offers sorting - handle date fields specially
        if (sortKey === 'scheduled_time') return (new Date(av) - new Date(bv)) * dir;
        if (sortKey === 'years_experience') return (parseInt(av) || 0) - (parseInt(bv) || 0) * dir;
        return String(av || '').localeCompare(String(bv || '')) * dir;
      } else {
        // Interviews sorting
        if (sortKey === 'scheduled_time') return (new Date(av) - new Date(bv)) * dir;
        if (sortKey === 'interviewers') {
          const aNames = Array.isArray(a.interviewers) ? a.interviewers.map(iv => iv.name).join(', ') : '';
          const bNames = Array.isArray(b.interviewers) ? b.interviewers.map(iv => iv.name).join(', ') : '';
          return aNames.localeCompare(bNames) * dir;
        }
        return String(av || '').localeCompare(String(bv || '')) * dir;
      }
    });
    
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIndex = (page - 1) * pageSize;
    const pageRows = list.slice(startIndex, startIndex + pageSize);
    return { total, totalPages, startIndex, pageRows };
  }, [rows, offersData, showOffers, search, sortKey, sortDir, page, pageSize]);

  return (
    <div className="min-h-screen bg-gray-50">
      <HRHeader currentUser={authService.getUser()} actionLabel="Back to Management" actionHref="/hr" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">HR Dashboard</h1>
              <p className="text-gray-600">Overview of jobs, candidates, and scheduled interviews</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-gray-600">Loading...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="cursor-pointer" onClick={() => router.push('/hr?section=jobs')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
                  <Briefcase className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.jobs?.total ?? 0}</div>
                  <p className="text-xs text-gray-500">Active: {summary?.jobs?.active ?? 0} • Archived: {summary?.jobs?.archived ?? 0}</p>
                </CardContent>
              </Card>

              <Card className="cursor-pointer" onClick={() => router.push('/hr?section=candidates')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
                  <Users className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.candidates?.total ?? 0}</div>
                  <p className="text-xs text-gray-500">Active: {summary?.candidates?.active ?? 0} • Inactive: {summary?.candidates?.inactive ?? 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming Interviews (7d)</CardTitle>
                  <CalendarDays className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary?.interviews?.upcoming7d ?? 0}</div>
                  <p className="text-xs text-gray-500">Scheduled in the next 7 days</p>
                </CardContent>
              </Card>
            </div>

            {/* Interviews Mapping Table */}
            <div className="mt-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {showOffers ? 'Final Round Offers' : 'Interviews Mapping'}
                  </h2>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant={showOffers ? 'default' : 'outline'}
                    className="text-xs sm:text-sm whitespace-nowrap"
                    onClick={() => {
                      setShowOffers(!showOffers);
                      setPage(1);
                      // Reset sort to scheduled_time when switching views for consistency
                      setSortKey('scheduled_time');
                      setSortDir('desc');
                    }}
                  >
                    Offers
                  </Button>

                  <select
                    value={statusFilter}
                    onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
                    className={`border rounded px-3 py-2 text-sm w-1/3 sm:w-auto ${showOffers ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={showOffers}
                  >
                    <option value="all">All Status</option>
                    <option value="fresh">Fresh</option>
                    <option value="in_progress">In Progress</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>

                  <input
                    type="text"
                    value={search}
                    onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                    placeholder="Search Applications"
                    className="border rounded px-3 py-2 text-sm flex-1 min-w-0 sm:w-72"
                  />
                </div>
              </div>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {(showOffers ? [
                        { key: 'scheduled_time', label: 'Final Interview Date' },
                        { key: 'candidate_name', label: 'Candidate' },
                        { key: 'job_name', label: 'Job' },
                        { key: 'round_name', label: 'Final Round' },
                        { key: 'years_experience', label: 'Experience' },
                      ] : [
                        { key: 'scheduled_time', label: 'Scheduled Time' },
                        { key: 'candidate_name', label: 'Candidate' },
                        { key: 'interviewers', label: 'Interviewers' },
                        { key: 'job_name', label: 'Job' },
                        { key: 'round_name', label: 'Round' },
                        { key: 'status', label: 'Status' },
                      ]).map(col => (
                        <th key={col.key} className="text-left px-4 py-2 cursor-pointer select-none" onClick={() => {
                          if (sortKey === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                          else { setSortKey(col.key); setSortDir(col.key === 'scheduled_time' ? 'desc' : 'asc'); }
                        }}>
                          <div className="inline-flex items-center gap-1">
                            <span>{col.label}</span>
                            {sortKey === col.key && <span className="text-gray-400">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                          </div>
                        </th>
                      ))}

                    </tr>
                  </thead>
                  <tbody>
                    {(showOffers ? offersLoading : tableLoading) ? (
                      <tr><td className="px-4 py-6 text-gray-600" colSpan={showOffers ? 5 : 6}>Loading...</td></tr>
                    ) : filteredSortedPaged.pageRows.length === 0 ? (
                      <tr><td className="px-4 py-6 text-gray-600" colSpan={showOffers ? 5 : 6}>
                        {showOffers ? 'No offers found' : 'No interviews found'}
                      </td></tr>
                    ) : (
                      filteredSortedPaged.pageRows.map((r, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          {showOffers ? (
                            // Offers view
                            <>
                              <td className="px-4 py-2">
                                {r.scheduled_time ? new Date(r.scheduled_time).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-4 py-2">
                                {r.resume_url ? (
                                  <a
                                    href={r.resume_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 underline font-medium"
                                  >
                                    {r.candidate_name}
                                  </a>
                                ) : (
                                  <span className="font-medium">{r.candidate_name}</span>
                                )}
                                <span className="text-gray-500 ml-1">({r.candidate_email})</span>
                              </td>
                              <td className="px-4 py-2">{r.job_name}</td>
                              <td className="px-4 py-2">{r.round_name}</td>
                              <td className="px-4 py-2">{r.years_experience || '-'} years</td>
                            </>
                          ) : (
                            // Interviews view
                            <>
                              <td className="px-4 py-2">
                                {r.scheduled_time ? new Date(r.scheduled_time).toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-2">
                                {r.candidate_resume_url ? (
                                  <a
                                    href={r.candidate_resume_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 underline font-medium"
                                  >
                                    {r.candidate_name}
                                  </a>
                                ) : (
                                  <span className="font-medium">{r.candidate_name}</span>
                                )}
                                <span className="text-gray-500 ml-1">({r.candidate_email})</span>
                              </td>
                              <td className="px-4 py-2">
                                {Array.isArray(r.interviewers) && r.interviewers.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {r.interviewers.map((iv, i) => (
                                      <span key={i}>
                                        {iv.name}
                                        {i < r.interviewers.length - 1 && ','}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2">{r.job_name}</td>
                              <td className="px-4 py-2">{r.round_name}</td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${r.status === 'fresh' ? 'bg-gray-100 text-gray-800' :
                                  r.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                    r.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
                                      r.status === 'completed' ? 'bg-purple-100 text-purple-800' :
                                        r.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                          r.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                  }`}>
                                  {r.status.charAt(0).toUpperCase() + r.status.slice(1).replace('_', ' ')}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination controls */}
              {!tableLoading && (
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {Math.min(filteredSortedPaged.total, filteredSortedPaged.startIndex + 1)}–{Math.min(filteredSortedPaged.total, filteredSortedPaged.startIndex + filteredSortedPaged.pageRows.length)} of {filteredSortedPaged.total}
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
                    <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
                    <span className="text-sm">Page {page} / {filteredSortedPaged.totalPages}</span>
                    <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.min(filteredSortedPaged.totalPages, p + 1))} disabled={page === filteredSortedPaged.totalPages}>Next</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
