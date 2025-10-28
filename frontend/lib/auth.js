const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const authService = {
  async login(email, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');
    
    // Store in sessionStorage instead of localStorage for session-based auth
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('user', JSON.stringify(data.user));
    sessionStorage.setItem('loginTime', Date.now().toString());
    
    return data;
  },

  async adminLogin(email, password) {
    const response = await fetch(`${API_URL}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Admin login failed');

    // Store same as normal session for app-wide guards
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('user', JSON.stringify(data.user));
    sessionStorage.setItem('loginTime', Date.now().toString());

    return data;
  },

  async logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('loginTime');
  },

  getToken() {
    if (typeof window !== 'undefined') {
      // Check if session has expired (4 hours)
      const loginTime = sessionStorage.getItem('loginTime');
      if (loginTime) {
        const fourHours = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
        if (Date.now() - parseInt(loginTime) > fourHours) {
          this.logout();
          return null;
        }
      }
      return sessionStorage.getItem('token');
    }
    return null;
  },

  getUser() {
    if (typeof window !== 'undefined') {
      // Check if session has expired
      const loginTime = sessionStorage.getItem('loginTime');
      if (loginTime) {
        const fourHours = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
        if (Date.now() - parseInt(loginTime) > fourHours) {
          this.logout();
          return null;
        }
      }
      
      const user = sessionStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    }
    return null;
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  // Check if user session is still valid
  isSessionValid() {
    if (typeof window !== 'undefined') {
      const loginTime = sessionStorage.getItem('loginTime');
      if (!loginTime) return false;
      
      const fourHours = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      return Date.now() - parseInt(loginTime) <= fourHours;
    }
    return false;
  },

  // Get remaining session time in minutes
  getSessionTimeRemaining() {
    if (typeof window !== 'undefined') {
      const loginTime = sessionStorage.getItem('loginTime');
      if (!loginTime) return 0;
      
      const fourHours = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      const elapsed = Date.now() - parseInt(loginTime);
      const remaining = fourHours - elapsed;
      
      return Math.max(0, Math.floor(remaining / (60 * 1000))); // Return minutes
    }
    return 0;
  },

  hasRole(role) {
    const user = this.getUser();
    return !!(user && user.roles && user.roles.includes(role));
  },

  async fetchWithAuth(url, options = {}) {
    const token = this.getToken();
    const isFormData = typeof FormData !== 'undefined' && options && options.body instanceof FormData;
    const config = {
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    };
    if (!isFormData) {
      // Only set JSON content type if not already provided and body isn't FormData
      if (!config.headers['Content-Type'] && !config.headers['content-type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }
    if (token) config.headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_URL}${url}`, config);
    if (response.status === 401) {
      this.logout();
      if (typeof window !== 'undefined') window.location.href = '/';
      return response;
    }
    return response;
  },

  async resetPassword(email, newPassword, confirmPassword) {
    const response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, newPassword, confirmPassword })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to reset password');
    return data;
  },

  async requestPasswordReset(email) {
    const response = await fetch(`${API_URL}/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to request password reset');
    return data;
  },

  async resetPasswordWithToken(token, newPassword, confirmPassword) {
    const response = await fetch(`${API_URL}/auth/reset-password-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword, confirmPassword })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to reset password');
    return data;
  },
};

