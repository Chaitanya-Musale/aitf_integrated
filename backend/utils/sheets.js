// // Google Sheets helper. Lazy-inits googleapis client using service account via GOOGLE_APPLICATION_CREDENTIALS.
// let google;
// let auth;
// let sheets;

// async function getSheetsClient() {
//   if (!google) {
//     try { google = require('googleapis').google; } catch (_) { return null; }
//   }
//   if (!auth) {
//     try {
//       const { GoogleAuth } = require('google-auth-library');
//       auth = new GoogleAuth({
//         scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
//       });
//     } catch (_) { return null; }
//   }
//   if (!sheets) {
//     sheets = google.sheets({ version: 'v4', auth });
//   }
//   return sheets;
// }

// async function createRecruitmentSheet(jobName) {
//   const client = await getSheetsClient();
//   if (!client) return null;
//   const now = new Date();
//   const title = `${jobName.replace(/\s+/g, '_')}_${now.getFullYear()}_recruitment_sheet`;
//   const res = await client.spreadsheets.create({
//     requestBody: {
//       properties: { title },
//       sheets: [{
//         properties: { title: 'Candidates' },
//         data: [{
//           rowData: [{ values: (
//             ['Name','Email','Phone','College','Degree','Graduation Year','Experience','Skills','Resume URL','Status','Round','Scheduled Time','Interviewer','Remarks']
//           ).map(v => ({ userEnteredValue: { stringValue: String(v) }, userEnteredFormat: { textFormat: { bold: true } } })) }]
//         }]
//       }]
//     }
//   });
//   const sheetId = res.data.spreadsheetId;
//   const sheetUrl = res.data.spreadsheetUrl;
//   return { sheetId, sheetUrl };
// }

// async function appendCandidateRow(sheetId, rowValues) {
//   const client = await getSheetsClient();
//   if (!client) return false;
//   await client.spreadsheets.values.append({
//     spreadsheetId: sheetId,
//     range: 'Candidates!A:Z',
//     valueInputOption: 'RAW',
//     requestBody: { values: [rowValues] },
//   });
//   return true;
// }

// module.exports = { createRecruitmentSheet, appendCandidateRow };

// // Update a candidate's status (and optionally round) in the Candidates sheet by finding row via Email and Round.
// // Falls back to append if row not found.
// async function updateStatusAndRound(sheetId, email, roundName, status) {
//   const client = await getSheetsClient();
//   if (!client) return false;
//   // Read current values
//   const read = await client.spreadsheets.values.get({
//     spreadsheetId: sheetId,
//     range: 'Candidates!A:N',
//   });
//   const rows = read.data.values || [];
//   // Header assumed at index 0. Columns: A Name, B Email, J Status, K Round
//   let targetRowIndex = -1;
//   for (let i = 1; i < rows.length; i++) {
//     const row = rows[i];
//     const rowEmail = row[1] || '';
//     const rowRound = row[10] || '';
//     if (rowEmail.toLowerCase() === String(email || '').toLowerCase() && String(rowRound) === String(roundName || '')) {
//       targetRowIndex = i;
//     }
//   }
//   if (targetRowIndex !== -1) {
//     // Update Status (J) and Round (K)
//     const range = `Candidates!J${targetRowIndex + 1}:K${targetRowIndex + 1}`;
//     await client.spreadsheets.values.update({
//       spreadsheetId: sheetId,
//       range,
//       valueInputOption: 'RAW',
//       requestBody: { values: [[status || '', roundName || '']] },
//     });
//     return true;
//   }
//   // Fallback: append a new minimal row
//   await appendCandidateRow(sheetId, ['', email || '', '', '', '', '', '', '', '', status || '', roundName || '', '', '', '']);
//   return true;
// }

// module.exports.updateStatusAndRound = updateStatusAndRound;
// Enhanced Google Sheets helper for recruitment management
const { google } = require('googleapis');

// Configuration from environment
const KEY_FILE = process.env.GOOGLE_CLOUD_KEY_FILE;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

let sheetsClient;
let driveClient;
let lastApiCall = 0;
const MIN_API_INTERVAL = 200; // Minimum 200ms between API calls

