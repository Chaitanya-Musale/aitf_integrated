'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Mail, Phone, User, ExternalLink, ArrowRight, ArrowLeft, MessageSquare, Video, Trash2, Search } from 'lucide-react';
import { candidateService, authService } from '@/lib/auth';

export default function CandidateList({ round, showNotification, onCandidateMove, refreshTrigger }) {
  const [candidates, setCandidates] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterviewers, setSelectedInterviewers] = useState({});
  const [activeTab, setActiveTab] = useState('fresh');
  const [searchTerm, setSearchTerm] = useState('');
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [currentEvaluation, setCurrentEvaluation] = useState({
    candidateId: null,
    candidateName: '',
    allEvaluations: {},
    roundEvaluationParams: [],
    isReadOnly: false
  });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [currentReject, setCurrentReject] = useState({ candidateId: null, candidateName: '' });
  const [rejectReason, setRejectReason] = useState('');
  const [contactingCandidates, setContactingCandidates] = useState(new Set());

  useEffect(() => {
    if (round?.id) {
      loadCandidates();
      loadInterviewers();
    }
  }, [round?.id, refreshTrigger]);

  // Disable body scroll when modals are open
  useEffect(() => {
    if (showEvaluationModal || showRejectModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showEvaluationModal, showRejectModal]);

  const loadCandidates = async () => {
    try {
      setLoading(true);
      const data = await candidateService.getCandidatesByRound(round.id);
      setCandidates(data.candidates);
    } catch (error) {
      if (showNotification) {
        showNotification(error.message, 'error');
      } else {
        console.error('Failed to load candidates:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadInterviewers = async () => {
    try {
      const data = await candidateService.getInterviewers();
      setInterviewers(data.interviewers);
    } catch (error) {
      console.error('Failed to load interviewers:', error);
    }
  };

  const handleContactCandidate = async (candidateId) => {
    try {
      const interviewerIds = selectedInterviewers[candidateId] || [];
      if (interviewerIds.length === 0) {
        if (showNotification) {
          showNotification('Please select at least one interviewer', 'error');
        } else {
          alert('Please select at least one interviewer');
        }
        return;
      }

      // Find candidate name for confirmation
      const candidate = candidates.find(c => c.id === candidateId);
      const candidateName = candidate ? candidate.name : 'this candidate';

      // Get selected interviewer names
      const selectedInterviewerNames = interviewers
        .filter(interviewer => interviewerIds.includes(interviewer.id))
        .map(interviewer => interviewer.name)
        .join(', ');

      // Show confirmation dialog
      const confirmed = window.confirm(
        `Send booking link to ${candidateName}?\n\nAssigned interviewers: ${selectedInterviewerNames}\n\nThis will send an email with available time slots for scheduling the interview.`
      );

      if (!confirmed) {
        return;
      }

      // Set loading state for this candidate
      setContactingCandidates(prev => new Set([...prev, candidateId]));

      try {
        // Generate booking link and send to candidate
        const response = await authService.fetchWithAuth('/calendar/generate-booking-link', {
          method: 'POST',
          body: JSON.stringify({
            candidateId,
            roundId: round.id,
            interviewerIds
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate booking link');
        }

        if (showNotification) {
          showNotification('Booking link sent to candidate successfully!');
        }

        loadCandidates(); // Refresh the list
        setActiveTab('in_progress'); // Switch to in_progress tab to see the moved candidate
      } finally {
        // Remove loading state for this candidate
        setContactingCandidates(prev => {
          const newSet = new Set(prev);
          newSet.delete(candidateId);
          return newSet;
        });
      }
    } catch (error) {
      if (showNotification) {
        showNotification(error.message, 'error');
      } else {
        console.error('Failed to send booking link:', error);
      }
    }
  };

  const handleNextStatus = async (candidateId) => {
    try {
      // Find candidate and determine next action
      const candidate = candidates.find(c => c.id === candidateId);
      const candidateName = candidate ? candidate.name : 'this candidate';
      const currentStatus = candidate ? candidate.round_status : 'unknown';

      // Determine what the next action will be
      const statusOrder = ['fresh', 'in_progress', 'scheduled', 'completed'];
      const currentIndex = statusOrder.indexOf(currentStatus);
      let nextAction = '';
      let nextStatus = '';

      if (currentStatus === 'completed') {
        nextAction = 'accept and move to next round (or mark as accepted if final round)';
        nextStatus = 'accepted';
      } else if (currentIndex !== -1 && currentIndex < statusOrder.length - 1) {
        nextStatus = statusOrder[currentIndex + 1];
        nextAction = `move to "${nextStatus}" status`;
      } else {
        nextAction = 'update status';
      }

      // Show confirmation dialog
      const confirmed = window.confirm(
        `Are you sure you want to proceed with ${candidateName}?\n\n`
      );

      if (!confirmed) {
        return;
      }

      const response = await candidateService.nextCandidateStatus(candidateId, round.id);
      if (showNotification) {
        if (response.movedToRoundId) {
          showNotification(`Candidate moved to ${response.movedToRoundName} and marked as accepted in current round!`);
        } else {
          showNotification('Candidate status updated!');
        }
      }
      // If candidate moved to next round, refresh the parent job data first
      if (response.movedToRoundId && onCandidateMove) {
        // Small delay to ensure backend has processed the move and committed transaction
        setTimeout(() => {
          onCandidateMove();
        }, 300);
      }

      loadCandidates(); // Refresh the list

      // Auto-switch to the appropriate tab based on the new status
      if (response.newStatus === 'accepted') {
        setActiveTab('accepted');
      } else {
        // Auto-switch to the next appropriate tab
        const statusOrder = ['fresh', 'in_progress', 'scheduled', 'completed'];
        const currentIndex = statusOrder.indexOf(activeTab);
        if (currentIndex < statusOrder.length - 1) {
          setActiveTab(statusOrder[currentIndex + 1]);
        }
      }
    } catch (error) {
      if (showNotification) {
        showNotification(error.message, 'error');
      } else {
        console.error('Failed to update candidate status:', error);
      }
    }
  };

  const handleRejectCandidate = async (candidateId, candidateName) => {
    setCurrentReject({ candidateId, candidateName });
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmRejectCandidate = async () => {
    if (!rejectReason.trim()) {
      if (showNotification) {
        showNotification('Please provide a reason for rejection', 'error');
      }
      return;
    }

    try {
      await candidateService.rejectCandidate(currentReject.candidateId, round.id, rejectReason);
      if (showNotification) {
        showNotification('Candidate rejected');
      }
      loadCandidates(); // Refresh the list
      setActiveTab('rejected'); // Switch to rejected tab to see the moved candidate
      setShowRejectModal(false);
      setCurrentReject({ candidateId: null, candidateName: '' });
      setRejectReason('');
    } catch (error) {
      if (showNotification) {
        showNotification(error.message, 'error');
      } else {
        console.error('Failed to reject candidate:', error);
      }
    }
  };

  const handleBackToFresh = async (candidateId) => {
    if (window.confirm('Are you sure you want to move this candidate back to Fresh status?')) {
      try {
        await candidateService.moveCandidateToFresh(candidateId, round.id);
        if (showNotification) {
          showNotification('Candidate moved back to Fresh status');
        }
        loadCandidates();
        setActiveTab('fresh');
      } catch (error) {
        if (showNotification) {
          showNotification(error.message, 'error');
        }
      }
    }
  };

  const handleDeleteCandidate = async (candidateId, candidateName) => {
    if (window.confirm(`Are you sure you want to remove ${candidateName} from this round? This will not delete the candidate permanently.`)) {
      try {
        await candidateService.deleteFromRound(candidateId, round.id);
        if (showNotification) {
          showNotification('Candidate removed from round successfully');
        }
        loadCandidates();
      } catch (error) {
        if (showNotification) {
          showNotification(error.message, 'error');
        }
      }
    }
  };

  const handleEvaluationClick = async (candidate) => {
    // Parse existing evaluation data (new multi-interviewer format)
    let allEvaluations = {};
    try {
      const evaluationData = candidate.evaluation_scores ? JSON.parse(candidate.evaluation_scores) : {};

      // Check if it's the new format (object with interviewer IDs as keys)
      if (typeof evaluationData === 'object' && !Array.isArray(evaluationData)) {
        allEvaluations = evaluationData;
      }
      // Note: Legacy array format is no longer supported
    } catch (e) {
      allEvaluations = {};
    }

    // Get round evaluation parameters
    let roundEvaluationParams = [];
    try {
      roundEvaluationParams = round.evaluation_parameters ? JSON.parse(round.evaluation_parameters) : [];
    } catch (e) {
      roundEvaluationParams = [];
    }

    // Get all assigned interviewers for this candidate and round
    try {
      const response = await candidateService.getAssignedInterviewers(candidate.id, round.id);
      const assignedInterviewers = response.interviewers || [];

      // Create empty evaluations for all assigned interviewers who haven't filled theirs
      assignedInterviewers.forEach(interviewer => {
        if (!allEvaluations[interviewer.id]) {
          allEvaluations[interviewer.id] = {
            scores: roundEvaluationParams.map(param => ({
              id: param.id,
              name: param.name,
              total_points: param.total_points,
              scored_points: 0
            })),
            feedback: '',
            interviewer_name: interviewer.name
          };
        } else {
          // Add interviewer name to existing evaluation
          allEvaluations[interviewer.id].interviewer_name = interviewer.name;
        }
      });
    } catch (error) {
      console.error('Failed to get assigned interviewers:', error);
    }

    setCurrentEvaluation({
      candidateId: candidate.id,
      candidateName: candidate.name,
      allEvaluations,
      roundEvaluationParams,
      isReadOnly: true // HR can only view, not edit
    });
    setShowEvaluationModal(true);
  };



  const handleInterviewerSelection = (candidateId, interviewerId, isSelected) => {
    setSelectedInterviewers(prev => {
      const current = prev[candidateId] || [];
      if (isSelected) {
        return {
          ...prev,
          [candidateId]: [...current, interviewerId]
        };
      } else {
        return {
          ...prev,
          [candidateId]: current.filter(id => id !== interviewerId)
        };
      }
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'fresh': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'scheduled': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'accepted': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const groupedCandidates = candidates.reduce((acc, candidate) => {
    const status = candidate.round_status || 'fresh';
    if (!acc[status]) acc[status] = [];
    acc[status].push(candidate);
    return acc;
  }, {});

  // Define status order for display
  const statusOrder = ['fresh', 'in_progress', 'scheduled', 'completed', 'accepted', 'rejected'];
  const statusLabels = {
    fresh: 'Fresh',
    in_progress: 'In-Progress',
    scheduled: 'Scheduled',
    completed: 'Completed',
    accepted: 'Accepted',
    rejected: 'Rejected'
  };

  // Get candidates for active tab with search filter
  const activeCandidates = (groupedCandidates[activeTab] || []).filter(candidate =>
    candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    candidate.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-4">Loading candidates...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h4 className="font-medium text-lg">{round.name} - Candidates</h4>

        {/* Search Filter */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search candidates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-gray-100 p-1 rounded-lg overflow-hidden">
        <div className="flex space-x-1 overflow-x-auto scrollbar-hide pb-1 -mb-1">
          {statusOrder.map((status) => {
            const count = groupedCandidates[status]?.length || 0;
            return (
              <button
                key={status}
                onClick={() => setActiveTab(status)}
                className={`flex-shrink-0 py-2 px-3 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-colors text-center whitespace-nowrap min-w-0 touch-manipulation ${activeTab === status
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 active:bg-gray-200'
                  }`}
                style={{ minWidth: '80px' }}
              >
                <span className="hidden sm:inline">{statusLabels[status]} ({count})</span>
                <span className="sm:hidden">{statusLabels[status].split(' ')[0]} ({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="min-h-[200px]">
        {activeCandidates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <User className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">No candidates in {statusLabels[activeTab].toLowerCase()}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {activeCandidates.map((candidate) => (
              <div key={candidate.id} className={`border rounded-lg p-4 bg-white ${
                candidate.requested_reassignment && candidate.round_status === 'in_progress' 
                  ? 'border-orange-300 bg-orange-50' 
                  : ''
              }`}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Candidate Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{candidate.name}</span>
                      <Badge className={getStatusColor(candidate.round_status)}>
                        {statusLabels[candidate.round_status] || 'fresh'}
                      </Badge>
                      {candidate.requested_reassignment && candidate.round_status === 'in_progress' && (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                          Reassignment Requested
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span>{candidate.email}</span>
                      </div>
                      {candidate.contact && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{candidate.contact}</span>
                        </div>
                      )}
                      {candidate.resume_url && (
                        <a
                          href={candidate.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          <FileText className="w-3 h-3" />
                          <span>View Resume</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Education & Experience */}
                    {(candidate.college_name || candidate.degree || candidate.years_experience > 0) && (
                      <div className="text-sm text-gray-600">
                        {candidate.college_name && <span>{candidate.college_name}</span>}
                        {candidate.degree && <span> • {candidate.degree}</span>}
                        {candidate.graduation_year && <span> ({candidate.graduation_year})</span>}
                        {candidate.years_experience > 0 && (
                          <span> • {candidate.years_experience} years exp</span>
                        )}
                      </div>
                    )}

                    {/* Work History & Education Details */}
                    {(candidate.work_history || candidate.educations) && (
                      <div className="text-sm text-gray-600 space-y-2">
                        {candidate.work_history && (() => {
                          try {
                            const workHistory = JSON.parse(candidate.work_history);
                            if (Array.isArray(workHistory) && workHistory.length > 0) {
                              return (
                                <div>
                                  <strong>Work Experience:</strong>
                                  <div className="mt-1 space-y-2">
                                    {workHistory.map((work, idx) => (
                                      <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                                        <div className="font-medium">
                                          {work.company} - {work.position}
                                        </div>
                                        {work.certificate_url && (
                                          <a
                                            href={work.certificate_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
                                          >
                                            <FileText className="w-3 h-3" />
                                            View Certificate
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            return null; // 👈 don't render anything if array is empty
                          } catch (e) {
                            return candidate.work_history ? (
                              <div>
                                <strong>Work Experience:</strong>
                                <span className="ml-1">{candidate.work_history}</span>
                              </div>
                            ) : null;
                          }
                        })()}

                        {candidate.educations && (
                          <div><strong>Education:</strong> {candidate.educations}</div>
                        )}
                      </div>
                    )}

                    {/* Assigned Interviewers */}
                    {candidate.assigned_interviewers && candidate.assigned_interviewers.length > 0 && (
                      <div className="text-sm text-gray-600">
                        <strong>Assigned Interviewers:</strong> {candidate.assigned_interviewers.join(', ')}
                      </div>
                    )}

                    {/* Scheduled Time - show for scheduled, completed, and rejected */}
                    {candidate.scheduled_time && (activeTab === 'scheduled' || activeTab === 'completed' || activeTab === 'rejected') && (
                      <div className="text-sm text-gray-600">
                        <strong>Scheduled:</strong> {new Date(candidate.scheduled_time).toLocaleString()}
                      </div>
                    )}

                    {/* Meet Link - only for completed and accepted */}
                    {candidate.meet_link && (activeTab === 'completed' || activeTab === 'accepted') && (
                      <div className="text-sm">
                        <a
                          href={candidate.meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          <Video className="w-3 h-3" />
                          <span>Join Meeting</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Remarks */}
                    {candidate.remarks && (
                      <div className="text-sm text-gray-600">
                        <strong>Remarks:</strong> {candidate.remarks}
                      </div>
                    )}

                    {/* Rejection Reason */}
                    {candidate.rejection_reason && activeTab === 'rejected' && (
                      <div className="text-sm text-red-600">
                        <strong>Rejection Reason:</strong> {candidate.rejection_reason}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="space-y-3 lg:w-80">
                    {/* Fresh Candidates - Interviewer Assignment */}
                    {activeTab === 'fresh' && (
                      <>
                        <div>
                          <label className="text-sm font-medium text-gray-700 block mb-2">
                            Select Interviewers:
                          </label>
                          <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                            {interviewers.map((interviewer) => (
                              <label key={interviewer.id} className="flex items-center space-x-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={(selectedInterviewers[candidate.id] || []).includes(interviewer.id)}
                                  onChange={(e) => handleInterviewerSelection(
                                    candidate.id,
                                    interviewer.id,
                                    e.target.checked
                                  )}
                                  className="rounded"
                                />
                                <span>{interviewer.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleContactCandidate(candidate.id)}
                            className="flex-1"
                            disabled={!selectedInterviewers[candidate.id]?.length || contactingCandidates.has(candidate.id)}
                          >
                            {contactingCandidates.has(candidate.id) ? 'Contacting...' : 'Contact'}
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleDeleteCandidate(candidate.id, candidate.name)}
                            className="flex items-center gap-2 px-4"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </Button>
                        </div>
                      </>
                    )}

                    {/* In Progress - Back button and assigned interviewers */}
                    {activeTab === 'in_progress' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleBackToFresh(candidate.id)}
                            className="flex items-center gap-2 px-4"
                          >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                          </Button>
                          <Button
                            onClick={() => handleNextStatus(candidate.id)}
                            className="flex-1 flex items-center justify-center gap-2"
                          >
                            Next
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Scheduled - No evaluation button */}
                    {activeTab === 'scheduled' && (
                      <div className="space-y-2">
                        <div className="flex justify-center">
                          <Button
                            onClick={() => handleNextStatus(candidate.id)}
                            className="flex items-center justify-center gap-2 px-8"
                          >
                            Next
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Completed - All fields visible, Accept button */}
                    {activeTab === 'completed' && (
                      <div className="space-y-2">
                        {/* Desktop layout */}
                        <div className="hidden sm:flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleEvaluationClick(candidate)}
                            className="flex items-center gap-2 px-4"
                          >
                            <MessageSquare className="w-4 h-4" />
                            View Evaluation
                          </Button>
                          <Button
                            onClick={() => handleNextStatus(candidate.id)}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            Accept
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleRejectCandidate(candidate.id, candidate.name)}
                            className="px-4"
                          >
                            Reject
                          </Button>
                        </div>

                        {/* Mobile layout */}
                        <div className="sm:hidden space-y-2">
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              onClick={() => handleEvaluationClick(candidate)}
                              className="flex items-center gap-2 px-6"
                            >
                              <MessageSquare className="w-4 h-4" />
                              View Evaluation
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleNextStatus(candidate.id)}
                              className="flex-1 bg-green-600 hover:bg-green-700"
                            >
                              Accept
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleRejectCandidate(candidate.id, candidate.name)}
                              className="flex-1"
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Accepted - All fields */}
                    {activeTab === 'accepted' && (
                      <div className="space-y-2">
                        <div className="flex justify-center">
                          <Button
                            variant="outline"
                            onClick={() => handleEvaluationClick(candidate)}
                            className="flex items-center gap-2 px-6"
                          >
                            <MessageSquare className="w-4 h-4" />
                            View Evaluation
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Rejected - View evaluation only */}
                    {activeTab === 'rejected' && (
                      <div className="space-y-2">
                        <div className="flex justify-center">
                          <Button
                            variant="outline"
                            onClick={() => handleEvaluationClick(candidate)}
                            className="flex items-center gap-2 px-6"
                          >
                            <MessageSquare className="w-4 h-4" />
                            View Evaluation
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Interviewer Evaluation Modal */}
      {showEvaluationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              Evaluation for {currentEvaluation.candidateName}
            </h3>

            {/* Show all interviewer evaluations */}
            <div className="space-y-6">
              {Object.keys(currentEvaluation.allEvaluations).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No evaluations available yet.</p>
                </div>
              ) : (
                Object.entries(currentEvaluation.allEvaluations).map(([interviewerId, evaluation]) => (
                  <div key={interviewerId} className="border rounded-lg p-4 border-gray-200">
                    <h4 className="font-medium mb-3">
                      {evaluation.interviewer_name || `Interviewer ${interviewerId}`} Evaluation
                    </h4>

                    {/* Evaluation Parameters */}
                    {evaluation.scores && evaluation.scores.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-medium mb-3 text-sm">Evaluation Parameters</h5>
                        <div className="space-y-3">
                          {evaluation.scores.map((score) => (
                            <div key={score.id} className="flex items-center gap-4 p-3 border rounded-lg">
                              <div className="flex-1">
                                <label className="font-medium text-sm">{score.name}</label>
                                <div className="text-xs text-gray-500">Max: {score.total_points} points</div>
                              </div>
                              <div className="w-24">
                                <input
                                  type="number"
                                  min="0"
                                  max={score.total_points}
                                  value={score.scored_points}
                                  className="w-full p-2 border border-gray-300 rounded-md text-center bg-gray-100"
                                  placeholder="0"
                                  disabled
                                  readOnly
                                />
                              </div>
                              <div className="text-sm text-gray-500">
                                / {score.total_points}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Total Score */}
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <div className="flex justify-between items-center font-medium">
                            <span>Total Score:</span>
                            <span>
                              {evaluation.scores.reduce((sum, score) => sum + (score.scored_points || 0), 0)} / {evaluation.scores.reduce((sum, score) => sum + score.total_points, 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Feedback */}
                    <div className="mb-4">
                      <label className="block font-medium mb-2 text-sm">Feedback</label>
                      <textarea
                        value={evaluation.feedback || ''}
                        placeholder="No feedback provided"
                        className="w-full h-24 p-3 border border-gray-300 rounded-md resize-none bg-gray-100"
                        disabled
                        readOnly
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEvaluationModal(false);
                  setCurrentEvaluation({
                    candidateId: null,
                    candidateName: '',
                    allEvaluations: {},
                    roundEvaluationParams: [],
                    isReadOnly: false
                  });
                }}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-hidden">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-red-600">
              Reject {currentReject.candidateName}
            </h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejecting this candidate:
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full h-24 p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              required
            />
            <div className="flex gap-2 mt-4">
              <Button
                variant="destructive"
                onClick={confirmRejectCandidate}
                className="flex-1"
                disabled={!rejectReason.trim()}
              >
                Confirm Reject
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectModal(false);
                  setCurrentReject({ candidateId: null, candidateName: '' });
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}