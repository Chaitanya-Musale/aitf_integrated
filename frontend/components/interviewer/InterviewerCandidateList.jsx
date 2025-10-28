'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Mail, Phone, User, ExternalLink, MessageSquare, Video, Search } from 'lucide-react';
import { candidateService, authService } from '@/lib/auth';

export default function InterviewerCandidateList({ round, showNotification, onCandidateMove, refreshTrigger }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('scheduled');
  const [searchTerm, setSearchTerm] = useState('');
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [currentEvaluation, setCurrentEvaluation] = useState({
    candidateId: null,
    candidateName: '',
    allEvaluations: {},
    roundEvaluationParams: [],
    currentInterviewerId: null
  });

  const currentUser = authService.getUser();
  const currentInterviewerId = currentUser?.id;

  useEffect(() => {
    if (round?.id && currentInterviewerId) {
      loadCandidates();
    }
  }, [round?.id, refreshTrigger, currentInterviewerId]);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (showEvaluationModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showEvaluationModal]);

  const loadCandidates = async () => {
    try {
      setLoading(true);
      // Get only candidates assigned to this interviewer
      const data = await candidateService.getCandidatesByRoundAndInterviewer(round.id, currentInterviewerId);
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

  const handleEvaluationClick = async (candidate) => {
    // Parse existing evaluation data
    let allEvaluations = {};
    try {
      allEvaluations = candidate.evaluation_scores ? JSON.parse(candidate.evaluation_scores) : {};
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
      // Fallback: ensure current interviewer has evaluation structure
      if (!allEvaluations[currentInterviewerId]) {
        allEvaluations[currentInterviewerId] = {
          scores: roundEvaluationParams.map(param => ({
            id: param.id,
            name: param.name,
            total_points: param.total_points,
            scored_points: 0
          })),
          feedback: '',
          interviewer_name: currentUser?.name || 'Current User'
        };
      }
    }

    setCurrentEvaluation({
      candidateId: candidate.id,
      candidateName: candidate.name,
      allEvaluations,
      roundEvaluationParams,
      currentInterviewerId
    });
    setShowEvaluationModal(true);
  };

  const handleSaveEvaluation = async () => {
    try {
      await candidateService.updateMultiInterviewerEvaluation(
        currentEvaluation.candidateId,
        round.id,
        currentEvaluation.allEvaluations
      );
      if (showNotification) {
        showNotification('Evaluation saved successfully');
      }
      loadCandidates();
      setShowEvaluationModal(false);
      setCurrentEvaluation({
        candidateId: null,
        candidateName: '',
        allEvaluations: {},
        roundEvaluationParams: [],
        currentInterviewerId: null
      });
    } catch (error) {
      if (showNotification) {
        showNotification(error.message, 'error');
      }
    }
  };

  const updateEvaluationScore = (paramId, scoredPoints) => {
    const currentInterviewerEval = currentEvaluation.allEvaluations[currentInterviewerId];
    const score = currentInterviewerEval.scores.find(s => s.id === paramId);
    const maxPoints = score ? score.total_points : 0;
    const validatedPoints = Math.min(Math.max(parseInt(scoredPoints) || 0, 0), maxPoints);

    const updatedScores = currentInterviewerEval.scores.map(score =>
      score.id === paramId ? { ...score, scored_points: validatedPoints } : score
    );

    setCurrentEvaluation(prev => ({
      ...prev,
      allEvaluations: {
        ...prev.allEvaluations,
        [currentInterviewerId]: {
          ...currentInterviewerEval,
          scores: updatedScores
        }
      }
    }));
  };

  const updateFeedback = (feedback) => {
    const currentInterviewerEval = currentEvaluation.allEvaluations[currentInterviewerId];
    setCurrentEvaluation(prev => ({
      ...prev,
      allEvaluations: {
        ...prev.allEvaluations,
        [currentInterviewerId]: {
          ...currentInterviewerEval,
          feedback
        }
      }
    }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'accepted': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const groupedCandidates = candidates.reduce((acc, candidate) => {
    const status = candidate.round_status || 'scheduled';
    if (!acc[status]) acc[status] = [];
    acc[status].push(candidate);
    return acc;
  }, {});

  // Define status order for display (excluding fresh and in_progress)
  const statusOrder = ['scheduled', 'completed', 'accepted', 'rejected'];
  const statusLabels = {
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
        <h4 className="font-medium text-lg">{round.name} - My Assignments</h4>

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

      {/* Status Tabs - Only show scheduled, completed, accepted, rejected */}
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
              <div key={candidate.id} className="border rounded-lg p-4 bg-white">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Candidate Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{candidate.name}</span>
                      <Badge className={getStatusColor(candidate.round_status)}>
                        {statusLabels[candidate.round_status] || 'scheduled'}
                      </Badge>
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
                            return null;
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

                    {/* Scheduled Time */}
                    {candidate.scheduled_time && (
                      <div className="text-sm text-gray-600">
                        <strong>Scheduled:</strong> {new Date(candidate.scheduled_time).toLocaleString()}
                      </div>
                    )}

                    {/* Meet Link */}
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

                  {/* Actions - Only show evaluation button for completed, accepted, and rejected */}
                  <div className="space-y-3 lg:w-80">
                    {(activeTab === 'completed' || activeTab === 'accepted' || activeTab === 'rejected') && (
                      <div className="flex justify-center">
                        <Button
                          variant="outline"
                          onClick={() => handleEvaluationClick(candidate)}
                          className="flex items-center gap-2 px-6"
                        >
                          <MessageSquare className="w-4 h-4" />
                          {activeTab === 'completed' ? 'Evaluation' : 'View Evaluation'}
                        </Button>
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
              {Object.entries(currentEvaluation.allEvaluations).map(([interviewerId, evaluation]) => {
                const isCurrentInterviewer = parseInt(interviewerId) === currentInterviewerId;
                // Make read-only if not current interviewer OR if candidate is accepted/rejected
                const isReadOnly = !isCurrentInterviewer || activeTab === 'accepted' || activeTab === 'rejected';

                return (
                  <div key={interviewerId} className={`border rounded-lg p-4 ${isCurrentInterviewer ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <h4 className="font-medium mb-3">
                      {isCurrentInterviewer ? 'Your Evaluation' : `${evaluation.interviewer_name || `Interviewer ${interviewerId}`} Evaluation`}
                      {isCurrentInterviewer && (activeTab === 'completed') && <span className="text-sm text-blue-600 ml-2">(Editable)</span>}
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
                                  onChange={(e) => isCurrentInterviewer && updateEvaluationScore(score.id, e.target.value)}
                                  className={`w-full p-2 border border-gray-300 rounded-md text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isReadOnly ? 'bg-gray-100' : ''}`}
                                  placeholder="0"
                                  disabled={isReadOnly}
                                  readOnly={isReadOnly}
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
                        onChange={(e) => isCurrentInterviewer && updateFeedback(e.target.value)}
                        placeholder={isReadOnly ? "No feedback provided" : "Enter your feedback here..."}
                        className={`w-full h-24 p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isReadOnly ? 'bg-gray-100' : ''}`}
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 mt-6">
              {activeTab === 'completed' && (
                <Button
                  onClick={handleSaveEvaluation}
                  className="flex-1"
                >
                  Save My Evaluation
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setShowEvaluationModal(false);
                  setCurrentEvaluation({
                    candidateId: null,
                    candidateName: '',
                    allEvaluations: {},
                    roundEvaluationParams: [],
                    currentInterviewerId: null
                  });
                }}
                className={activeTab !== 'completed' ? "flex-1" : ""}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}