async function getGoogleClients() {
  if (!sheetsClient || !driveClient) {
    try {
      const keyFile = KEY_FILE || './key.json';

      // Read the service account key file
      const fs = require('fs');
      const credentials = JSON.parse(fs.readFileSync(keyFile, 'utf8'));

      // Use JWT directly to avoid deprecation warnings
      const { JWT } = require('google-auth-library');
      const authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive'
        ],
      });

      sheetsClient = google.sheets({ version: 'v4', auth: authClient });
      driveClient = google.drive({ version: 'v3', auth: authClient });

      console.log('✅ Using service account for Google Sheets and Drive API');
      return { sheetsClient, driveClient };
    } catch (error) {
      console.error('❌ Failed to initialize Google clients:', error.message);
      return { sheetsClient: null, driveClient: null };
    }
  }
  return { sheetsClient, driveClient };
}

async function getSheetsClient() {
  const { sheetsClient } = await getGoogleClients();
  return sheetsClient;
}

async function getDriveClient() {
  const { driveClient } = await getGoogleClients();
  return driveClient;
}



// Create a new individual sheet for each job with tabs for each round
async function createRecruitmentSheet(jobName, rounds = []) {
  const sheetsClient = await getSheetsClient();
  const driveClient = await getDriveClient();

  if (!sheetsClient || !driveClient) {
    console.warn('⚠️ Google Sheets or Drive client not available');
    return null;
  }

  if (!DRIVE_FOLDER_ID) {
    console.error('❌ GOOGLE_DRIVE_FOLDER_ID not configured');
    return null;
  }

  try {
    console.log(`📄 Creating new individual sheet for job: ${jobName}`);
    console.log(`📊 Setting up ${rounds.length} interview rounds with enhanced formatting`);

    // Create a new spreadsheet directly in the shared drive using Drive API
    const now = new Date();
    const sheetTitle = `${jobName.replace(/\s+/g, '_')}_${now.getFullYear()}_Recruitment`;

    const fileMetadata = {
      name: sheetTitle,
      parents: [DRIVE_FOLDER_ID],
      mimeType: 'application/vnd.google-apps.spreadsheet'
    };

    const createResponse = await driveClient.files.create({
      requestBody: fileMetadata,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true
    });

    const newSheetId = createResponse.data.id;
    const sheetUrl = createResponse.data.webViewLink;

    console.log(`📄 Created individual sheet: ${sheetTitle} (${newSheetId})`);
    console.log(`📁 Sheet created directly in shared drive: ${DRIVE_FOLDER_ID}`);

    // Set viewer permissions for anyone with the link
    try {
      await driveClient.permissions.create({
        fileId: newSheetId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        },
        supportsAllDrives: true
      });
      console.log(`🔗 Set viewer access for anyone with the link`);
    } catch (permissionError) {
      console.warn(`⚠️ Could not set public permissions: ${permissionError.message}`);
      // Continue even if permission setting fails
    }

    // Set up tabs for rounds
    const roundSheetUrls = await setupRoundTabs(sheetsClient, newSheetId, sheetUrl, rounds);

    console.log(`✅ Successfully created individual sheet with ${rounds.length} tabs`);
    console.log(`🎨 Applied enhanced formatting: colored headers, generous column widths, and status-based row colors`);

    return {
      sheetId: newSheetId,
      sheetUrl: sheetUrl,
      roundSheetUrls: roundSheetUrls
    };

  } catch (error) {
    console.error('❌ Error creating individual recruitment sheet:', error.message);
    return null;
  }
}

