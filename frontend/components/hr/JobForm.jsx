'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

export default function JobForm({
  show,
  editingJob,
  jobForm,
  setJobForm,
  onSubmit,
  onClose
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [show]);

  if (!show) return null;

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const addRound = () => {
    setJobForm({
      ...jobForm,
      rounds: [...jobForm.rounds, {
        name: '',
        start_date: '',
        end_date: '',
        duration_minutes: 60,
        evaluation_parameters: [{ id: 1, name: 'Technical Skills', total_points: 10 }]
      }]
    });
  };

  const updateRound = (index, field, value) => {
    const updatedRounds = jobForm.rounds.map((round, i) => {
      if (i === index) {
        const updatedRound = { ...round, [field]: value };

        // If updating start_date and end_date is before start_date, clear end_date
        if (field === 'start_date' && round.end_date && value > round.end_date) {
          updatedRound.end_date = '';
        }

        return updatedRound;
      }
      return round;
    });
    setJobForm({ ...jobForm, rounds: updatedRounds });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate that all rounds have names
    const invalidRounds = jobForm.rounds.filter(round => !round.name.trim());
    if (invalidRounds.length > 0) {
      alert('Please provide names for all interview rounds');
      return;
    }

    // Validate date logic for each round
    for (let i = 0; i < jobForm.rounds.length; i++) {
      const round = jobForm.rounds[i];
      if (round.start_date && round.end_date && round.start_date > round.end_date) {
        alert(`Round ${i + 1}: End date must be after start date`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeRound = (index) => {
    if (jobForm.rounds.length > 1) {
      const updatedRounds = jobForm.rounds.filter((_, i) => i !== index);
      setJobForm({ ...jobForm, rounds: updatedRounds });
    }
  };

  const addEvaluationParameter = (roundIndex) => {
    const updatedRounds = jobForm.rounds.map((round, i) => {
      if (i === roundIndex) {
        const existingParams = round.evaluation_parameters || [];
        const newId = existingParams.length > 0 ? Math.max(...existingParams.map(p => p.id)) + 1 : 1;
        return {
          ...round,
          evaluation_parameters: [...existingParams, { id: newId, name: '', total_points: 10 }]
        };
      }
      return round;
    });
    setJobForm({ ...jobForm, rounds: updatedRounds });
  };

  const updateEvaluationParameter = (roundIndex, paramIndex, field, value) => {
    const updatedRounds = jobForm.rounds.map((round, i) => {
      if (i === roundIndex) {
        const updatedParams = round.evaluation_parameters.map((param, j) => {
          if (j === paramIndex) {
            return { ...param, [field]: field === 'total_points' ? parseInt(value) || 0 : value };
          }
          return param;
        });
        return { ...round, evaluation_parameters: updatedParams };
      }
      return round;
    });
    setJobForm({ ...jobForm, rounds: updatedRounds });
  };

  const removeEvaluationParameter = (roundIndex, paramIndex) => {
    const updatedRounds = jobForm.rounds.map((round, i) => {
      if (i === roundIndex) {
        const updatedParams = round.evaluation_parameters.filter((_, j) => j !== paramIndex);
        return { ...round, evaluation_parameters: updatedParams };
      }
      return round;
    });
    setJobForm({ ...jobForm, rounds: updatedRounds });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
      <div className={`bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto ${isSubmitting ? 'opacity-90' : ''}`}>
        <div className="p-6 relative">
          {isSubmitting && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">{editingJob ? 'Updating job...' : 'Creating job and setting up sheets...'}</p>
              </div>
            </div>
          )}
          <h3 className="text-lg font-semibold mb-4">
            {editingJob ? 'Edit Job' : 'Create New Job'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="jobName">Job Name *</Label>
              <Input
                id="jobName"
                value={jobForm.name}
                onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                required
                disabled={editingJob || isSubmitting}
                className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
              />
              {editingJob && (
                <p className="text-xs text-gray-500 mt-1">Job name cannot be edited</p>
              )}
            </div>
            <div>
              <Label htmlFor="jobDescription">Job Description</Label>
              <textarea
                id="jobDescription"
                className={`w-full p-2 border rounded-md ${isSubmitting ? 'bg-gray-100' : ''}`}
                rows={3}
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            {/* Interview Rounds */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Interview Rounds *</Label>
                <Button
                  type="button"
                  onClick={addRound}
                  size="sm"
                  variant="outline"
                  disabled={editingJob || isSubmitting}
                  className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Round
                </Button>
              </div>

              {jobForm.rounds.map((round, index) => (
                <div key={index} className="border rounded-lg p-4 mb-4 bg-gray-50">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium">Round {index + 1}</h4>
                    {jobForm.rounds.length > 1 && !editingJob && !isSubmitting && (
                      <Button
                        type="button"
                        onClick={() => removeRound(index)}
                        size="sm"
                        variant="destructive"
                        disabled={isSubmitting}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Round Name *</Label>
                      <Input
                        value={round.name}
                        onChange={(e) => updateRound(index, 'name', e.target.value)}
                        placeholder="e.g., Technical Interview"
                        required
                        disabled={editingJob || isSubmitting}
                        className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
                      />
                      {editingJob && (
                        <p className="text-xs text-gray-500 mt-1">Round name cannot be edited</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Duration (minutes)</Label>
                        <Input
                          type="number"
                          value={round.duration_minutes}
                          onChange={(e) => updateRound(index, 'duration_minutes', parseInt(e.target.value))}
                          min="15"
                          max="240"
                          placeholder="60"
                          disabled={editingJob || isSubmitting}
                          className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
                        />
                        {editingJob && (
                          <p className="text-xs text-gray-500 mt-1">Cannot edit duration when editing job</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Start Date</Label>
                        <Input
                          type="date"
                          value={round.start_date}
                          onChange={(e) => updateRound(index, 'start_date', e.target.value)}
                          min={today}
                          disabled={editingJob || isSubmitting}
                          className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {editingJob ? 'Start date is locked when editing a job' : 'Cannot be in the past'}
                        </p>
                      </div>
                      <div>
                        <Label>End Date</Label>
                        <Input
                          type="date"
                          value={round.end_date}
                          onChange={(e) => updateRound(index, 'end_date', e.target.value)}
                          min={round.start_date || today}
                          disabled={(!round.start_date && !editingJob) || isSubmitting}
                          className={(!round.start_date && !editingJob) || isSubmitting ? 'bg-gray-100' : ''}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {editingJob
                            ? 'You can extend the end date to open more booking slots'
                            : (!round.start_date
                              ? 'Select start date first'
                              : 'Must be after start date')}
                        </p>
                      </div>
                    </div>

                    {/* Evaluation Parameters */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label>Evaluation Parameters</Label>
                        <Button
                          type="button"
                          onClick={() => addEvaluationParameter(index)}
                          size="sm"
                          variant="outline"
                          disabled={editingJob || isSubmitting}
                          className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Parameter
                        </Button>
                      </div>

                      {round.evaluation_parameters && round.evaluation_parameters.length > 0 ? (
                        <div className="space-y-2">
                          {round.evaluation_parameters.map((param, paramIndex) => (
                            <div key={param.id} className="flex gap-2 items-end">
                              <div className="flex-1">
                                <Label className="text-xs">Parameter Name</Label>
                                <Input
                                  value={param.name}
                                  onChange={(e) => updateEvaluationParameter(index, paramIndex, 'name', e.target.value)}
                                  placeholder="e.g., Technical Skills"
                                  size="sm"
                                  disabled={editingJob || isSubmitting}
                                  className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
                                />
                              </div>
                              <div className="w-24">
                                <Label className="text-xs">Total Points</Label>
                                <Input
                                  type="number"
                                  value={param.total_points}
                                  onChange={(e) => updateEvaluationParameter(index, paramIndex, 'total_points', e.target.value)}
                                  min="1"
                                  max="100"
                                  size="sm"
                                  disabled={editingJob || isSubmitting}
                                  className={editingJob || isSubmitting ? 'bg-gray-100' : ''}
                                />
                              </div>
                              {round.evaluation_parameters.length > 1 && !editingJob && !isSubmitting && (
                                <Button
                                  type="button"
                                  onClick={() => removeEvaluationParameter(index, paramIndex)}
                                  size="sm"
                                  variant="destructive"
                                  className="px-2"
                                  disabled={isSubmitting}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No evaluation parameters added</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-2 pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="transition-all duration-200"
              >
                {isSubmitting
                  ? (editingJob ? 'Updating...' : 'Creating...')
                  : (editingJob ? 'Update Job' : 'Create Job')
                }
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}