// Slack helper for Round-2 workflow
// Best-effort: never throw to request handlers; log and return.

const pool = require('../config/database');
const { sendSlackWorkspaceInviteEmail, sendSlackChannelAddedEmail } = require('./email');

let WebClient;
try {
  WebClient = require('@slack/web-api').WebClient;
} catch (_) {
  WebClient = null;
}

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_TEAM_ID = process.env.SLACK_TEAM_ID; // optional, for deep links

function buildChannelName(jobName, jobId) {
  const base = `${String(jobName || '')}_${jobId}_round2`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 80);
}

function getChannelUrl(channelId) {
  if (!channelId) return null;
  if (SLACK_TEAM_ID) return `https://app.slack.com/client/${SLACK_TEAM_ID}/${channelId}`;
  return `https://slack.com/app_redirect?channel=${channelId}`;
}

async function getWebClient() {
  if (!WebClient) return null;
  if (!SLACK_BOT_TOKEN) return null;
  console.log('[Slack] Initializing WebClient');
  return new WebClient(SLACK_BOT_TOKEN);
}

async function findOrCreateChannel(client, name) {
  console.log('[Slack] Seeking channel by name:', name);
  // Try to find existing public channel by name (paginate)
  try {
    let cursor;
    do {
      const list = await client.conversations.list({ exclude_archived: true, types: 'public_channel', limit: 1000, cursor });
      const channels = list.channels || [];
      const existing = channels.find(c => c.name === name);
      if (existing) {
        console.log('[Slack] Found existing channel:', existing.id);
        return existing;
      }
      cursor = list.response_metadata && list.response_metadata.next_cursor ? list.response_metadata.next_cursor : undefined;
    } while (cursor);
  } catch (e) {
    console.warn('[Slack] conversations.list failed:', e.message);
  }
  // Create public channel
  console.log('[Slack] Creating channel:', name);
  const created = await client.conversations.create({ name });
  console.log('[Slack] Channel created:', created.channel && created.channel.id);
  return created.channel;
}

async function lookupUserIdByEmail(client, email) {
  try {
    const res = await client.users.lookupByEmail({ email });
    return res.user && res.user.id ? res.user.id : null;
  } catch (e) {
    if (e.data && e.data.error === 'users_not_found') return null;
    console.warn('Slack lookupByEmail failed for', email, e.message);
    return null;
  }
}

async function inviteUsers(client, channelId, userIds) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return;
  try {
    console.log('[Slack] Inviting users:', ids.join(','), 'to channel', channelId);
    await client.conversations.invite({ channel: channelId, users: ids.join(',') });
  } catch (e) {
    // ignore already_in_channel / cant_invite_self etc.
    const code = (e.data && e.data.error) || e.message;
    if (!['already_in_channel', 'cant_invite_self', 'already_in_group'].includes(code)) {
      console.warn('[Slack] invite failed:', code);
    }
  }
}

async function fetchHrEmails() {
  // role name exactly 'HR'
  const sql = `
    SELECT u.email
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE r.name = 'HR' AND u.status = 'active' AND u.email IS NOT NULL
  `;
  const result = await pool.query(sql);
  return result.rows.map(r => r.email);
}

async function postIntroMessage(client, channelId, { job, sheetUrl, candidate }) {
  const textLines = [
    `This is the Round 2 channel for job: *${job.name}* (ID: ${job.id}).`,
  ];
  if (sheetUrl) textLines.push(`Screening Sheet: ${sheetUrl}`);
  textLines.push('You will receive notifications in this channel.');
  if (candidate) textLines.push(`Candidate: ${candidate.name || ''} <${candidate.email || ''}>`);

  try {
    console.log('[Slack] Posting intro message to channel', channelId);
    const res = await client.chat.postMessage({
      channel: channelId,
      text: textLines.join('\n')
    });
    try {
      if (res && res.ts) {
        await client.pins.add({ channel: channelId, timestamp: res.ts });
        console.log('[Slack] Intro message pinned', { channelId, ts: res.ts });
      }
    } catch (e) {
      console.warn('[Slack] pin intro failed:', e.message);
    }
  } catch (e) {
    console.warn('[Slack] post message failed:', e.message);
  }
}

async function ensureRound2ChannelAndInvite(jobId, jobName, sheetUrl, candidateEmail, candidateName) {
  try {
    console.log('[Slack] ensureRound2ChannelAndInvite start', { jobId, jobName, candidateEmail });
    const client = await getWebClient();
    if (!client) {
      console.warn('[Slack] client unavailable (missing SDK or token). SLACK_BOT_TOKEN exists?', !!SLACK_BOT_TOKEN);
      return;
    }

    // ensure job has channel stored
    const jobQ = await pool.query('SELECT slack_round2_channel_id, slack_round2_channel_name FROM jobs WHERE id = $1', [jobId]);
    let channelId = jobQ.rows[0] && jobQ.rows[0].slack_round2_channel_id;
    let channelName = jobQ.rows[0] && jobQ.rows[0].slack_round2_channel_name;

    if (!channelId) {
      const desired = buildChannelName(jobName, jobId);
      const chan = await findOrCreateChannel(client, desired);
      channelId = chan.id;
      channelName = chan.name;
      await pool.query('UPDATE jobs SET slack_round2_channel_id = $1, slack_round2_channel_name = $2 WHERE id = $3', [channelId, channelName, jobId]);
      console.log('[Slack] Stored channel on job', { jobId, channelId, channelName });

      // Invite HR users on first creation
      try {
        const hrEmails = await fetchHrEmails();
        console.log('[Slack] HR emails to invite:', hrEmails);
        const hrIds = [];
        for (const email of hrEmails) {
          const id = await lookupUserIdByEmail(client, email);
          if (id) hrIds.push(id);
        }
        await inviteUsers(client, channelId, hrIds);
      } catch (e) {
        console.warn('[Slack] HR invite failed:', e.message);
      }

      // Post intro on creation
      await postIntroMessage(client, channelId, { job: { id: jobId, name: jobName }, sheetUrl, candidate: null });
    }

    // Invite candidate if exists in Slack
    if (candidateEmail) {
      console.log('[Slack] Handling candidate invite for', candidateEmail);
      const candidateId = await lookupUserIdByEmail(client, candidateEmail);
      const channelUrl = getChannelUrl(channelId) || '';
      if (candidateId) {
        await inviteUsers(client, channelId, [candidateId]);
        try {
          await sendSlackChannelAddedEmail(candidateEmail, candidateName || '', channelName, channelUrl);
        } catch (e) {
          console.warn('[Slack] sendSlackChannelAddedEmail failed:', e.message);
        }
      } else {
        try {
          console.log('[Slack] Candidate not found in Slack, emailing workspace invite', { candidateEmail, channelName, channelUrl });
          await sendSlackWorkspaceInviteEmail(candidateEmail, candidateName || '', channelName, channelUrl, process.env.SLACK_WORKSPACE_INVITE_URL);
        } catch (e) {
          console.warn('[Slack] Slack workspace invite email failed:', e.message);
        }
      }
    }
  } catch (e) {
    console.warn('[Slack] ensureRound2ChannelAndInvite error:', e.message);
  }
}

module.exports = {
  ensureRound2ChannelAndInvite,
  buildChannelName,
  getChannelUrl,
};