export const userService = {
  async getUsers() {
    const response = await authService.fetchWithAuth('/users');
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
  },

  async createUser(userData) {
    const response = await authService.fetchWithAuth('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create user');
    return data;
  },

  async updateUserStatus(userId, status) {
    const response = await authService.fetchWithAuth(`/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update user status');
    return data;
  },

  async deleteUser(userId) {
    const response = await authService.fetchWithAuth(`/users/${userId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete user');
    return data;
  },

  async updateUser(userId, userData) {
    const response = await authService.fetchWithAuth(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update user');
    return data;
  },

  async updateUserRoles(userId, roleIds) {
    const response = await authService.fetchWithAuth(`/users/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update user roles');
    return data;
  },
};

export const roleService = {
  async getRoles() {
    const response = await authService.fetchWithAuth('/roles');
    if (!response.ok) throw new Error('Failed to fetch roles');
    return response.json();
  },

  async createRole(roleData) {
    const response = await authService.fetchWithAuth('/roles', {
      method: 'POST',
      body: JSON.stringify(roleData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create role');
    return data;
  },

  async updateRole(roleId, roleData) {
    const response = await authService.fetchWithAuth(`/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(roleData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update role');
    return data;
  },

  async deleteRole(roleId) {
    const response = await authService.fetchWithAuth(`/roles/${roleId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete role');
    return data;
  },
};

export const jobService = {
  async getJobs(status = 'active') {
    const response = await authService.fetchWithAuth(`/jobs?status=${status}`);
    if (!response.ok) throw new Error('Failed to fetch jobs');
    return response.json();
  },

  async getJob(jobId) {
    const response = await authService.fetchWithAuth(`/jobs/${jobId}`);
    if (!response.ok) throw new Error('Failed to fetch job');
    return response.json();
  },

  async createJob(jobData) {
    const response = await authService.fetchWithAuth('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create job');
    return data;
  },

  async updateJob(jobId, jobData) {
    const response = await authService.fetchWithAuth(`/jobs/${jobId}`, {
      method: 'PUT',
      body: JSON.stringify(jobData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update job');
    return data;
  },

  async updateJobStatus(jobId, status) {
    const response = await authService.fetchWithAuth(`/jobs/${jobId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update job status');
    return data;
  },

  async deleteJob(jobId) {
    const response = await authService.fetchWithAuth(`/jobs/${jobId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete job');
    return data;
  },

  async getJobsForInterviewer(status = 'active', interviewerId) {
    const response = await authService.fetchWithAuth(`/jobs/interviewer/${interviewerId}?status=${status}`);
    if (!response.ok) throw new Error('Failed to fetch jobs for interviewer');
    return response.json();
  },
};

export const candidateService = {
  async getCandidatesByRound(roundId, status = null) {
    const url = status ? `/candidates/round/${roundId}?status=${status}` : `/candidates/round/${roundId}`;
    const response = await authService.fetchWithAuth(url);
    if (!response.ok) throw new Error('Failed to fetch candidates');
    return response.json();
  },

  async getInterviewers() {
    const response = await authService.fetchWithAuth('/candidates/interviewers');
    if (!response.ok) throw new Error('Failed to fetch interviewers');
    return response.json();
  },

  async uploadResumes(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append('resumes', files[i]);
    const response = await authService.fetchWithAuth('/candidates/upload-resumes', {
      method: 'POST',
      body: formData,
      headers: {},
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to parse resumes');
    return data;
  },

  async createCandidates(candidates, roundId) {
    const response = await authService.fetchWithAuth('/candidates', {
      method: 'POST',
      body: JSON.stringify({ candidates, roundId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create candidates');
    return data;
  },

  async createCandidatesWithFiles(formData) {
    const response = await authService.fetchWithAuth('/candidates', {
      method: 'POST',
      body: formData,
      headers: {}, // Don't set Content-Type for FormData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create candidates');
    return data;
  },

  async updateCandidateStatus(candidateId, roundId, status) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update candidate status');
    return data;
  },

  async assignInterviewers(candidateId, roundId, interviewerIds) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/assign-interviewers`, {
      method: 'POST',
      body: JSON.stringify({ interviewerIds }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to assign interviewers');
    return data;
  },

  async nextCandidateStatus(candidateId, roundId) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/next`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update candidate status');
    return data;
  },

  async rejectCandidate(candidateId, roundId, reason = null) {
    const endpoint = reason 
      ? `/candidates/${candidateId}/round/${roundId}/reject-with-reason`
      : `/candidates/${candidateId}/round/${roundId}/reject`;
    
    const body = reason ? JSON.stringify({ reason }) : undefined;
    
    const response = await authService.fetchWithAuth(endpoint, {
      method: 'POST',
      body,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to reject candidate');
    return data;
  },

  async moveCandidateToFresh(candidateId, roundId) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/move-to-fresh`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to move candidate to fresh');
    return data;
  },

  async updateCandidateRemarks(candidateId, roundId, remarks) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/remarks`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update remarks');
    return data;
  },

  async updateCandidateEvaluation(candidateId, roundId, evaluationScores, feedback) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/evaluation`, {
      method: 'PUT',
      body: JSON.stringify({ evaluationScores, feedback }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update evaluation');
    return data;
  },

  async getCandidatesByRoundAndInterviewer(roundId, interviewerId) {
    const response = await authService.fetchWithAuth(`/candidates/round/${roundId}/interviewer/${interviewerId}`);
    if (!response.ok) throw new Error('Failed to fetch candidates for interviewer');
    return response.json();
  },

  async updateMultiInterviewerEvaluation(candidateId, roundId, allEvaluations) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/multi-evaluation`, {
      method: 'PUT',
      body: JSON.stringify({ allEvaluations }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update multi-interviewer evaluation');
    return data;
  },

  async getAssignedInterviewers(candidateId, roundId) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}/interviewers`);
    if (!response.ok) throw new Error('Failed to fetch assigned interviewers');
    return response.json();
  },

  async deleteCandidate(candidateId) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete candidate');
    return data;
  },

  async getRoundCounts(roundId) {
    const response = await authService.fetchWithAuth(`/candidates/round/${roundId}/counts`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch round counts');
    return data; // { counts: { fresh, in_progress, scheduled, completed, rejected } }
  },

  async deleteFromRound(candidateId, roundId) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/round/${roundId}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to remove candidate from round');
    return data;
  },

  // Candidate Management Methods
  async getAllCandidates(status = 'active') {
    const response = await authService.fetchWithAuth(`/candidates?status=${status}`);
    if (!response.ok) throw new Error('Failed to fetch candidates');
    return response.json();
  },

  async createStandaloneCandidate(candidateData) {
    const response = await authService.fetchWithAuth('/candidates/standalone', {
      method: 'POST',
      body: JSON.stringify(candidateData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create candidate');
    return data;
  },

  async updateCandidate(candidateId, candidateData) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}`, {
      method: 'PUT',
      body: JSON.stringify(candidateData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update candidate');
    return data;
  },

  async updateCandidateStatus(candidateId, status) {
    const response = await authService.fetchWithAuth(`/candidates/${candidateId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update candidate status');
    return data;
  },

  async addExistingCandidatesToJob(candidateIds, roundId) {
    const response = await authService.fetchWithAuth('/candidates/add-to-round', {
      method: 'POST',
      body: JSON.stringify({ candidateIds, roundId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to add candidates to job');
    return data;
  },

  async getAvailableCandidatesForJob(jobId) {
    const response = await authService.fetchWithAuth(`/candidates/available-for-job/${jobId}`);
    if (!response.ok) throw new Error('Failed to fetch available candidates');
    return response.json();
  },

  async getFinalOffers() {
    const response = await authService.fetchWithAuth('/candidates/offers');
    if (!response.ok) throw new Error('Failed to fetch final offers');
    return response.json();
  },
};
