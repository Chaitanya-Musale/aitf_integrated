'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, X, User, GraduationCap, Briefcase, Plus, ExternalLink, Loader2 } from 'lucide-react';
import { authService } from '@/lib/auth';

export default function CandidateForm({
  show,
  selectedJob,
  onSave,
  onClose,
  showNotification,
  mode = 'create', // 'create', 'edit', 'view'
  initialData = null,
  title = null
}) {
  const [candidate, setCandidate] = useState(initialData || {
    name: '',
    email: '',
    contact: '',
    college_name: '',
    degree: '',
    graduation_year: '',
    years_experience: 0,
    skills_summary: '',
    work_history: '',
    experiences: [],
    educations: '',
    resume_url: '',
    remarks: '',
    ai_summary: null
  });

  const [resumeFile, setResumeFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [experienceFiles, setExperienceFiles] = useState({});
  const [uploadingExperience, setUploadingExperience] = useState({});

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

  // Update candidate data when initialData changes or mode changes
  useEffect(() => {
    if (mode === 'create' && !initialData) {
      // Reset to empty form for create mode
      setCandidate({
        name: '',
        email: '',
        contact: '',
        college_name: '',
        degree: '',
        graduation_year: '',
        years_experience: 0,
        skills_summary: '',
        work_history: '',
        experiences: [],
        educations: '',
        resume_url: '',
        remarks: '',
        ai_summary: null
      });

      setResumeFile(null);
      setExperienceFiles({});
      setUploadingExperience({});
    } else if (initialData && (mode === 'edit' || mode === 'view')) {
      // Populate form with initial data for edit/view modes
      const experiences = initialData.work_history ?
        (typeof initialData.work_history === 'string' ?
          JSON.parse(initialData.work_history || '[]') :
          initialData.work_history) : [];

      setCandidate({
        name: initialData.name || '',
        email: initialData.email || '',
        contact: initialData.contact || '',
        college_name: initialData.college_name || '',
        degree: initialData.degree || '',
        graduation_year: initialData.graduation_year || '',
        years_experience: initialData.years_experience || 0,
        skills_summary: initialData.skills_summary || '',
        work_history: initialData.work_history || '',
        experiences: experiences,
        educations: initialData.educations || '',
        resume_url: initialData.resume_url || '',
        remarks: initialData.remarks || '',
        ai_summary: initialData.ai_summary || null
      });
      setResumeFile(null);
      setExperienceFiles({});
      setUploadingExperience({});
    }
  }, [initialData, mode]);

  // Reset form when modal closes
  const resetForm = () => {
    if (!initialData) {
      setCandidate({
        name: '',
        email: '',
        contact: '',
        college_name: '',
        degree: '',
        graduation_year: '',
        years_experience: 0,
        skills_summary: '',
        work_history: '',
        experiences: [],
        educations: '',
        resume_url: '',
        remarks: '',
        ai_summary: null
      });
    }
    setResumeFile(null);
    setExperienceFiles({});
    setUploadingExperience({});
    setIsUploading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!show) return null;

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      showNotification('Please upload only PDF, DOC, or DOCX files', 'error');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showNotification('File size must be less than 10MB', 'error');
      return;
    }

    setResumeFile(file);
    setIsUploadingPreview(true);
    setCandidate(prev => ({ ...prev, resume_url: 'Uploading...' }));

    try {
      // Upload file immediately to get URL
      const formData = new FormData();
      formData.append('resumes', file);

      const token = authService.getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/candidates/upload-resumes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = data?.candidates?.[0] || null;
        if (parsed) {
          // Map backend parsed fields to form state
          const experiences = Array.isArray(parsed.work_history) ? parsed.work_history.map((wh, idx) => ({
            id: Date.now() + idx,
            company: wh.company || '',
            position: wh.position || '',
            certificate_url: ''
          })) : [];
          const skillsSummary = parsed.skills_summary || (Array.isArray(parsed.skills) ? parsed.skills.join(', ') : '');
          let aiSummary = null;
          try {
            aiSummary = parsed.ai_summary ? (typeof parsed.ai_summary === 'string' ? JSON.parse(parsed.ai_summary) : parsed.ai_summary) : null;
          } catch (_) { aiSummary = null; }
          setCandidate(prev => ({
            ...prev,
            name: parsed.name || prev.name,
            email: parsed.email || prev.email,
            contact: parsed.contact || parsed.phone || prev.contact,
            college_name: parsed.college_name || prev.college_name,
            degree: parsed.degree || parsed.program || prev.degree,
            graduation_year: parsed.graduation_year || prev.graduation_year,
            years_experience: parsed.years_experience ?? prev.years_experience,
            skills_summary: skillsSummary || prev.skills_summary,
            experiences: experiences.length ? experiences : prev.experiences,
            // Prefer returned resume_url if available
            resume_url: parsed.resume_url || prev.resume_url || `File ready: ${file.name}`,
            ai_summary: aiSummary
          }));
          showNotification('Resume parsed and fields auto-filled!');
        } else {
          setCandidate(prev => ({ ...prev, resume_url: `File ready: ${file.name}` }));
          showNotification('Resume selected successfully!');
        }
      } else {
        setCandidate(prev => ({ ...prev, resume_url: `File ready: ${file.name}` }));
        showNotification('Resume selected successfully!');
      }
    } catch (error) {
      console.error('Resume upload failed:', error);
      setCandidate(prev => ({ ...prev, resume_url: `File ready: ${file.name}` }));
      showNotification('Resume selected successfully!');
    } finally {
      setIsUploadingPreview(false);
    }
  };

  const removeResume = () => {
    setResumeFile(null);
    setCandidate(prev => ({ ...prev, resume_url: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!candidate.name || !candidate.email) {
      showNotification('Please fill in name and email', 'error');
      return;
    }

    // Validate resume (either file or URL) - always required
    if (!resumeFile && !candidate.resume_url) {
      showNotification('Please either upload a resume file or provide a resume URL', 'error');
      return;
    }

    setIsUploading(true);
    try {
      // Prepare candidate data with experiences as JSON string
      const candidateData = {
        ...candidate,
        work_history: JSON.stringify(candidate.experiences)
      };

      // If we already uploaded the file and have a URL, don't send the file again
      const fileToSend = candidate.resume_url.startsWith('http') ? null : resumeFile;
      await onSave(candidateData, fileToSend);
      // Reset form and close modal on success
      resetForm();
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setIsUploading(false);
    }
  };

  // Check if form is ready for submission
  const isFormValid = candidate.name && candidate.email && candidate.resume_url &&
    candidate.resume_url !== 'Uploading...' &&
    !candidate.resume_url.startsWith('[Will be generated');

  const updateCandidate = (field, value) => {
    setCandidate(prev => ({ ...prev, [field]: value }));
  };

  // Experience management functions
  const addExperience = () => {
    const newExperience = {
      id: Date.now(),
      company: '',
      position: '',
      certificate_url: ''
    };
    setCandidate(prev => ({
      ...prev,
      experiences: [...prev.experiences, newExperience]
    }));
  };

  const removeExperience = (experienceId) => {
    setCandidate(prev => ({
      ...prev,
      experiences: prev.experiences.filter(exp => exp.id !== experienceId)
    }));
    // Clean up file states
    setExperienceFiles(prev => {
      const newFiles = { ...prev };
      delete newFiles[experienceId];
      return newFiles;
    });
    setUploadingExperience(prev => {
      const newUploading = { ...prev };
      delete newUploading[experienceId];
      return newUploading;
    });
  };

  const updateExperience = (experienceId, field, value) => {
    setCandidate(prev => ({
      ...prev,
      experiences: prev.experiences.map(exp =>
        exp.id === experienceId ? { ...exp, [field]: value } : exp
      )
    }));
  };

  const handleExperienceCertificateUpload = async (experienceId, file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      showNotification('Please upload only PDF, JPG, or PNG files for certificates', 'error');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showNotification('Certificate file size must be less than 5MB', 'error');
      return;
    }

    setExperienceFiles(prev => ({ ...prev, [experienceId]: file }));
    setUploadingExperience(prev => ({ ...prev, [experienceId]: true }));

    try {
      // Upload file to cloud storage
      const formData = new FormData();
      formData.append('certificates', file);

      const token = authService.getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/candidates/upload-certificates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data.urls && data.urls[0]) {
          updateExperience(experienceId, 'certificate_url', data.urls[0]);
          showNotification('Certificate uploaded successfully!');
        } else {
          updateExperience(experienceId, 'certificate_url', `File ready: ${file.name}`);
          showNotification('Certificate selected successfully!');
        }
      } else {
        updateExperience(experienceId, 'certificate_url', `File ready: ${file.name}`);
        showNotification('Certificate selected successfully!');
      }
    } catch (error) {
      console.error('Certificate upload failed:', error);
      updateExperience(experienceId, 'certificate_url', `File ready: ${file.name}`);
      showNotification('Certificate selected successfully!');
    } finally {
      setUploadingExperience(prev => ({ ...prev, [experienceId]: false }));
    }
  };

  const removeExperienceCertificate = (experienceId) => {
    updateExperience(experienceId, 'certificate_url', '');
    setExperienceFiles(prev => {
      const newFiles = { ...prev };
      delete newFiles[experienceId];
      return newFiles;
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className={`bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 animate-in zoom-in-95 ${isUploadingPreview ? 'opacity-90' : ''}`}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center text-xl">
                  <User className="w-5 h-5 mr-2" />
                  {title || (mode === 'view' ? 'View Candidate' : mode === 'edit' ? 'Edit Candidate' : 'Add Candidate')}
                </CardTitle>
                <CardDescription>
                  {selectedJob
                    ? `${mode === 'view' ? 'View' : mode === 'edit' ? 'Edit' : 'Add'} candidate ${selectedJob.name ? `for ${selectedJob.name}` : ''}`
                    : `${mode === 'view' ? 'View' : mode === 'edit' ? 'Edit' : 'Create'} candidate profile`
                  }
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-8 w-8 p-0"
                disabled={isUploadingPreview}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="relative">
            {isUploadingPreview && (
              <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
                <div className="text-center">
                  <Loader2 className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Uploading resume and parsing with AI...</p>
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Resume Upload Section - Only show in create/edit mode */}
              {mode !== 'view' && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Resume Upload</Label>
                  {resumeFile ? (
                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-center">
                        <FileText className="w-4 h-4 text-green-600 mr-2" />
                        <span className="text-sm text-green-800">{resumeFile.name}</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={removeResume}
                        className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={handleResumeUpload}
                        className="hidden"
                        id="resume-upload"
                        disabled={isUploadingPreview}
                      />
                      <label htmlFor="resume-upload" className="block">
                        <div className={`w-full cursor-pointer inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isUploadingPreview ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <Upload className="w-4 h-4 mr-2" />
                          {isUploadingPreview ? 'Uploading...' : 'Choose Resume File'}
                        </div>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">PDF, DOC, DOCX (Max 10MB)</p>
                    </div>
                  )}
                </div>
              )}

              {/* Personal Information */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <Label className="text-sm font-medium">Personal Information</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={candidate.name || ''}
                      onChange={(e) => updateCandidate('name', e.target.value)}
                      required={mode !== 'view'}
                      placeholder="Full name"
                      disabled={mode === 'view' || isUploadingPreview}
                      className={isUploadingPreview ? 'bg-gray-100' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={candidate.email || ''}
                      onChange={(e) => updateCandidate('email', e.target.value)}
                      required={mode !== 'view'}
                      placeholder="email@example.com"
                      disabled={mode === 'view' || isUploadingPreview}
                      className={isUploadingPreview ? 'bg-gray-100' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact">Contact</Label>
                    <Input
                      id="contact"
                      value={candidate.contact || ''}
                      onChange={(e) => updateCandidate('contact', e.target.value)}
                      placeholder="+1234567890"
                      disabled={mode === 'view' || isUploadingPreview}
                      className={isUploadingPreview ? 'bg-gray-100' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="resume_url">Resume Link *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="resume_url"
                        type="url"
                        value={candidate.resume_url || ''}
                        onChange={(e) => updateCandidate('resume_url', e.target.value)}
                        placeholder={mode === 'view' ? 'No resume URL' : "Upload a file above or enter URL manually"}
                        disabled={mode === 'view' || !!resumeFile || isUploadingPreview}
                        className={`${candidate.resume_url && candidate.resume_url !== 'Uploading...' && !candidate.resume_url.startsWith('File ready:') ? 'bg-green-50 border-green-200' : ''}`}
                      />
                      {mode === 'view' && candidate.resume_url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(candidate.resume_url, '_blank')}
                          className="flex items-center gap-1"
                        >
                          <FileText className="w-4 h-4" />
                          View
                        </Button>
                      )}
                    </div>
                    {mode !== 'view' && (
                      <p className="text-xs text-gray-500 mt-1">
                        {isUploadingPreview
                          ? 'Uploading file and generating URL...'
                          : resumeFile
                            ? `File uploaded: ${resumeFile.name}`
                            : 'Upload a resume file above to auto-generate URL, or enter manually'
                        }
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Educational Information */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <GraduationCap className="w-4 h-4 text-gray-500" />
                  <Label className="text-sm font-medium">Educational Information</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="college_name">College/University</Label>
                    <Input
                      id="college_name"
                      value={candidate.college_name || ''}
                      onChange={(e) => updateCandidate('college_name', e.target.value)}
                      placeholder="e.g., IIT Delhi, BITS Pilani"
                      disabled={mode === 'view'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="degree">Degree</Label>
                    <Input
                      id="degree"
                      value={candidate.degree || ''}
                      onChange={(e) => updateCandidate('degree', e.target.value)}
                      placeholder="e.g., BTech, MTech, MBA"
                      disabled={mode === 'view'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="graduation_year">Graduation Year</Label>
                    <Input
                      id="graduation_year"
                      type="number"
                      value={candidate.graduation_year || ''}
                      onChange={(e) => updateCandidate('graduation_year', e.target.value)}
                      placeholder="e.g., 2024"
                      min="1990"
                      max="2030"
                      disabled={mode === 'view'}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="educations">Other Education Details</Label>
                  <textarea
                    id="educations"
                    className={`w-full p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${mode === 'view' ? 'bg-gray-50' : ''}`}
                    rows={3}
                    value={candidate.educations || ''}
                    onChange={(e) => updateCandidate('educations', e.target.value)}
                    placeholder={mode === 'view' ? 'No additional education details' : "Additional education details, certifications, courses, online programs, etc."}
                    disabled={mode === 'view'}
                  />
                </div>
              </div>

              {/* Professional Information */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Briefcase className="w-4 h-4 text-gray-500" />
                  <Label className="text-sm font-medium">Professional Information</Label>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="years_experience">Years of Experience</Label>
                    <Input
                      id="years_experience"
                      type="number"
                      min="0"
                      value={candidate.years_experience || 0}
                      onChange={(e) => updateCandidate('years_experience', parseInt(e.target.value) || 0)}
                      placeholder="0"
                      disabled={mode === 'view'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="skills_summary">Skills Summary</Label>
                    <textarea
                      id="skills_summary"
                      className={`w-full p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${mode === 'view' ? 'bg-gray-50' : ''}`}
                      rows={3}
                      value={candidate.skills_summary || ''}
                      onChange={(e) => updateCandidate('skills_summary', e.target.value)}
                      placeholder={mode === 'view' ? 'No skills summary' : "List key skills and technologies"}
                      disabled={mode === 'view'}
                    />
                  </div>
                  {/* Work Experiences */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Work Experiences</Label>
                      {mode !== 'view' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addExperience}
                          className="flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Add Experience
                        </Button>
                      )}
                    </div>

                    {candidate.experiences.length === 0 ? (
                      <div className="text-sm text-gray-500 italic p-4 border border-dashed border-gray-300 rounded-md text-center">
                        {mode === 'view' ? 'No work experiences added' : 'No work experiences added. Click "Add Experience" to get started.'}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {candidate.experiences.map((experience, index) => (
                          <div key={experience.id} className="border border-gray-200 rounded-md p-4 bg-gray-50">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-gray-900">Experience {index + 1}</h4>
                              {mode !== 'view' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeExperience(experience.id)}
                                  className="text-red-600 hover:text-red-800 h-6 w-6 p-0"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div>
                                <Label htmlFor={`company-${experience.id}`} className="text-xs">Company Name</Label>
                                <Input
                                  id={`company-${experience.id}`}
                                  value={experience.company || ''}
                                  onChange={(e) => updateExperience(experience.id, 'company', e.target.value)}
                                  placeholder="Company name"
                                  disabled={mode === 'view'}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`position-${experience.id}`} className="text-xs">Position</Label>
                                <Input
                                  id={`position-${experience.id}`}
                                  value={experience.position || ''}
                                  onChange={(e) => updateExperience(experience.id, 'position', e.target.value)}
                                  placeholder="Job position/title"
                                  disabled={mode === 'view'}
                                  className="mt-1"
                                />
                              </div>
                            </div>

                            {/* Certificate Upload */}
                            {mode !== 'view' && (
                              <div className="mb-3">
                                <Label className="text-xs">Certificate (Optional)</Label>
                                {experienceFiles[experience.id] ? (
                                  <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-md mt-1">
                                    <div className="flex items-center">
                                      <FileText className="w-4 h-4 text-green-600 mr-2" />
                                      <span className="text-sm text-green-800">{experienceFiles[experience.id].name}</span>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeExperienceCertificate(experience.id)}
                                      className="h-5 w-5 p-0 text-green-600 hover:text-green-800"
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="mt-1">
                                    <input
                                      type="file"
                                      accept=".pdf,.jpg,.jpeg,.png"
                                      onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) handleExperienceCertificateUpload(experience.id, file);
                                      }}
                                      className="hidden"
                                      id={`certificate-${experience.id}`}
                                      disabled={uploadingExperience[experience.id]}
                                    />
                                    <label htmlFor={`certificate-${experience.id}`} className="block">
                                      <div className={`w-full cursor-pointer inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 ${uploadingExperience[experience.id] ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <Upload className="w-3 h-3 mr-1" />
                                        {uploadingExperience[experience.id] ? 'Uploading...' : 'Upload Certificate'}
                                      </div>
                                    </label>
                                    <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG (Max 5MB)</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Certificate URL Display */}
                            {experience.certificate_url && (
                              <div className="mt-2">
                                <Label className="text-xs">Certificate</Label>
                                <div className="flex items-center gap-2 mt-1">
                                  <Input
                                    value={experience.certificate_url}
                                    disabled
                                    className="text-xs bg-green-50 border-green-200"
                                  />
                                  {experience.certificate_url.startsWith('http') && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => window.open(experience.certificate_url, '_blank')}
                                      className="flex items-center gap-1"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      View
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="remarks">Remarks</Label>
                    <textarea
                      id="remarks"
                      className={`w-full p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${mode === 'view' ? 'bg-gray-50' : ''}`}
                      rows={2}
                      value={candidate.remarks || ''}
                      onChange={(e) => updateCandidate('remarks', e.target.value)}
                      placeholder={mode === 'view' ? 'No remarks' : "Additional notes or remarks"}
                      disabled={mode === 'view'}
                    />
                  </div>
                </div>
              </div>

              {/* Form Validation Message */}
              {mode !== 'view' && !isFormValid && (
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                  <strong>Required:</strong> Name, Email, and Resume URL (upload a file to auto-generate)
                  {isUploadingPreview && <div className="mt-1">⏳ Uploading resume...</div>}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-4">
                {mode === 'view' ? (
                  <Button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 transition-all duration-200 hover:scale-105"
                  >
                    Close
                  </Button>
                ) : (
                  <>
                    <Button
                      type="submit"
                      disabled={isUploading || !isFormValid || isUploadingPreview}
                      className="flex-1 transition-all duration-200 hover:scale-105"
                    >
                      {isUploading
                        ? (mode === 'edit' ? 'Updating...' : 'Adding...')
                        : isUploadingPreview
                          ? 'Processing Resume...'
                          : (mode === 'edit' ? 'Update Candidate' : 'Add Candidate')
                      }
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={isUploadingPreview}
                      className="flex-1 transition-all duration-200 hover:scale-105"
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}