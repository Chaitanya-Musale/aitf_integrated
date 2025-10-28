const pool = require('../config/database');
const { updateCandidateInRoundSheet, removeCandidateFromRoundSheet } = require('../utils/sheets');

class SheetSyncService {
  // Queue to handle concurrent sheet sync requests
  static syncQueue = [];
  static isProcessing = false;
  static MAX_RETRIES = 3;
  static RETRY_DELAY = 1000; // 1 second
  static RATE_LIMIT_DELAY = 800; // Increased to 800ms to handle fast updates better
  static DEBOUNCE_DELAY = 2000; // 2 seconds debounce for fast updates
  static pendingUpdates = new Map(); // Track pending updates by candidate+round

  // Add sync request to queue with debouncing for fast updates
  static async syncCandidateToSheet(candidateId, roundId) {
    const updateKey = `${candidateId}-${roundId}`;
    
    // Cancel any existing pending update for this candidate+round
    if (this.pendingUpdates.has(updateKey)) {
      clearTimeout(this.pendingUpdates.get(updateKey).timeout);
      this.pendingUpdates.get(updateKey).reject(new Error('Superseded by newer update'));
    }

    return new Promise((resolve, reject) => {
      const syncRequest = {
        type: 'sync',
        candidateId,
        roundId,
        resolve,
        reject,
        retries: 0,
        timestamp: Date.now()
      };

      // Debounce fast updates
      const timeout = setTimeout(() => {
        this.pendingUpdates.delete(updateKey);
        this.syncQueue.push(syncRequest);
        console.log(`📥 Added sync request to queue: candidate ${candidateId}, round ${roundId} (queue size: ${this.syncQueue.length})`);
        
        // Start processing if not already running
        if (!this.isProcessing) {
          this.processQueue();
        }
      }, this.DEBOUNCE_DELAY);

      this.pendingUpdates.set(updateKey, { timeout, resolve, reject });
      console.log(`⏱️ Debouncing update for candidate ${candidateId}, round ${roundId}`);
    });
  }

  // Process queue sequentially with rate limiting and retry logic
  static async processQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log(`🔄 Starting queue processing with ${this.syncQueue.length} requests`);

    while (this.syncQueue.length > 0) {
      const request = this.syncQueue.shift();
      
      try {
        console.log(`⚡ Processing ${request.type} request (attempt ${request.retries + 1}/${this.MAX_RETRIES + 1})`);
        
        let result;
        if (request.type === 'sync') {
          result = await this.executeSyncRequest(request.candidateId, request.roundId);
        } else if (request.type === 'remove') {
          result = await this.executeRemoveRequest(request.candidateEmail, request.roundId);
        }

        if (result) {
          console.log(`✅ Successfully processed ${request.type} request`);
          request.resolve(result);
        } else {
          throw new Error(`Failed to process ${request.type} request`);
        }

        // Rate limiting: wait between requests to avoid API limits
        if (this.syncQueue.length > 0) {
          await this.delay(this.RATE_LIMIT_DELAY);
        }

      } catch (error) {
        console.error(`❌ Error processing ${request.type} request:`, error.message);
        
        // Retry logic
        if (request.retries < this.MAX_RETRIES) {
          request.retries++;
          console.log(`🔄 Retrying ${request.type} request (attempt ${request.retries + 1}/${this.MAX_RETRIES + 1})`);
          
          // Add back to front of queue for immediate retry after delay
          this.syncQueue.unshift(request);
          await this.delay(this.RETRY_DELAY * request.retries); // Exponential backoff
        } else {
          console.error(`💥 Max retries exceeded for ${request.type} request`);
          request.reject(new Error(`Max retries exceeded: ${error.message}`));
        }
      }
    }

