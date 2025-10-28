'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Search, Briefcase } from 'lucide-react';
import InterviewerJobItem from './InterviewerJobItem';

export default function InterviewerJobList({ 
  jobs, 
  loading, 
  activeTab, 
  setActiveTab, 
  expandedJob, 
  onToggleExpansion,
  showNotification,
  onRefreshJob,
  refreshTrigger
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter jobs based on search term
  const filteredJobs = jobs.filter(job =>
    job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination logic
  const total = filteredJobs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedJobs = filteredJobs.slice(startIndex, startIndex + pageSize);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center">
              <Briefcase className="w-5 h-5 mr-2" />
              Interview Assignments
            </CardTitle>
            <CardDescription>View your assigned interviews and evaluations</CardDescription>
          </div>
          
          {/* Search Filter */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => { setPage(1); setSearchTerm(e.target.value); }}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => { setActiveTab('active'); setPage(1); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'active'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Active Jobs
          </button>
          <button
            onClick={() => { setActiveTab('archived'); setPage(1); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'archived'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Archived Jobs
          </button>
        </div>

        {/* Jobs List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading jobs...</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchTerm ? `No jobs found matching "${searchTerm}"` : `No ${activeTab} jobs with assignments found`}
              </p>
            </div>
          ) : (
            <>
              {paginatedJobs.map((job) => (
                <InterviewerJobItem
                  key={job.id}
                  job={job}
                  expandedJob={expandedJob}
                  onToggleExpansion={onToggleExpansion}
                  showNotification={showNotification}
                  onRefreshJob={onRefreshJob}
                  refreshTrigger={refreshTrigger}
                />
              ))}
              
              {/* Pagination Controls */}
              {total > 0 && (
                <div className="mt-6 flex items-center justify-between gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {Math.min(total, startIndex + 1)}–{Math.min(total, startIndex + paginatedJobs.length)} of {total}
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
                    >
                      Prev
                    </button>
                    <span className="text-sm">Page {page} / {totalPages}</span>
                    <button
                      className="px-3 py-1 border rounded disabled:opacity-50"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}