// Helper function to set up round tabs in a sheet
async function setupRoundTabs(sheetsClient, sheetId, sheetUrl, rounds) {
  const roundSheetUrls = [];
  const requests = [];

  // We'll rename Sheet1 instead of deleting it to avoid the "can't remove all sheets" error
  const initialSheetInfo = await sheetsClient.spreadsheets.get({
    spreadsheetId: sheetId
  });

  const defaultSheet = initialSheetInfo.data.sheets.find(sheet =>
    sheet.properties.title === 'Sheet1'
  );

  let useDefaultSheetForFirstRound = false;
  if (defaultSheet && rounds.length > 0) {
    // Rename the default sheet to the first round instead of deleting it
    const firstRound = rounds[0];
    const firstRoundTabName = `Round_${firstRound.round_order}_${firstRound.name.replace(/\s+/g, '_')}`;

    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: defaultSheet.properties.sheetId,
          title: firstRoundTabName,
          tabColor: {
            red: 0.2,
            green: 0.6,
            blue: 0.8
          }
        },
        fields: 'title,tabColor'
      }
    });

    useDefaultSheetForFirstRound = true;
  }

  // Create tabs for each round (skip first if we're using the default sheet)
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const tabName = `Round_${round.round_order}_${round.name.replace(/\s+/g, '_')}`;

    // Skip creating a new sheet for the first round if we're reusing the default sheet
    if (!(useDefaultSheetForFirstRound && i === 0)) {
      requests.push({
        addSheet: {
          properties: {
            title: tabName,
            tabColor: {
              red: 0.2 + (i * 0.2),
              green: 0.6,
              blue: 0.8
            }
          }
        }
      });
    }

    roundSheetUrls.push({
      roundId: round.id,
      roundOrder: round.round_order,
      sheetUrl: `${sheetUrl}#gid=0`, // Will be updated
      tabName: tabName,
      columns: getRoundColumns(round, round.round_order === 1)
    });
  }

  // Execute batch update
  if (requests.length > 0) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: requests }
    });

    // Get updated sheet info and add headers
    const updatedSheetInfo = await sheetsClient.spreadsheets.get({
      spreadsheetId: sheetId
    });

    for (let i = 0; i < roundSheetUrls.length; i++) {
      const roundSheet = roundSheetUrls[i];
      const actualSheet = updatedSheetInfo.data.sheets.find(sheet =>
        sheet.properties.title === roundSheet.tabName
      );

      if (actualSheet) {
        roundSheet.sheetUrl = `${sheetUrl}#gid=${actualSheet.properties.sheetId}`;

        // Add headers
        await sheetsClient.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${roundSheet.tabName}!A1:${String.fromCharCode(65 + roundSheet.columns.length - 1)}1`,
          valueInputOption: 'RAW',
          requestBody: { values: [roundSheet.columns] }
        });

        // Format headers and set column widths
        const formatRequests = [
          // Header formatting with better colors
          {
            repeatCell: {
              range: {
                sheetId: actualSheet.properties.sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: roundSheet.columns.length
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true,
                    foregroundColor: { red: 1, green: 1, blue: 1 }
                  },
                  backgroundColor: { red: 0.2, green: 0.4, blue: 0.7 },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                  borders: {
                    top: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                    bottom: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                    left: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                    right: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } }
                  }
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,borders)'
            }
          },
          // Freeze header row
          {
            updateSheetProperties: {
              properties: {
                sheetId: actualSheet.properties.sheetId,
                gridProperties: {
                  frozenRowCount: 1
                }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          }
        ];

        // Add column width adjustments
        const columnWidths = getColumnWidths(roundSheet.columns);
        columnWidths.forEach((width, index) => {
          formatRequests.push({
            updateDimensionProperties: {
              range: {
                sheetId: actualSheet.properties.sheetId,
                dimension: 'COLUMNS',
                startIndex: index,
                endIndex: index + 1
              },
              properties: {
                pixelSize: width
              },
              fields: 'pixelSize'
            }
          });
        });

        // Add status-based conditional formatting for all rows
        const statusColors = {
          'fresh': { red: 0.93, green: 0.96, blue: 1 },        // Light blue
          'in_progress': { red: 1, green: 0.93, blue: 0.7 },   // Light yellow
          'scheduled': { red: 0.88, green: 0.93, blue: 1 },    // Light purple
          'completed': { red: 0.88, green: 1, blue: 0.88 },    // Light green
          'accepted': { red: 0.75, green: 0.93, blue: 0.75 },  // Green
          'rejected': { red: 1, green: 0.88, blue: 0.88 }      // Light red
        };

        // Find the Status column index
        const statusColumnIndex = roundSheet.columns.indexOf('Status');

        if (statusColumnIndex !== -1) {
          // Add conditional formatting rules for each status
          Object.entries(statusColors).forEach(([status, color], index) => {
            formatRequests.push({
              addConditionalFormatRule: {
                rule: {
                  ranges: [{
                    sheetId: actualSheet.properties.sheetId,
                    startRowIndex: 1,
                    endRowIndex: 1000,
                    startColumnIndex: 0,
                    endColumnIndex: roundSheet.columns.length
                  }],
                  booleanRule: {
                    condition: {
                      type: 'CUSTOM_FORMULA',
                      values: [{ userEnteredValue: `=LOWER($${String.fromCharCode(65 + statusColumnIndex)}:$${String.fromCharCode(65 + statusColumnIndex)})="${status}"` }]
                    },
                    format: {
                      backgroundColor: color
                    }
                  }
                },
                index: index
              }
            });
          });
        }

        await sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests: formatRequests }
        });
      }
    }
  }

  return roundSheetUrls;
}

// Helper function to get columns for a round
function getRoundColumns(round, isFirstRound) {
  if (isFirstRound) {
    return [
      'Name', 'Email', 'Status', 'Interviewers', 'Time Scheduled',
      ...round.evaluation_parameters.map(param => param.name),
      'Feedback Given', 'Reason of Rejection'
    ];
  } else {
    return [
      'Name', 'Email', 'Resume Link', 'Work Experience & Skills Summary',
      'Status', 'Interviewers', 'Time Scheduled',
      ...round.evaluation_parameters.map(param => param.name),
      'Feedback Given', 'Reason of Rejection'
    ];
  }
}

// Helper function to get optimal column widths based on column content
function getColumnWidths(columns) {
  const widthMap = {
    'Name': 180,                                    // Increased from 150
    'Email': 250,                                   // Increased from 200
    'Status': 140,                                  // Increased from 120
    'Interviewers': 220,                           // Increased from 180
    'Time Scheduled': 180,                         // Increased from 160
    'Resume Link': 140,                            // Increased from 120
    'Work Experience & Skills Summary': 350,       // Increased from 300
    'Feedback Given': 300,                         // Increased from 250
    'Reason of Rejection': 250                     // Increased from 200
  };

  return columns.map(column => {
    // Check if it's a standard column
    if (widthMap[column]) {
      return widthMap[column];
    }
    // For evaluation parameters, use a more generous width
    return 130; // Increased from 100
  });
}

// Helper function to ensure minimum interval between API calls
async function ensureApiInterval() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;

  if (timeSinceLastCall < MIN_API_INTERVAL) {
    const waitTime = MIN_API_INTERVAL - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastApiCall = Date.now();
}

// Helper function to format candidate rows based on status
async function formatCandidateRow(client, sheetId, tabName, rowIndex, status) {
  try {
    // Get sheet properties and headers to determine column count
    const sheetInfo = await client.spreadsheets.get({
      spreadsheetId: sheetId
    });

    const targetSheet = sheetInfo.data.sheets.find(sheet =>
      sheet.properties.title === tabName
    );

    if (!targetSheet) return;

    const sheetTabId = targetSheet.properties.sheetId;

    // Get the headers to determine how many columns to format
    const response = await client.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!1:1`,
    });

    const headers = response.data.values?.[0] || [];
    const columnCount = headers.length;

    // Define colors based on status (matching the conditional formatting)
    const statusColors = {
      'fresh': { red: 0.93, green: 0.96, blue: 1 },        // Light blue
      'in_progress': { red: 1, green: 0.93, blue: 0.7 },   // Light yellow
      'scheduled': { red: 0.88, green: 0.93, blue: 1 },    // Light purple
      'completed': { red: 0.88, green: 1, blue: 0.88 },    // Light green
      'accepted': { red: 0.75, green: 0.93, blue: 0.75 },  // Green
      'rejected': { red: 1, green: 0.88, blue: 0.88 }      // Light red
    };

    const backgroundColor = statusColors[status?.toLowerCase()] || { red: 1, green: 1, blue: 1 };

    // Apply formatting only to columns that have headers
    await client.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: sheetTabId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 0,
              endColumnIndex: columnCount // Only format columns with headers
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: backgroundColor,
                borders: {
                  top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                  bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                  left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                  right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } }
                },
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,borders,verticalAlignment)'
          }
        }]
      }
    });
  } catch (error) {
    console.error('Error formatting candidate row:', error);
  }
}

