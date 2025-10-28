'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Brain, Shield, Download, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { candidateService } from '@/lib/auth';

export default function AIAnalysis({ candidates }) {
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [analysisType, setAnalysisType] = useState('screening'); // 'screening' or 'verification'
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);

  // Phase 2 - Screening settings
  const [jobDescription, setJobDescription] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

  // Phase 3 - Verification settings
  const [seniorityLevel, setSeniorityLevel] = useState('Mid');
  const [strictness, setStrictness] = useState('Medium');
  const [deepAnalysis, setDeepAnalysis] = useState(false);

  const handleAnalyze = async () => {
    if (!selectedCandidate) {
      setError('Please select a candidate');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      let result;

      if (analysisType === 'screening') {
        if (!jobDescription.trim()) {
          setError('Job description is required for screening analysis');
          setLoading(false);
          return;
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai/screening/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            candidateId: selectedCandidate.id,
            jobDescription: jobDescription,
            additionalContext: additionalContext
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Analysis failed');
        }

        result = await response.json();
      } else {
        // Phase 3 - Verification
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai/verification/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            candidateId: selectedCandidate.id,
            seniorityLevel: seniorityLevel,
            strictness: strictness,
            deepAnalysis: deepAnalysis
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Verification failed');
        }

        result = await response.json();
      }

      setAnalysisResult(result);
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.message || 'Failed to analyze candidate');
    } finally {
      setLoading(false);
    }
  };

  const renderScreeningResults = () => {
    if (!analysisResult || !analysisResult.analysis) return null;

    const analysis = analysisResult.analysis.analysis;

    return (
      <div className="space-y-6">
        {/* Final Score Card */}
        <Card>
          <CardHeader>
            <CardTitle>Final Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-4xl font-bold text-blue-600">
                  {analysis.final_weighted_score?.toFixed(1) || 'N/A'}/100
                </div>
                <p className="text-sm text-gray-500 mt-1">Overall Score</p>
              </div>
              <div className="text-right">
                <Badge className={getScoreBadgeColor(analysis.final_weighted_score)}>
                  {getScoreLabel(analysis.final_weighted_score)}
                </Badge>
              </div>
            </div>

            {analysis.confidence_score && (
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Confidence</span>
                  <span className="font-medium">{(analysis.confidence_score * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${analysis.confidence_score * 100}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 11-Metric Breakdown */}
        {analysis.metric_scores && (
          <Card>
            <CardHeader>
              <CardTitle>11-Metric Analysis</CardTitle>
              <CardDescription>Evidence-based skill evaluation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(analysis.metric_scores).map(([key, value]) => (
                  <div key={key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{formatMetricName(key)}</span>
                      <span>{value?.toFixed(1) || 0}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${value || 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Red Flags */}
        {analysis.red_flags && analysis.red_flags.length > 0 && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Red Flags Detected ({analysis.red_flags.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analysis.red_flags.map((flag, idx) => (
                  <Alert key={idx} variant="destructive">
                    <AlertDescription>
                      <strong>[{flag.severity?.toUpperCase()}]</strong> {flag.description}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Positive Signals */}
        {analysis.positive_signals && analysis.positive_signals.length > 0 && (
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="text-green-600 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Positive Signals ({analysis.positive_signals.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1">
                {analysis.positive_signals.map((signal, idx) => (
                  <li key={idx} className="text-sm">{signal}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderVerificationResults = () => {
    if (!analysisResult || !analysisResult.analysis) return null;

    const analysis = analysisResult.analysis;

    return (
      <div className="space-y-6">
        {/* Score Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {analysis.final_score?.toFixed(1) || 'N/A'}
                </div>
                <p className="text-sm text-gray-500 mt-1">Final Score</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {analysis.credibility_score?.toFixed(1) || 'N/A'}
                </div>
                <p className="text-sm text-gray-500 mt-1">Credibility</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {analysis.consistency_score?.toFixed(1) || 'N/A'}
                </div>
                <p className="text-sm text-gray-500 mt-1">Consistency</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Badge className={getRiskBadgeColor(analysis.risk_assessment)}>
                  {analysis.risk_assessment || 'UNKNOWN'}
                </Badge>
                <p className="text-sm text-gray-500 mt-3">Risk Level</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Claims Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Claims Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{analysis.total_claims || 0}</div>
                <p className="text-sm text-gray-500">Total Claims</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{analysis.verified_claims || 0}</div>
                <p className="text-sm text-gray-500">Verified</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{analysis.unverified_claims || 0}</div>
                <p className="text-sm text-gray-500">Unverified</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Red Flags */}
        {analysis.red_flags && analysis.red_flags.length > 0 && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Issues Detected ({analysis.total_red_flags})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.red_flags.slice(0, 10).map((flag, idx) => (
                  <div key={idx} className="border-l-4 border-red-500 pl-4 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getSeverityVariant(flag.severity)}>
                        {flag.severity?.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{flag.category}</span>
                    </div>
                    <p className="text-sm text-gray-700">{flag.description}</p>
                    {flag.interview_probe && (
                      <p className="text-sm text-gray-500 mt-1 italic">
                        Interview: {flag.interview_probe}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recommendation */}
        {analysis.recommendation && (
          <Card className="border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-600">Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700">{analysis.recommendation}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const getScoreBadgeColor = (score) => {
    if (!score) return 'bg-gray-500';
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-blue-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreLabel = (score) => {
    if (!score) return 'Not Scored';
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const getRiskBadgeColor = (risk) => {
    switch (risk?.toUpperCase()) {
      case 'LOW': return 'bg-green-500';
      case 'MEDIUM': return 'bg-yellow-500';
      case 'HIGH': return 'bg-orange-500';
      case 'CRITICAL': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityVariant = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      default: return 'outline';
    }
  };

  const formatMetricName = (key) => {
    const names = {
      technical_domain_breadth: 'Technical Domain Breadth',
      experience_range: 'Experience Range',
      outcome_impact: 'Outcome Impact',
      systems_complexity: 'Systems Complexity',
      domain_alignment: 'Domain Alignment',
      learning_capability: 'Learning Capability',
      cultural_exemplarity: 'Cultural Exemplarity',
      growth_agility: 'Growth Agility',
      stability_risk: 'Stability Risk',
      availability_constraints: 'Availability/Constraints',
      communication_fluency: 'Communication Fluency'
    };
    return names[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-blue-600" />
            AI-Powered Candidate Analysis
          </CardTitle>
          <CardDescription>
            Advanced resume screening and verification using Google Gemini AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Candidate Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Candidate</label>
            <select
              className="w-full p-2 border rounded-md"
              value={selectedCandidate?.id || ''}
              onChange={(e) => {
                const candidate = candidates.find(c => c.id === parseInt(e.target.value));
                setSelectedCandidate(candidate);
                setAnalysisResult(null);
              }}
            >
              <option value="">-- Select a candidate --</option>
              {candidates.map(candidate => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.email})
                </option>
              ))}
            </select>
          </div>

          {/* Analysis Type Tabs */}
          <Tabs value={analysisType} onValueChange={setAnalysisType}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="screening" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                AI Screening
              </TabsTrigger>
              <TabsTrigger value="verification" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Resume Verification
              </TabsTrigger>
            </TabsList>

            {/* Phase 2: AI Screening */}
            <TabsContent value="screening" className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Job Description *</label>
                <textarea
                  className="w-full p-2 border rounded-md"
                  rows={6}
                  placeholder="Paste the complete job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Additional Context (Optional)</label>
                <textarea
                  className="w-full p-2 border rounded-md"
                  rows={3}
                  placeholder="Any specific requirements, team fit considerations, or focus areas..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                />
              </div>
            </TabsContent>

            {/* Phase 3: Resume Verification */}
            <TabsContent value="verification" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Seniority Level</label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={seniorityLevel}
                    onChange={(e) => setSeniorityLevel(e.target.value)}
                  >
                    <option value="Intern">Intern</option>
                    <option value="Junior">Junior</option>
                    <option value="Mid">Mid</option>
                    <option value="Senior">Senior</option>
                    <option value="Lead">Lead</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Strictness</label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={strictness}
                    onChange={(e) => setStrictness(e.target.value)}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={deepAnalysis}
                      onChange={(e) => setDeepAnalysis(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Enable Deep Analysis</span>
                  </label>
                </div>
              </div>

              <Alert>
                <AlertDescription className="text-sm">
                  Deep analysis includes link verification and technology timeline checking (slower but more thorough)
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>

          {/* Analyze Button */}
          <Button
            onClick={handleAnalyze}
            disabled={loading || !selectedCandidate}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                {analysisType === 'screening' ? <Brain className="mr-2 h-4 w-4" /> : <Shield className="mr-2 h-4 w-4" />}
                Start Analysis
              </>
            )}
          </Button>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
            <CardDescription>
              Analysis completed for {analysisResult.candidate?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysisType === 'screening' ? renderScreeningResults() : renderVerificationResults()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
