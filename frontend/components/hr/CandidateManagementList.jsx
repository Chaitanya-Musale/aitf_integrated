'use client';

import { useState, useMemo, useEffect } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Search, Mail, Phone, FileText, ExternalLink, Edit, Archive, Trash2, User, GraduationCap, Briefcase, Eye, MoreVertical } from 'lucide-react';

export default function CandidateManagementList({
  candidates,
  loading,
  activeTab,
  setActiveTab,
  onView,
  onEdit,
  onArchive,
  onDelete,
  onCreateCandidate
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPayload, setAiPayload] = useState(null);
  const [aiName, setAiName] = useState('');

  // Filter candidates based on search term
  const filteredCandidates = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return candidates.filter(candidate =>
      candidate.name.toLowerCase().includes(term) ||
      candidate.email.toLowerCase().includes(term) ||
      (candidate.college_name && candidate.college_name.toLowerCase().includes(term)) ||
      (candidate.skills_summary && candidate.skills_summary.toLowerCase().includes(term))
    );
  }, [candidates, searchTerm]);

  // Reset to first page on filter change
  useMemo(() => { setPage(1); }, [searchTerm, activeTab]);

  const total = filteredCandidates.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;
  const pagedCandidates = filteredCandidates.slice(startIndex, startIndex + pageSize);

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const openAiSummary = (candidate) => {
    try {
      const parsed = candidate.ai_summary ? (typeof candidate.ai_summary === 'string' ? JSON.parse(candidate.ai_summary) : candidate.ai_summary) : null;
      setAiPayload(parsed);
      setAiName(candidate.name || 'Candidate');
      setAiOpen(true);
    } catch {
      setAiPayload(null);
      setAiName(candidate.name || 'Candidate');
      setAiOpen(true);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Candidate Management
              </CardTitle>
              <CardDescription>Manage candidate profiles and information</CardDescription>
            </div>

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
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === 'active'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Active Candidates
            </button>
            <button
              onClick={() => setActiveTab('inactive')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${activeTab === 'inactive'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Inactive Candidates
            </button>
          </div>

          {/* Candidates List */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-gray-600 mt-2">Loading candidates...</p>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {searchTerm ? `No candidates found matching "${searchTerm}"` : `No ${activeTab} candidates found`}
                </p>
                {activeTab === 'active' && !searchTerm && (
                  <Button onClick={onCreateCandidate} className="mt-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Candidate
                  </Button>
                )}
              </div>
            ) : (
              pagedCandidates.map((candidate) => (
                <div key={candidate.id} className="border rounded-lg hover:shadow-md transition-all duration-200">
                  <div className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start space-x-3 flex-1">
                        {/* Candidate Info */}
                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <div className="flex items-center gap-3 flex-wrap mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 truncate">{candidate.name}</h3>
                            <Badge className={getStatusColor(candidate.status || 'active')}>
                              {candidate.status || 'active'}
                            </Badge>
                          </div>

                          {/* Contact Info */}
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-gray-600 mb-2">
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
                            {candidate.years_experience > 0 && (
                              <div className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                <span>{candidate.years_experience} years exp</span>
                              </div>
                            )}
                          </div>

                          {/* Education */}
                          {(candidate.college_name || candidate.degree || candidate.graduation_year) && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                              <GraduationCap className="w-4 h-4" />
                              <span>
                                {candidate.college_name && <span>{candidate.college_name}</span>}
                                {candidate.degree && <span> • {candidate.degree}</span>}
                                {candidate.graduation_year && <span> ({candidate.graduation_year})</span>}
                              </span>
                            </div>
                          )}

                          {/* Skills Summary */}
                          {candidate.skills_summary && (
                            <div className="text-sm text-gray-600 mb-2">
                              <strong>Skills:</strong> {candidate.skills_summary.length > 100
                                ? `${candidate.skills_summary.substring(0, 100)}...`
                                : candidate.skills_summary}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons - Desktop */}
                      <div className="hidden md:flex space-x-2 ml-4">
                        {candidate.ai_summary && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAiSummary(candidate)}
                          >
                            AI Summary
                          </Button>
                        )}
                        {candidate.resume_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(candidate.resume_url, '_blank')}
                            className="flex items-center"
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            Resume
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onView && onView(candidate)}
                          className="flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(candidate)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onArchive(candidate.id, candidate.status || 'active')}
                        >
                          <Archive className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDelete(candidate.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Mobile Menu Button */}
                      <div className="md:hidden ml-2">
                        <MobileCandidateMenu
                          candidate={candidate}
                          onView={onView}
                          onEdit={onEdit}
                          onArchive={onArchive}
                          onDelete={onDelete}
                          onAiSummary={openAiSummary}
                        />
                      </div>
                    </div>

                    {/* Resume Link - Mobile */}
                    {candidate.resume_url && (
                      <div className="md:hidden mt-3 pt-3 border-t">
                        <a
                          href={candidate.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          <span>View Resume</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {!loading && total > 0 && (
            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                Showing {Math.min(total, startIndex + 1)}–{Math.min(total, startIndex + pagedCandidates.length)} of {total}
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
          )}
        </CardContent>
      </Card>
      <AiSummaryModal open={aiOpen} onClose={() => setAiOpen(false)} name={aiName} payload={aiPayload} />
    </>
  );
}

// Mobile Menu Component
function MobileCandidateMenu({ candidate, onView, onEdit, onArchive, onDelete, onAiSummary }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="p-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <MoreVertical className="w-4 h-4" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20 animate-in slide-in-from-top-2 duration-200">
            <div className="py-1">
              {candidate.ai_summary && (
                <button
                  onClick={() => {
                    onAiSummary && onAiSummary(candidate);
                    setIsOpen(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Eye className="w-4 h-4 mr-3" />
                  AI Summary
                </button>
              )}
              {candidate.resume_url && (
                <button
                  onClick={() => {
                    window.open(candidate.resume_url, '_blank');
                    setIsOpen(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <FileText className="w-4 h-4 mr-3" />
                  View Resume
                </button>
              )}
              <button
                onClick={() => {
                  onView && onView(candidate);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Eye className="w-4 h-4 mr-3" />
                View Details
              </button>
              <button
                onClick={() => {
                  onEdit(candidate);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Edit className="w-4 h-4 mr-3" />
                Edit Candidate
              </button>
              <button
                onClick={() => {
                  onArchive(candidate.id, candidate.status || 'active');
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Archive className="w-4 h-4 mr-3" />
                {(candidate.status || 'active') === 'active' ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => {
                  onDelete(candidate.id);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-3" />
                Delete Candidate
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// AI Summary Modal
function AiSummaryModal({ open, onClose, name, payload }) {
  // Disable body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  if (!open) return null;
  const overall = payload?.overall_score ?? null;
  const context = payload?.context || 'AI Summary';
  const rawNarrative = payload?.narrative || payload?.rationale || '';
  // Split out inline parameters if present (e.g., "Parameters: k=v, ...")
  let narrative = rawNarrative;
  let params = [];
  const idx = rawNarrative.lastIndexOf('Parameters:');
  if (idx !== -1) {
    narrative = rawNarrative.slice(0, idx).trim();
    const line = rawNarrative.slice(idx + 'Parameters:'.length).trim().replace(/[\.]$/, '');
    params = line.split(',').map(s => s.trim()).map(p => {
      const [k, v] = p.split('=').map(x => (x || '').trim());
      return { k, v };
    }).filter(p => p.k);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4 z-10">
        <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 max-h-[85vh] overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-white to-blue-50/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-full bg-blue-600/10 flex items-center justify-center text-blue-700 font-semibold">
                  {name?.[0]?.toUpperCase() || 'A'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold truncate text-gray-900">{name}</h3>
                  <p className="text-xs text-gray-500 truncate">{context}</p>
                </div>
              </div>
              {overall !== null && (
                <div className="shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500">Overall</div>
                    <div className="h-11 w-11 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                      {overall}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="px-6 py-5 overflow-y-auto">
            {narrative && (
              <div className="space-y-3">
                <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-line bg-gray-50/60 border border-gray-200 rounded-lg p-4">
                  {narrative}
                </div>
              </div>
            )}
            {params.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-semibold text-gray-700 mb-2 tracking-wide">Signals</div>
                <div className="flex flex-wrap gap-2">
                  {params.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 text-xs border border-gray-200">
                      <span className="font-medium">{p.k.replace(/_/g, ' ')}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-gray-900 shadow-sm border text-[11px] font-semibold">{p.v}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  );
}