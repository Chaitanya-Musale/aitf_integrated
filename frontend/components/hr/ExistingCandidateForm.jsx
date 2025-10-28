'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Search, User, Mail, Phone, GraduationCap, Briefcase, Plus } from 'lucide-react';
import { candidateService, jobService } from '@/lib/auth';

export default function ExistingCandidateForm({
  show,
  selectedJob,
  onClose,
  showNotification,
  onSuccess,
  onCreateNew
}) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (show) {
      loadActiveCandidates();
      setSelectedCandidates([]); // Reset selection when modal opens
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [show]);

  const loadActiveCandidates = async () => {
    try {
      setLoading(true);
      const data = await candidateService.getAvailableCandidatesForJob(selectedJob.id);
      setCandidates(data.candidates || []);
    } catch (error) {
      showNotification(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCandidateToggle = (candidateId) => {
    setSelectedCandidates(prev =>
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  const handleSubmit = async () => {
    if (selectedCandidates.length === 0) {
      showNotification('Please select at least one candidate', 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      // Get job details to find first round
      const jobData = await jobService.getJob(selectedJob.id);
      const rounds = jobData?.job?.rounds || [];
      if (!rounds.length) {
        showNotification('This job has no rounds configured', 'error');
        return;
      }

      const firstRoundId = rounds[0].id;

      // Add candidates to the job's first round
      await candidateService.addExistingCandidatesToJob(selectedCandidates, firstRoundId);

      showNotification(`${selectedCandidates.length} candidate(s) added to ${selectedJob.name} successfully!`);
      setSelectedCandidates([]); // Reset selection
      onSuccess();
      onClose();
    } catch (error) {
      showNotification(error.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCandidates = candidates.filter(candidate =>
    candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    candidate.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (candidate.college_name && candidate.college_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (candidate.degree && candidate.degree.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (candidate.skills_summary && candidate.skills_summary.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (candidate.work_history && candidate.work_history.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (candidate.educations && candidate.educations.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Add Candidates</h2>
            <p className="text-gray-600 mt-1">
              Add candidates to <strong>{selectedJob?.name}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search and Actions */}
        <div className="p-6 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search existing candidates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => onCreateNew && onCreateNew()}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Create New Candidate
            </Button>
          </div>
          {selectedCandidates.length > 0 && (
            <div className="mt-3">
              <Badge variant="secondary">
                {selectedCandidates.length} candidate(s) selected
              </Badge>
            </div>
          )}
        </div>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading candidates...</p>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchTerm ? `No candidates found matching "${searchTerm}"` : 'No active candidates found'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${selectedCandidates.includes(candidate.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => handleCandidateToggle(candidate.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedCandidates.includes(candidate.id)}
                          onChange={() => handleCandidateToggle(candidate.id)}
                          className="rounded"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <User className="w-4 h-4 text-gray-500" />
                        <h4 className="font-medium text-gray-900">{candidate.name}</h4>
                      </div>

                      {/* Contact Info */}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 ml-7">
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
                      </div>

                      {/* Education & Experience */}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 ml-7">
                        {(candidate.college_name || candidate.degree) && (
                          <div className="flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" />
                            <span>
                              {candidate.college_name && <span>{candidate.college_name}</span>}
                              {candidate.degree && <span> • {candidate.degree}</span>}
                              {candidate.graduation_year && <span> ({candidate.graduation_year})</span>}
                            </span>
                          </div>
                        )}
                        {candidate.years_experience > 0 && (
                          <div className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            <span>{candidate.years_experience} years exp</span>
                          </div>
                        )}
                      </div>

                      {/* Skills */}
                      {candidate.skills_summary && (
                        <div className="text-sm text-gray-600 ml-7">
                          <strong>Skills:</strong> {candidate.skills_summary}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-4 p-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedCandidates.length === 0}
            className="min-w-[120px]"
          >
            {isSubmitting
              ? 'Adding...'
              : `Add ${selectedCandidates.length} Candidate${selectedCandidates.length !== 1 ? 's' : ''}`
            }
          </Button>
        </div>
      </div>
    </div>
  );
}