    this.isProcessing = false;
    console.log(`✅ Queue processing completed`);
  }

  // Helper method for delays
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Execute the actual sync request (original logic)
  static async executeSyncRequest(candidateId, roundId) {
    try {
      // Get candidate and round information with interviewer names
      const candidateQuery = `
        SELECT c.*, cr.status as round_status, cr.scheduled_time, cr.feedback, 
               cr.rejection_reason, cr.evaluation_scores, cr.assigned_interviewers,
               COALESCE(
                 (SELECT array_agg(u.name) 
                  FROM interview_assignments ia 
                  JOIN users u ON ia.interviewer_id = u.id 
                  WHERE ia.candidate_id = c.id AND ia.round_id = cr.round_id), 
                 ARRAY[]::text[]
               ) as interviewer_names
        FROM candidates c
        JOIN candidate_rounds cr ON c.id = cr.candidate_id
        WHERE c.id = $1 AND cr.round_id = $2
      `;

      const roundQuery = `
        SELECT ir.*, j.name as job_name, j.sheet_id
        FROM interview_rounds ir
        JOIN jobs j ON ir.job_id = j.id
        WHERE ir.id = $1
      `;

      const [candidateResult, roundResult] = await Promise.all([
        pool.query(candidateQuery, [candidateId, roundId]),
        pool.query(roundQuery, [roundId])
      ]);

      if (candidateResult.rows.length === 0 || roundResult.rows.length === 0) {
        console.warn('Candidate or round not found for sheet sync');
        return false;
      }

      const candidate = candidateResult.rows[0];
      const round = roundResult.rows[0];

      // Check if we have a sheet_id for the job
      if (!round.sheet_id) {
        console.warn('No sheet ID found for job - cannot sync');
        return false;
      }

      // Parse evaluation scores (handle both old and new format)
      let evaluationScores = [];
      let evaluationsByInterviewer = {};
      try {
        const rawScores = typeof candidate.evaluation_scores === 'string'
          ? JSON.parse(candidate.evaluation_scores)
          : candidate.evaluation_scores || [];

        // Check if it's the new multi-interviewer format
        if (typeof rawScores === 'object' && !Array.isArray(rawScores)) {
          evaluationsByInterviewer = rawScores;
          
          // Enrich with interviewer names
          if (candidate.interviewer_names && candidate.interviewer_names.length > 0) {
            // Get interviewer ID to name mapping
            const interviewerQuery = `
              SELECT ia.interviewer_id, u.name
              FROM interview_assignments ia
              JOIN users u ON ia.interviewer_id = u.id
              WHERE ia.candidate_id = $1 AND ia.round_id = $2
            `;
            const interviewerResult = await pool.query(interviewerQuery, [candidateId, roundId]);
            const interviewerMap = {};
            interviewerResult.rows.forEach(row => {
              interviewerMap[row.interviewer_id] = row.name;
            });
            
            // Add interviewer names to evaluation data
            Object.keys(evaluationsByInterviewer).forEach(interviewerId => {
              if (evaluationsByInterviewer[interviewerId] && interviewerMap[interviewerId]) {
                evaluationsByInterviewer[interviewerId].interviewer_name = interviewerMap[interviewerId];
              }
            });
          }
          
          // For backward compatibility, combine all scores for the main evaluationScores
          evaluationScores = [];
          Object.values(rawScores).forEach(interviewerEval => {
            if (interviewerEval.scores) {
              evaluationScores = evaluationScores.concat(interviewerEval.scores);
            }
          });
        } else if (Array.isArray(rawScores)) {
          // Legacy format
          evaluationScores = rawScores;
        }
      } catch (e) {
        console.warn('Error parsing evaluation scores:', e);
      }

      // Get interviewer names (use actual names from database, not IDs)
      let interviewers = '';
      if (candidate.interviewer_names && candidate.interviewer_names.length > 0) {
        interviewers = candidate.interviewer_names.join(', ');
      }

      // Prepare candidate data for sheet
      const candidateData = {
        name: candidate.name,
        email: candidate.email,
        status: candidate.round_status,
        interviewers: interviewers,
        scheduledTime: candidate.scheduled_time ?
          new Date(candidate.scheduled_time).toLocaleString() : '',
        resumeUrl: candidate.resume_url || '',
        yearsExperience: candidate.years_experience,
        skillsSummary: candidate.skills_summary || '',
        feedback: candidate.feedback || '',
        rejectionReason: candidate.rejection_reason || '',
        evaluationScores: evaluationScores,
        evaluationsByInterviewer: evaluationsByInterviewer
      };

      // Generate tab name for individual sheets (Round_X_Name format)
      const tabName = `Round_${round.round_order}_${round.name.replace(/\s+/g, '_')}`;

      // Update sheet using the job's individual sheet ID
      console.log(`🔄 Attempting to sync candidate ${candidate.email} to sheet ${round.sheet_id}, tab ${tabName} with status: ${candidate.round_status}`);
      console.log(`📊 Candidate data:`, JSON.stringify(candidateData, null, 2));
      
      const success = await updateCandidateInRoundSheet(round.sheet_id, tabName, candidateData);

      if (success) {
        console.log(`✅ Successfully synced candidate ${candidate.email} to sheet ${round.sheet_id}, tab ${tabName} with status: ${candidate.round_status}`);
      } else {
        console.error(`❌ Failed to sync candidate ${candidate.email} to sheet ${round.sheet_id}, tab ${tabName}`);
      }

      return success;
    } catch (error) {
      console.error('Error syncing candidate to sheet:', error);
      return false;
    }
  }

  // Add remove request to queue
  static async removeCandidateFromSheet(candidateEmail, roundId) {
    return new Promise((resolve, reject) => {
      const removeRequest = {
        type: 'remove',
        candidateEmail,
        roundId,
        resolve,
        reject,
        retries: 0,
        timestamp: Date.now()
      };

      this.syncQueue.push(removeRequest);
      console.log(`📥 Added remove request to queue: candidate ${candidateEmail}, round ${roundId} (queue size: ${this.syncQueue.length})`);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  // Execute the actual remove request (original logic)
  static async executeRemoveRequest(candidateEmail, roundId) {
    try {
      const roundQuery = `
        SELECT ir.*, j.name as job_name, j.sheet_id
        FROM interview_rounds ir
        JOIN jobs j ON ir.job_id = j.id
        WHERE ir.id = $1
      `;

      const roundResult = await pool.query(roundQuery, [roundId]);

      if (roundResult.rows.length === 0) {
        console.warn('Round not found for sheet removal');
        return false;
      }

      const round = roundResult.rows[0];
      
      if (!round.sheet_id) {
        console.warn('No sheet ID found for job - cannot remove');
        return false;
      }

      const tabName = `Round_${round.round_order}_${round.name.replace(/\s+/g, '_')}`;

      const success = await removeCandidateFromRoundSheet(round.sheet_id, tabName, candidateEmail);

      if (success) {
        console.log(`✅ Removed candidate ${candidateEmail} from sheet ${round.sheet_id}, tab ${tabName}`);
      }

      return success;
    } catch (error) {
      console.error('Error removing candidate from sheet:', error);
      return false;
    }
  }

  // Sync all candidates for a specific round
  static async syncAllCandidatesForRound(roundId) {
    try {
      const candidatesQuery = `
        SELECT c.id, c.email
        FROM candidates c
        JOIN candidate_rounds cr ON c.id = cr.candidate_id
        WHERE cr.round_id = $1
      `;

      const result = await pool.query(candidatesQuery, [roundId]);

      const syncPromises = result.rows.map(candidate =>
        this.syncCandidateToSheet(candidate.id, roundId)
      );

      const results = await Promise.allSettled(syncPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

      console.log(`✅ Synced ${successCount}/${result.rows.length} candidates for round ${roundId}`);
      return successCount;
    } catch (error) {
      console.error('Error syncing all candidates for round:', error);
      return 0;
    }
  }

  // Get queue status for monitoring
  static getQueueStatus() {
    return {
      queueLength: this.syncQueue.length,
      isProcessing: this.isProcessing,
      oldestRequest: this.syncQueue.length > 0 ? {
        type: this.syncQueue[0].type,
        timestamp: this.syncQueue[0].timestamp,
        retries: this.syncQueue[0].retries
      } : null
    };
  }

  // Clear queue (for emergency situations)
  static clearQueue() {
    const clearedCount = this.syncQueue.length;
    this.syncQueue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.syncQueue = [];
    console.log(`🧹 Cleared ${clearedCount} requests from sync queue`);
    return clearedCount;
  }

  // Sync all candidates for a job (all rounds)
  static async syncAllCandidatesForJob(jobId) {
    try {
      const roundsQuery = `
        SELECT id FROM interview_rounds WHERE job_id = $1 ORDER BY round_order
      `;

      const roundsResult = await pool.query(roundsQuery, [jobId]);

      let totalSynced = 0;
      for (const round of roundsResult.rows) {
        const synced = await this.syncAllCandidatesForRound(round.id);
        totalSynced += synced;
      }

      console.log(`✅ Synced ${totalSynced} total candidates for job ${jobId}`);
      return totalSynced;
    } catch (error) {
      console.error('Error syncing all candidates for job:', error);
      return 0;
    }
  }

  // Manual sync all real candidates from database to sheets
  static async syncAllRealCandidates() {
    try {
      console.log('🔄 Starting manual sync of all real candidates from database...');
      
      // Get all candidates with their round and job information
      const candidatesResult = await pool.query(`
        SELECT 
          c.*,
          cr.status as round_status,
          cr.scheduled_time,
          cr.feedback,
          cr.rejection_reason,
          cr.evaluation_scores,
          cr.assigned_interviewers,
          ir.id as round_id,
          ir.name as round_name,
          ir.round_order,
          ir.sheet_url,
          j.name as job_name,
          j.id as job_id,
          j.sheet_id as job_sheet_id
        FROM candidates c
        JOIN candidate_rounds cr ON c.id = cr.candidate_id
        JOIN interview_rounds ir ON cr.round_id = ir.id
        JOIN jobs j ON ir.job_id = j.id
        WHERE j.sheet_id IS NOT NULL
        ORDER BY j.name, ir.round_order, c.name
      `);
      
      console.log(`📊 Found ${candidatesResult.rows.length} candidate records to sync`);
      
      // Group candidates by sheet and tab for better organization
      const candidatesBySheetAndTab = {};
      
      for (const candidate of candidatesResult.rows) {
        // Generate tab name for individual sheets
        const tabName = `Round_${candidate.round_order}_${candidate.round_name.replace(/\s+/g, '_')}`;
        const sheetId = candidate.job_sheet_id;
        
        const key = `${sheetId}:${tabName}`;
        if (!candidatesBySheetAndTab[key]) {
          candidatesBySheetAndTab[key] = {
            sheetId: sheetId,
            tabName: tabName,
            jobName: candidate.job_name,
            candidates: []
          };
        }
        
        // Parse evaluation scores (handle both old and new format)
        let evaluationScores = [];
        let evaluationsByInterviewer = {};
        try {
          const rawScores = typeof candidate.evaluation_scores === 'string' 
            ? JSON.parse(candidate.evaluation_scores) 
            : candidate.evaluation_scores || [];

          // Check if it's the new multi-interviewer format
          if (typeof rawScores === 'object' && !Array.isArray(rawScores)) {
            evaluationsByInterviewer = rawScores;
            
            // Enrich with interviewer names if not already present
            const interviewerIds = Object.keys(rawScores);
            if (interviewerIds.length > 0) {
              try {
                const interviewerQuery = `
                  SELECT ia.interviewer_id, u.name
                  FROM interview_assignments ia
                  JOIN users u ON ia.interviewer_id = u.id
                  WHERE ia.candidate_id = $1 AND ia.round_id = $2
                `;
                const interviewerResult = await pool.query(interviewerQuery, [candidate.id, candidate.round_id]);
                const interviewerMap = {};
                interviewerResult.rows.forEach(row => {
                  interviewerMap[row.interviewer_id] = row.name;
                });
                
                // Add interviewer names to evaluation data
                Object.keys(evaluationsByInterviewer).forEach(interviewerId => {
                  if (evaluationsByInterviewer[interviewerId] && interviewerMap[interviewerId]) {
                    evaluationsByInterviewer[interviewerId].interviewer_name = interviewerMap[interviewerId];
                  }
                });
              } catch (nameError) {
                console.warn('Error fetching interviewer names for', candidate.email, nameError.message);
              }
            }
            
            // For backward compatibility, combine all scores for the main evaluationScores
            evaluationScores = [];
            Object.values(rawScores).forEach(interviewerEval => {
              if (interviewerEval.scores) {
                evaluationScores = evaluationScores.concat(interviewerEval.scores);
              }
            });
          } else if (Array.isArray(rawScores)) {
            // Legacy format
            evaluationScores = rawScores;
          }
        } catch (e) {
          console.warn('Error parsing evaluation scores for', candidate.email);
        }
        
        // Parse assigned interviewers
        let interviewers = '';
        try {
          const assignedInterviewers = typeof candidate.assigned_interviewers === 'string'
            ? JSON.parse(candidate.assigned_interviewers)
            : candidate.assigned_interviewers || [];
          interviewers = Array.isArray(assignedInterviewers) ? assignedInterviewers.join(', ') : '';
        } catch (e) {
          console.warn('Error parsing interviewers for', candidate.email);
        }
        
        // Prepare candidate data for sheet
        const candidateData = {
          name: candidate.name,
          email: candidate.email,
          status: candidate.round_status,
          interviewers: interviewers,
          scheduledTime: candidate.scheduled_time ? 
            new Date(candidate.scheduled_time).toLocaleString() : '',
          resumeUrl: candidate.resume_url || '',
          yearsExperience: candidate.years_experience || 0,
          skillsSummary: candidate.skills_summary || '',
          feedback: candidate.feedback || '',
          rejectionReason: candidate.rejection_reason || '',
          evaluationScores: evaluationScores,
          evaluationsByInterviewer: evaluationsByInterviewer
        };
        
        candidatesBySheetAndTab[key].candidates.push(candidateData);
      }
      
      console.log('📋 Syncing candidates to individual sheets:');
      
      let totalSynced = 0;
      let totalFailed = 0;
      
      // Sync each group to its respective sheet and tab
      for (const [key, sheetData] of Object.entries(candidatesBySheetAndTab)) {
        console.log(`\n📄 Job: ${sheetData.jobName} | Sheet: ${sheetData.sheetId} | Tab: ${sheetData.tabName} (${sheetData.candidates.length} candidates)`);
        
        for (const candidate of sheetData.candidates) {
          console.log(`   Syncing: ${candidate.name} (${candidate.email}) - Status: ${candidate.status}`);
          
          try {
            const success = await updateCandidateInRoundSheet(sheetData.sheetId, sheetData.tabName, candidate);
            
            if (success) {
              console.log(`   ✅ Synced ${candidate.name}`);
              totalSynced++;
            } else {
              console.log(`   ❌ Failed to sync ${candidate.name} - Sheet or tab may not exist`);
              totalFailed++;
            }
            
            // Add delay between syncs to avoid rate limiting
            await this.delay(this.RATE_LIMIT_DELAY);
            
          } catch (error) {
            console.log(`   ❌ Error syncing ${candidate.name}:`, error.message);
            totalFailed++;
          }
        }
      }
      
      console.log(`\n🎉 Manual sync complete! Synced: ${totalSynced}, Failed: ${totalFailed}`);
      console.log('📁 Check your shared drive for individual job sheets');
      
      return { synced: totalSynced, failed: totalFailed };
      
    } catch (error) {
      console.error('❌ Manual sync failed:', error.message);
      throw error;
    }
  }

  // Manual sync with custom candidate data (for testing)
  static async syncCustomCandidates(tabMappings) {
    try {
      console.log('🔄 Starting manual sync with custom candidate data...');

      let totalSynced = 0;
      let totalFailed = 0;

      for (const mapping of tabMappings) {
        console.log(`\n📋 Syncing to tab: ${mapping.tabName}`);

        for (const candidate of mapping.candidates) {
          console.log(`   Adding: ${candidate.name} (${candidate.email})`);

          try {
            const success = await updateCandidateInRoundSheet(mapping.tabName, candidate);

            if (success) {
              console.log(`   ✅ Synced ${candidate.name}`);
              totalSynced++;
            } else {
              console.log(`   ❌ Failed to sync ${candidate.name}`);
              totalFailed++;
            }

            // Add delay between syncs to avoid rate limiting
            await this.delay(this.RATE_LIMIT_DELAY);

          } catch (error) {
            console.log(`   ❌ Error syncing ${candidate.name}:`, error.message);
            totalFailed++;
          }
        }
      }

      console.log(`\n🎉 Custom sync complete! Synced: ${totalSynced}, Failed: ${totalFailed}`);
      console.log('📄 Sheet URL: https://docs.google.com/spreadsheets/d/1HBbyE3F_8OYG3q_d4ubxU22_P6LSz-ZGShUFgVy5uA4');

      return { synced: totalSynced, failed: totalFailed };

    } catch (error) {
      console.error('❌ Custom sync failed:', error.message);
      throw error;
    }
  }
}

module.exports = SheetSyncService;