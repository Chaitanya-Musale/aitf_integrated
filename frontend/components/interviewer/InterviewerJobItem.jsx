'use client';

import { Calendar, Clock, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InterviewerCandidateList from './InterviewerCandidateList';

export default function InterviewerJobItem({ 
  job, 
  expandedJob, 
  onToggleExpansion, 
  showNotification,
  onRefreshJob,
  refreshTrigger
}) {
  const isExpanded = expandedJob?.id === job.id;

  return (
    <div className="border rounded-lg hover:shadow-md transition-all duration-200">
      {/* Job Header - Clickable */}
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => onToggleExpansion(job)}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-start space-x-3 flex-1">
            {/* Chevron Icon */}
            <div className="mt-1 flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-400 transition-transform duration-200" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400 transition-transform duration-200" />
              )}
            </div>
            
            {/* Job Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{job.name}</h3>
              <p className="text-gray-600 mt-1 line-clamp-2">{job.description}</p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  {job.rounds_count} rounds
                </span>
                <span className="hidden sm:inline">Created by {job.created_by_name}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Job Details */}
      {isExpanded && (
        <div className="border-t bg-gray-50 p-4 animate-in slide-in-from-top duration-300">
          <h4 className="font-semibold text-gray-900 mb-4">Interview Rounds</h4>
          {expandedJob.rounds && expandedJob.rounds.length > 0 ? (
            <div className="space-y-4">
              {expandedJob.rounds.map((round, index) => (
                <div key={round.id} className="bg-white rounded-lg p-4 border">
                  {/* Round Header */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <h5 className="font-medium text-gray-900 truncate">
                        Round {index + 1}: {round.name}
                      </h5>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 text-sm text-gray-500">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {round.duration_minutes} minutes
                        </span>
                        {round.start_date && (
                          <span className="hidden sm:inline">Start: {new Date(round.start_date).toLocaleDateString()}</span>
                        )}
                        {round.end_date && (
                          <span className="hidden sm:inline">End: {new Date(round.end_date).toLocaleDateString()}</span>
                        )}
                      </div>
                      {/* Mobile Date Display */}
                      <div className="sm:hidden mt-1 text-xs text-gray-500">
                        {round.start_date && <div>Start: {new Date(round.start_date).toLocaleDateString()}</div>}
                        {round.end_date && <div>End: {new Date(round.end_date).toLocaleDateString()}</div>}
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex items-center self-start"
                      disabled={!round?.sheet_url}
                      onClick={() => round?.sheet_url && window.open(round.sheet_url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Screening Sheet</span>
                      <span className="sm:hidden">Sheet</span>
                    </Button>
                  </div>

                  {/* Candidate List - Only show candidates assigned to this interviewer */}
                  <div className="mt-4">
                    <InterviewerCandidateList 
                      round={round} 
                      showNotification={showNotification}
                      onCandidateMove={() => onRefreshJob && onRefreshJob(job.id)}
                      refreshTrigger={refreshTrigger}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No interview rounds configured</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}