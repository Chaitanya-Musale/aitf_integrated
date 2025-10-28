'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService, jobService } from '@/lib/auth';
import RoleToggle from '@/components/RoleToggle';
import UserProfile from '@/components/UserProfile';
import { Button } from '@/components/ui/button';
import SessionTimeoutWarning from '@/components/SessionTimeoutWarning';
import InterviewerJobList from '@/components/interviewer/InterviewerJobList';
import Notification from '@/components/hr/Notification';

export default function InterviewerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = authService.getUser();

  // State management
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [expandedJob, setExpandedJob] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!authService.isAuthenticated() || !authService.hasRole('Interviewer')) {
      router.push('/');
      return;
    }
    loadJobs();
  }, [router, activeTab]);

  // After jobs load, auto-expand requested job if expand param is present
  useEffect(() => {
    const expandId = searchParams?.get('expand');
    if (!expandId || !jobs || jobs.length === 0) return;
    const target = jobs.find((j) => String(j.id) === String(expandId));
    if (target) toggleJobExpansion(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, jobs]);

  // Notification system
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadJobs = async () => {
    try {
      setLoading(true);
      // Get jobs where the current user is assigned as an interviewer
      const data = await jobService.getJobsForInterviewer(activeTab, currentUser.id);
      setJobs(data.jobs);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleJobExpansion = async (job) => {
    if (expandedJob?.id === job.id) {
      setExpandedJob(null);
    } else {
      try {
        const jobData = await jobService.getJob(job.id);
        setExpandedJob(jobData.job);
      } catch (err) {
        showNotification(err.message, 'error');
      }
    }
  };

  const handleRefreshJob = async (jobId) => {
    try {
      // Refresh the expanded job data if it's the same job
      if (expandedJob?.id === jobId) {
        // First trigger refresh for all CandidateList components
        setRefreshTrigger(prev => prev + 1);
        
        // Then refresh the job data
        const jobData = await jobService.getJob(jobId);
        setExpandedJob(jobData.job);
        
        // Trigger another refresh after job data is updated to ensure consistency
        setTimeout(() => {
          setRefreshTrigger(prev => prev + 1);
        }, 100);
      }
    } catch (err) {
      console.error('Failed to refresh job:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionTimeoutWarning />
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900">AITF</h1>
            <div className="flex items-center space-x-1 sm:space-x-4">
              <Link href="/interviewer/upcoming" className="hidden sm:block">
                <Button size="sm" variant="outline">Upcoming</Button>
              </Link>
              <Link href="/interviewer/upcoming" className="sm:hidden">
                <Button size="sm" variant="outline" className="px-2">
                  <span className="text-xs">Upcoming</span>
                </Button>
              </Link>
              <RoleToggle currentRole="Interviewer" userRoles={currentUser?.roles} />
              <UserProfile userName={currentUser?.name} />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Notification
          notification={notification}
          onClose={() => setNotification(null)}
        />

        <InterviewerJobList
          jobs={jobs}
          loading={loading}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          expandedJob={expandedJob}
          onToggleExpansion={toggleJobExpansion}
          showNotification={showNotification}
          onRefreshJob={handleRefreshJob}
          refreshTrigger={refreshTrigger}
        />
      </div>
    </div>
  );
}