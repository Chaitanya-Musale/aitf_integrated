// Manual sync script using the enhanced SheetSyncService
require('dotenv').config();
const SheetSyncService = require('./services/sheetSync');

async function runManualSync() {
    const args = process.argv.slice(2);
    const command = args[0] || 'real';

    try {
        switch (command) {
            case 'real':
                console.log('🔄 Syncing all real candidates from database...');
                const realResult = await SheetSyncService.syncAllRealCandidates();
                console.log(`\n📊 Results: ${realResult.synced} synced, ${realResult.failed} failed`);
                break;

            case 'custom':
                console.log('🔄 Syncing custom test candidates...');
                const customData = [
                    {
                        tabName: 'Test_Job_Round_1_Technical_Screening',
                        candidates: [
                            {
                                name: 'John Smith',
                                email: 'john.smith@example.com',
                                status: 'fresh',
                                interviewers: 'Alice Johnson',
                                scheduledTime: '2025-01-15 10:00 AM',
                                resumeUrl: 'https://example.com/john-resume.pdf',
                                yearsExperience: 3,
                                skillsSummary: 'JavaScript, React, Node.js',
                                feedback: '',
                                rejectionReason: '',
                                evaluationScores: []
                            },
                            {
                                name: 'Sarah Davis',
                                email: 'sarah.davis@example.com',
                                status: 'scheduled',
                                interviewers: 'Bob Wilson',
                                scheduledTime: '2025-01-16 2:00 PM',
                                resumeUrl: 'https://example.com/sarah-resume.pdf',
                                yearsExperience: 2,
                                skillsSummary: 'Python, Django, PostgreSQL',
                                feedback: '',
                                rejectionReason: '',
                                evaluationScores: [
                                    { name: 'Coding Skills', scored_points: 8, total_points: 10 }
                                ]
                            }
                        ]
                    }
                ];

                const customResult = await SheetSyncService.syncCustomCandidates(customData);
                console.log(`\n📊 Results: ${customResult.synced} synced, ${customResult.failed} failed`);
                break;

            case 'job':
                const jobId = parseInt(args[1]);
                if (!jobId) {
                    console.error('❌ Please provide a job ID: node manual-sync.js job <jobId>');
                    process.exit(1);
                }
                console.log(`🔄 Syncing all candidates for job ${jobId}...`);
                const jobResult = await SheetSyncService.syncAllCandidatesForJob(jobId);
                console.log(`\n📊 Synced ${jobResult} candidates for job ${jobId}`);
                break;

            case 'round':
                const roundId = parseInt(args[1]);
                if (!roundId) {
                    console.error('❌ Please provide a round ID: node manual-sync.js round <roundId>');
                    process.exit(1);
                }
                console.log(`🔄 Syncing all candidates for round ${roundId}...`);
                const roundResult = await SheetSyncService.syncAllCandidatesForRound(roundId);
                console.log(`\n📊 Synced ${roundResult} candidates for round ${roundId}`);
                break;

            case 'status':
                const status = SheetSyncService.getQueueStatus();
                console.log('📊 Queue Status:', status);
                break;

            case 'clear':
                const cleared = SheetSyncService.clearQueue();
                console.log(`🧹 Cleared ${cleared} requests from queue`);
                break;

            default:
                console.log(`
📋 Manual Sync Commands:

  real              - Sync all real candidates from database
  custom            - Sync custom test candidates
  job <jobId>       - Sync all candidates for a specific job
  round <roundId>   - Sync all candidates for a specific round
  status            - Show queue status
  clear             - Clear sync queue

Examples:
  node manual-sync.js real
  node manual-sync.js job 23
  node manual-sync.js round 41
  node manual-sync.js status
        `);
                break;
        }

    } catch (error) {
        console.error('💥 Manual sync failed:', error);
    } finally {
        process.exit(0);
    }
}

runManualSync();