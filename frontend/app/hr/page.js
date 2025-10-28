'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authService, jobService, candidateService } from '@/lib/auth';
import { Plus } from 'lucide-react';
import HRHeader from '@/components/hr/HRHeader';
import JobList from '@/components/hr/JobList';
import JobForm from '@/components/hr/JobForm';
import CandidateForm from '@/components/hr/CandidateForm';
import CandidateManagementList from '@/components/hr/CandidateManagementList';
import AIAnalysis from '@/components/hr/AIAnalysis';
import ExistingCandidateForm from '@/components/hr/ExistingCandidateForm';
import Notification from '@/components/hr/Notification';
import SessionTimeoutWarning from '@/components/SessionTimeoutWarning';

export default function HRPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = authService.getUser();
  // State management
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [candidateActiveTab, setCandidateActiveTab] = useState('active');
  const [expandedJob, setExpandedJob] = useState(null);
  const [mainSection, setMainSection] = useState('jobs'); // 'jobs' or 'candidates'

  // Form states
  const [showJobForm, setShowJobForm] = useState(false);

  const [showCandidateManagementForm, setShowCandidateManagementForm] = useState(false);
  const [showExistingCandidateForm, setShowExistingCandidateForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [candidateFormMode, setCandidateFormMode] = useState('create');
  const [jobForm, setJobForm] = useState({
    name: '',
    description: '',
    rounds: [{ 
      name: '', 
      start_date: '', 
      end_date: '', 
      duration_minutes: 60,
      evaluation_parameters: [{ id: 1, name: 'Technical Skills', total_points: 10 }]
    }]
  });
  const [candidateForm, setCandidateForm] = useState({
    name: '',
    email: '',
    contact: '',
    college_name: '',
    degree: '',
    graduation_year: '',
    years_experience: 0,
    skills_summary: '',
    work_history: '',
    educations: '',
    remarks: ''
  });

  const [selectedJobForCandidates, setSelectedJobForCandidates] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!authService.isAuthenticated() || !authService.hasRole('HR')) {
      router.push('/');
      return;
    }
    // Switch main section based on query param
    const section = searchParams?.get('section');
    if (section === 'jobs' || section === 'candidates' || section === 'ai') {
      setMainSection(section);
    }
    if (mainSection === 'jobs') {
      loadJobs();
    } else if (mainSection === 'candidates') {
      loadCandidates();
    } else if (mainSection === 'ai') {
      // Load candidates for AI analysis
      loadCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, activeTab, candidateActiveTab, mainSection, searchParams]);

  // After jobs load, auto-expand requested job if expand param is present
  useEffect(() => {
    const expandId = searchParams?.get('expand');
    if (!expandId || !jobs || jobs.length === 0) return;
    const target = jobs.find((j) => String(j.id) === String(expandId));
    if (target) toggleJobExpansion(target);
    // We intentionally do not include toggleJobExpansion in deps to avoid re-fetch loops
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
      const data = await jobService.getJobs(activeTab);
      setJobs(data.jobs);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCandidates = async () => {
    try {
      setCandidatesLoading(true);
      const data = await candidateService.getAllCandidates(candidateActiveTab);
      setCandidates(data.candidates);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setCandidatesLoading(false);
    }
  };

  const resetJobForm = () => {
    setJobForm({
      name: '',
      description: '',
      rounds: [{ 
        name: '', 
        start_date: '', 
        end_date: '', 
        duration_minutes: 60,
        evaluation_parameters: [{ id: 1, name: 'Technical Skills', total_points: 10 }]
      }]
    });
    setEditingJob(null);
  };

  const resetCandidateForm = () => {
    setCandidateForm({
      name: '',
      email: '',
      contact: '',
      college_name: '',
      degree: '',
      graduation_year: '',
      years_experience: 0,
      skills_summary: '',
      work_history: '',
      educations: '',
      remarks: ''
    });
    setEditingCandidate(null);
    setViewingCandidate(null);
    setCandidateFormMode('create');
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      await jobService.createJob(jobForm);
      showNotification('Job created successfully!');
      resetJobForm();
      setShowJobForm(false);
      loadJobs();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleUpdateJob = async (e) => {
    e.preventDefault();
    try {
      await jobService.updateJob(editingJob.id, jobForm);
      showNotification('Job updated successfully!');
      
      // Refresh the expanded job data if it's currently expanded
      if (expandedJob?.id === editingJob.id) {
        const jobData = await jobService.getJob(editingJob.id);
        setExpandedJob(jobData.job);
      }
      
      resetJobForm();
      setShowJobForm(false);
      loadJobs();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleEditJob = async (job) => {
    try {
      const jobData = await jobService.getJob(job.id);
      setEditingJob(jobData.job);
      setJobForm({
        name: jobData.job.name,
        description: jobData.job.description,
        rounds: jobData.job.rounds.length > 0 ? jobData.job.rounds.map(round => {
          let evaluationParams = [];
          try {
            evaluationParams = round.evaluation_parameters ? JSON.parse(round.evaluation_parameters) : [];
          } catch (e) {
            evaluationParams = [];
          }
          if (evaluationParams.length === 0) {
            evaluationParams = [{ id: 1, name: 'Technical Skills', total_points: 10 }];
          }
          
          // Helper function to format date for input field without timezone issues
          const formatDateForInput = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            // Use local date components to avoid timezone issues
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          };

          return {
            id: round.id, // Preserve the round ID for updates
            name: round.name,
            start_date: formatDateForInput(round.start_date),
            end_date: formatDateForInput(round.end_date),
            duration_minutes: round.duration_minutes,
            evaluation_parameters: evaluationParams
          };
        }) : [{ 
          name: '', 
          start_date: '', 
          end_date: '', 
          duration_minutes: 60,
          evaluation_parameters: [{ id: 1, name: 'Technical Skills', total_points: 10 }]
        }]
      });
      setShowJobForm(true);
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleArchiveJob = async (jobId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'archived' : 'active';
      await jobService.updateJobStatus(jobId, newStatus);
      showNotification(`Job ${newStatus === 'archived' ? 'archived' : 'activated'} successfully!`);
      loadJobs();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      try {
        await jobService.deleteJob(jobId);
        showNotification('Job deleted successfully!');
        loadJobs();
      } catch (err) {
        showNotification(err.message, 'error');
      }
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



  const handleCloseJobForm = () => {
    setShowJobForm(false);
    resetJobForm();
  };

  // Candidate Management Handlers
  const handleSaveCandidateManagement = async (candidateData, resumeFile) => {
    try {
      if (candidateFormMode === 'edit') {
        await candidateService.updateCandidate(editingCandidate.id, candidateData);
        showNotification('Candidate updated successfully!');
      } else {
        await candidateService.createStandaloneCandidate(candidateData);
        showNotification('Candidate created successfully!');
      }
      resetCandidateForm();
      setShowCandidateManagementForm(false);
      loadCandidates();
    } catch (err) {
      showNotification(err.message, 'error');
      throw err;
    }
  };

  const handleViewCandidate = (candidate) => {
    setViewingCandidate(candidate);
    setCandidateFormMode('view');
    setShowCandidateManagementForm(true);
  };

  const handleEditCandidate = (candidate) => {
    setEditingCandidate(candidate);
    setCandidateFormMode('edit');
    setShowCandidateManagementForm(true);
  };

  const handleArchiveCandidate = async (candidateId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await candidateService.updateCandidateStatus(candidateId, newStatus);
      showNotification(`Candidate ${newStatus === 'inactive' ? 'deactivated' : 'activated'} successfully!`);
      loadCandidates();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteCandidate = async (candidateId) => {
    if (window.confirm('Are you sure you want to delete this candidate? This action cannot be undone.')) {
      try {
        await candidateService.deleteCandidate(candidateId);
        showNotification('Candidate deleted successfully!');
        loadCandidates();
      } catch (err) {
        showNotification(err.message, 'error');
      }
    }
  };

  const handleCloseCandidateManagementForm = () => {
    setShowCandidateManagementForm(false);
    resetCandidateForm();
  };

  const handleAddExistingCandidates = (job) => {
    console.log('Add candidates clicked for job:', job);
    setSelectedJobForCandidates(job);
    setShowExistingCandidateForm(true);
  };

  const handleCloseExistingCandidateForm = () => {
    setShowExistingCandidateForm(false);
    setSelectedJobForCandidates(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HRHeader currentUser={currentUser} />
      <SessionTimeoutWarning />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Notification
          notification={notification}
          onClose={() => setNotification(null)}
        />

        {/* Main Section Tabs + Action Button - Mobile Responsive */}
        <div className="mb-8">
          {/* Desktop Layout */}
          <div className="hidden sm:flex items-center justify-between">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
              <button
                onClick={() => setMainSection('jobs')}
                className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${mainSection === 'jobs'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Job Management
              </button>
              <button
                onClick={() => setMainSection('candidates')}
                className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${mainSection === 'candidates'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Candidate Management
              </button>
              <button
                onClick={() => setMainSection('ai')}
                className={`py-2 px-6 rounded-md text-sm font-medium transition-colors ${mainSection === 'ai'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                AI Analysis
              </button>
            </div>

            <div>
              {mainSection === 'jobs' ? (
                <Button
                  onClick={() => setShowJobForm(true)}
                  className="flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Job
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    resetCandidateForm();
                    setCandidateFormMode('create');
                    setEditingCandidate(null);
                    setViewingCandidate(null);
                    setShowCandidateManagementForm(true);
                  }}
                  className="flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Candidate
                </Button>
              )}
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="sm:hidden space-y-4">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full">
              <button
                onClick={() => setMainSection('jobs')}
                className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${mainSection === 'jobs'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Jobs
              </button>
              <button
                onClick={() => setMainSection('candidates')}
                className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${mainSection === 'candidates'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Candidates
              </button>
              <button
                onClick={() => setMainSection('ai')}
                className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${mainSection === 'ai'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                AI
              </button>
            </div>

            <div className="w-full">
              {mainSection === 'jobs' ? (
                <Button
                  onClick={() => setShowJobForm(true)}
                  className="flex items-center justify-center w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Job
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    resetCandidateForm();
                    setCandidateFormMode('create');
                    setEditingCandidate(null);
                    setViewingCandidate(null);
                    setShowCandidateManagementForm(true);
                  }}
                  className="flex items-center justify-center w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Candidate
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Conditional Content */}
        {mainSection === 'jobs' ? (
          <JobList
            jobs={jobs}
            loading={loading}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            expandedJob={expandedJob}
            onToggleExpansion={toggleJobExpansion}
            onAddExistingCandidates={handleAddExistingCandidates}
            onEdit={handleEditJob}
            onArchive={handleArchiveJob}
            onDelete={handleDeleteJob}
            onCreateJob={() => setShowJobForm(true)}
            showNotification={showNotification}
            onRefreshJob={handleRefreshJob}
            refreshTrigger={refreshTrigger}
          />
        ) : mainSection === 'candidates' ? (
          <CandidateManagementList
            candidates={candidates}
            loading={candidatesLoading}
            activeTab={candidateActiveTab}
            setActiveTab={setCandidateActiveTab}
            onView={handleViewCandidate}
            onEdit={handleEditCandidate}
            onArchive={handleArchiveCandidate}
            onDelete={handleDeleteCandidate}
            onCreateCandidate={() => {
              resetCandidateForm();
              setCandidateFormMode('create');
              setEditingCandidate(null);
              setViewingCandidate(null);
              setShowCandidateManagementForm(true);
            }}
          />
        ) : mainSection === 'ai' ? (
          <AIAnalysis
            candidates={candidates}
          />
        ) : null}

        <JobForm
          show={showJobForm}
          editingJob={editingJob}
          jobForm={jobForm}
          setJobForm={setJobForm}
          onSubmit={editingJob ? handleUpdateJob : handleCreateJob}
          onClose={handleCloseJobForm}
        />



        <CandidateForm
          show={showCandidateManagementForm}
          selectedJob={null}
          onSave={handleSaveCandidateManagement}
          onClose={handleCloseCandidateManagementForm}
          showNotification={showNotification}
          mode={candidateFormMode}
          initialData={candidateFormMode === 'view' ? viewingCandidate : candidateFormMode === 'edit' ? editingCandidate : null}
          title={candidateFormMode === 'view' ? 'View Candidate Details' : candidateFormMode === 'edit' ? 'Edit Candidate' : 'Add New Candidate'}
        />

        <ExistingCandidateForm
          show={showExistingCandidateForm}
          selectedJob={selectedJobForCandidates}
          onClose={handleCloseExistingCandidateForm}
          showNotification={showNotification}
          onSuccess={loadJobs}
          onCreateNew={() => {
            // Switch to candidate management section and open create form
            setMainSection('candidates');
            setShowExistingCandidateForm(false);
            setTimeout(() => {
              resetCandidateForm();
              setCandidateFormMode('create');
              setEditingCandidate(null);
              setViewingCandidate(null);
              setShowCandidateManagementForm(true);
            }, 100);
          }}
        />
      </div>
    </div>
  );
}