// Add or update candidate in specific round sheet
async function updateCandidateInRoundSheet(sheetId, tabName, candidateData) {
  const client = await getSheetsClient();

  if (!client || !sheetId) {
    console.error('❌ No sheets client or sheet ID available');
    return false;
  }

  // Ensure minimum interval between API calls
  await ensureApiInterval();

  try {
    console.log(`📋 Updating candidate in sheet tab: ${tabName}`);
    console.log(`👤 Candidate: ${candidateData.email} with status: ${candidateData.status}`);

    // Read existing data to check if candidate exists
    const range = `${tabName}!A:Z`;
    const response = await client.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });

    const rows = response.data.values || [];
    const headers = rows[0] || [];

    console.log(`📊 Sheet has ${rows.length} rows and headers:`, headers);

    // Find candidate by email
    let targetRowIndex = -1;
    const emailCol = headers.indexOf('Email');
    console.log(`🔍 Looking for candidate ${candidateData.email} in email column ${emailCol}`);

    for (let i = 1; i < rows.length; i++) {
      if (emailCol !== -1 && rows[i][emailCol] === candidateData.email) {
        targetRowIndex = i;
        console.log(`✅ Found candidate at row ${targetRowIndex + 1}`);
        break;
      }
    }

    if (targetRowIndex === -1) {
      console.log(`➕ Candidate not found, will add new row`);
    }

    // Prepare row data based on headers
    const rowData = headers.map(header => {
      switch (header) {
        case 'Name': return candidateData.name || '';
        case 'Email': return candidateData.email || '';
        case 'Status': return candidateData.status || '';
        case 'Interviewers': return candidateData.interviewers || '';
        case 'Time Scheduled': return candidateData.scheduledTime || '';
        case 'Resume Link': return candidateData.resumeUrl || '';
        case 'Work Experience & Skills Summary':
          return `${candidateData.yearsExperience || 0} years | ${candidateData.skillsSummary || ''}`;
        case 'Feedback Given':
          // Handle multi-interviewer feedback
          if (candidateData.evaluationsByInterviewer && Object.keys(candidateData.evaluationsByInterviewer).length > 0) {
            const feedbacks = [];
            Object.entries(candidateData.evaluationsByInterviewer).forEach(([interviewerId, evaluation]) => {
              if (evaluation.feedback && evaluation.feedback.trim()) {
                const interviewerName = evaluation.interviewer_name || `Interviewer ${interviewerId}`;
                feedbacks.push(`${interviewerName}: ${evaluation.feedback}`);
              }
            });
            return feedbacks.length > 0 ? feedbacks.join(' | ') : '';
          }
          return candidateData.feedback || '';
        case 'Reason of Rejection': return candidateData.rejectionReason || '';
        default:
          // Check if it's a multi-interviewer evaluation parameter
          if (candidateData.evaluationsByInterviewer && Object.keys(candidateData.evaluationsByInterviewer).length > 0) {
            // Format: "John Doe: 8/10 | Jane Smith: 9/10"
            const interviewerScores = [];
            Object.entries(candidateData.evaluationsByInterviewer).forEach(([interviewerId, evaluation]) => {
              if (evaluation.scores) {
                const score = evaluation.scores.find(s => s.name === header);
                if (score) {
                  const interviewerName = evaluation.interviewer_name || `Interviewer ${interviewerId}`;
                  interviewerScores.push(`${interviewerName}: ${score.scored_points}/${score.total_points}`);
                }
              }
            });
            if (interviewerScores.length > 0) {
              return interviewerScores.join(' | ');
            }
          }

          // Fallback: Check if it's a legacy single evaluation parameter
          if (candidateData.evaluationScores) {
            const score = candidateData.evaluationScores.find(s => s.name === header);
            if (score) {
              return `${score.scored_points}/${score.total_points}`;
            }
          }

          return '';
      }
    });

    console.log(`📝 Row data to write:`, rowData);

    if (targetRowIndex !== -1) {
      // Update existing row
      const updateRange = `${tabName}!A${targetRowIndex + 1}:${String.fromCharCode(65 + headers.length - 1)}${targetRowIndex + 1}`;
      console.log(`📍 Updating range: ${updateRange}`);

      await client.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      });

      // Apply row formatting
      await formatCandidateRow(client, sheetId, tabName, targetRowIndex + 1, candidateData.status);
      console.log('✅ Updated existing candidate row');
    } else {
      // Append new row
      console.log(`📍 Appending to range: ${tabName}!A:Z`);

      await client.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${tabName}!A:Z`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      });

      // Get the row number of the newly added row and format it
      const newRowIndex = rows.length + 1;
      await formatCandidateRow(client, sheetId, tabName, newRowIndex, candidateData.status);
      console.log('✅ Added new candidate row');
    }

    // Sort by custom status order and scheduled time
    await sortSheetByStatusAndTime(sheetId, tabName);

    return true;
  } catch (error) {
    console.error('Error updating candidate in sheet:', error);
    return false;
  }
}

// Sort sheet by application status and scheduled time
async function sortSheetByStatusAndTime(sheetId, tabName) {
  const client = await getSheetsClient();
  if (!client || !sheetId) return false;

  // Custom sort by status priority: fresh → in_progress → scheduled → completed → accepted → rejected
  const statusOrder = {
    'fresh': 1,
    'in_progress': 2,
    'scheduled': 3,
    'completed': 4,
    'accepted': 5,
    'rejected': 6
  };

  try {
    // Get sheet properties to find the correct sheet ID
    const sheetInfo = await client.spreadsheets.get({
      spreadsheetId: sheetId
    });

    const targetSheet = sheetInfo.data.sheets.find(sheet =>
      sheet.properties.title === tabName
    );

    if (!targetSheet) {
      console.warn(`Sheet tab ${tabName} not found`);
      return false;
    }

    const sheetTabId = targetSheet.properties.sheetId;

    // Read current data
    const response = await client.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:Z`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return true; // No data to sort

    const headers = rows[0] || [];
    const statusColIndex = headers.indexOf('Status');
    const timeColIndex = headers.indexOf('Time Scheduled');

    if (statusColIndex === -1) return true; // No status column to sort by

    // Get data rows (excluding header)
    const dataRows = rows.slice(1);

    // Sort data rows by custom status order, then by scheduled time
    dataRows.sort((a, b) => {
      const statusA = (a[statusColIndex] || '').toLowerCase();
      const statusB = (b[statusColIndex] || '').toLowerCase();

      const orderA = statusOrder[statusA] || 999;
      const orderB = statusOrder[statusB] || 999;

      // Primary sort by status order
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Secondary sort by scheduled time if available
      if (timeColIndex !== -1) {
        const timeA = a[timeColIndex] || '';
        const timeB = b[timeColIndex] || '';
        return timeA.localeCompare(timeB);
      }

      return 0;
    });

    // Prepare sorted data with header
    const sortedData = [headers, ...dataRows];

    // Clear existing data and write sorted data
    await client.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${tabName}!A:Z`,
    });

    await client.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: sortedData
      }
    });

    // Re-apply formatting to all data rows
    for (let i = 1; i < sortedData.length; i++) {
      const row = sortedData[i];
      const statusColIndex = headers.indexOf('Status');
      const status = statusColIndex !== -1 ? row[statusColIndex] : '';
      await formatCandidateRow(client, sheetId, tabName, i + 1, status);
    }

    console.log('✅ Sheet sorted by custom status order and time with formatting preserved');
    return true;
  } catch (error) {
    console.error('Error sorting sheet:', error);
    return false;
  }
}

// Remove candidate from specific round sheet
async function removeCandidateFromRoundSheet(sheetId, tabName, candidateEmail) {
  const client = await getSheetsClient();
  if (!client || !sheetId) return false;

  try {
    const response = await client.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:Z`,
    });

    const rows = response.data.values || [];
    const headers = rows[0] || [];
    const emailColIndex = headers.indexOf('Email');

    if (emailColIndex === -1) return false;

    // Find candidate row
    let targetRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][emailColIndex] === candidateEmail) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex !== -1) {
      // Get sheet properties
      const sheetInfo = await client.spreadsheets.get({
        spreadsheetId: sheetId
      });

      const targetSheet = sheetInfo.data.sheets.find(sheet =>
        sheet.properties.title === tabName
      );

      if (targetSheet) {
        const sheetTabId = targetSheet.properties.sheetId;

        // Delete the row
        await client.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: sheetTabId,
                  dimension: 'ROWS',
                  startIndex: targetRowIndex,
                  endIndex: targetRowIndex + 1
                }
              }
            }]
          }
        });

        console.log('✅ Removed candidate from sheet');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error removing candidate from sheet:', error);
    return false;
  }
}

// Delete individual recruitment sheet (moves to trash)
async function deleteRecruitmentSheet(sheetId) {
  const driveClient = await getDriveClient();
  if (!driveClient || !sheetId) return false;

  try {
    // Move the entire sheet to trash
    await driveClient.files.update({
      fileId: sheetId,
      requestBody: {
        trashed: true
      }
    });

    console.log(`🗑️ Moved sheet ${sheetId} to trash`);
    return true;
  } catch (error) {
    console.error('Error deleting sheet:', error);
    return false;
  }
}

module.exports = {
  getSheetsClient,
  getDriveClient,
  createRecruitmentSheet,
  updateCandidateInRoundSheet,
  removeCandidateFromRoundSheet,
  sortSheetByStatusAndTime,
  deleteRecruitmentSheet,
  // Legacy functions for backward compatibility
  appendCandidateRow: (sheetId, tabName, candidateData) => updateCandidateInRoundSheet(sheetId, tabName, candidateData),
  updateStatusAndRound: (sheetId, tabName, candidateData) => updateCandidateInRoundSheet(sheetId, tabName, candidateData)
};