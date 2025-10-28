const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendWelcomeEmail = async (email, name, password) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Welcome to AITF - Your Account Details',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to AITF</h2>
          <p>Hello ${name},</p>
          <p>Your account has been created successfully. Here are your login credentials:</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> ${password}</p>
          </div>
          <p>Please log in and change your password as soon as possible.</p>
          <p>Login URL: <a href="${process.env.FRONTEND_URL}/login">${process.env.FRONTEND_URL}/login</a></p>
          <p>Best regards,<br>AITF Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

const sendPasswordResetEmail = async (email, name) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your AITF Password Was Reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Successful</h2>
          <p>Hello ${name || ''},</p>
          <p>Your AITF account password has been reset successfully. If you did not perform this action, please contact support immediately.</p>
          <p>Login URL: <a href="${process.env.FRONTEND_URL}">${process.env.FRONTEND_URL}</a></p>
          <p>Best regards,<br>AITF Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

const sendPasswordResetLink = async (email, name, url) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Reset your AITF password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hello ${name || ''},</p>
          <p>We received a request to reset your password. Click the button below to set a new password. This link will expire in 30 minutes.</p>
          <p style="text-align:center; margin:24px 0;">
            <a href="${url}" style="background:#2563eb; color:#fff; padding:12px 18px; border-radius:6px; text-decoration:none;">Reset Password</a>
          </p>
          <p>If you did not request this, you can safely ignore this email.</p>
          <p>Best regards,<br>AITF Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password reset link sent to ${email}`);
  } catch (error) {
    console.error('Error sending password reset link:', error);
    throw error;
  }
};

// Slack-related emails
const sendSlackWorkspaceInviteEmail = async (email, name, channelName, channelUrl, workspaceInviteUrl) => {
  try {
    const safeInvite = workspaceInviteUrl || process.env.SLACK_WORKSPACE_INVITE_URL || '';
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Join our Slack workspace to continue your interview',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Join our Slack workspace</h2>
          <p>Hello ${name || ''},</p>
          <p>We've added you to our interview Slack channel <strong>#${channelName}</strong>. Since your email is not a member of our Slack workspace yet, please join the workspace first using the link below, then search for the channel name and join (it's public):</p>
          <p style="text-align:center; margin:24px 0;">
            <a href="${safeInvite}" style="background:#2563eb; color:#fff; padding:12px 18px; border-radius:6px; text-decoration:none;">Join Workspace</a>
          </p>
          <p><strong>Channel name:</strong> #${channelName}</p>
          ${channelUrl ? `<p><strong>Deep link (works after you join):</strong> <a href="${channelUrl}">${channelUrl}</a></p>` : ''}
          <p>Steps:</p>
          <ol>
            <li>Click "Join Workspace" and complete signup if needed.</li>
            <li>Open Slack and search for <strong>#${channelName}</strong>.</li>
            <li>Click "Join" to enter the channel.</li>
          </ol>
          <p>Best regards,<br>AITF Team</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log(`Slack workspace invite email sent to ${email}`);
  } catch (error) {
    console.error('Error sending Slack workspace invite email:', error);
    throw error;
  }
};

const sendSlackChannelAddedEmail = async (email, name, channelName, channelUrl) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'You have been added to a Slack channel',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Slack channel invitation</h2>
          <p>Hello ${name || ''},</p>
          <p>We have added you to the Slack channel <strong>#${channelName}</strong> for your interview process.</p>
          ${channelUrl ? `<p><strong>Open channel:</strong> <a href="${channelUrl}">${channelUrl}</a></p>` : ''}
          <p>If the link above doesn't open Slack, you can search for the channel by name: <strong>#${channelName}</strong>.</p>
          <p>Best regards,<br>AITF Team</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log(`Slack channel added email sent to ${email}`);
  } catch (error) {
    console.error('Error sending Slack channel added email:', error);
    throw error;
  }
};

const sendRejectionEmail = async (email, name, rejectionReason, feedback, jobName, roundName) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Application Update - ${jobName || 'Position'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Application Status Update</h2>
          <p>Dear ${name || 'Candidate'},</p>
          <p>Thank you for your interest in the ${jobName || 'position'} and for taking the time to participate in our ${roundName || 'interview'} process.</p>
          
          <p>After careful consideration, we have decided not to move forward with your application at this time.</p>
          
          ${rejectionReason ? `
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #dc3545;">Reason for Decision:</h4>
            <p style="margin: 0;">${rejectionReason}</p>
          </div>
          ` : ''}
          
          ${feedback ? `
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #0d6efd; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #0d6efd;">Feedback from Interviewers:</h4>
            <p style="margin: 0;">${feedback}</p>
          </div>
          ` : ''}
          
          <p>We encourage you to continue developing your skills and consider applying for future opportunities that match your profile.</p>
          
          <p>We wish you the best of luck in your career journey.</p>
          
          <p>Best regards,<br>AITF Recruitment Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Rejection email sent to ${email}`);
  } catch (error) {
    console.error('Error sending rejection email:', error);
    throw error;
  }
};

const sendBookingEmail = async (email, name, roundName, jobName, interviewerNames, bookingUrl, expiresAt) => {
  try {
    const expiryDate = new Date(expiresAt).toLocaleString();
    const interviewerList = interviewerNames.join(', ');
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Schedule Your Interview - ${jobName} (${roundName})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Schedule Your Interview</h2>
          <p>Dear ${name},</p>
          
          <p>Congratulations! You have been selected to proceed to the next stage of our interview process.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; color: #0d6efd;">Interview Details</h3>
            <p><strong>Position:</strong> ${jobName}</p>
            <p><strong>Round:</strong> ${roundName}</p>
            <p><strong>Interviewer(s):</strong> ${interviewerList}</p>
          </div>
          
          <p>Please click the button below to select your preferred interview time slot from the available options:</p>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${bookingUrl}" 
               style="background: #28a745; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold;
                      display: inline-block;">
              Schedule Interview
            </a>
          </p>
          
          <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0;"><strong>Important:</strong> This booking link will expire on <strong>${expiryDate}</strong>. Please schedule your interview before this time.</p>
          </div>
          
          <p><strong>What to expect:</strong></p>
          <ul>
            <li>You'll see available time slots that work for all interviewers</li>
            <li>Once you select a slot, a Google Meet link will be automatically created</li>
            <li>Calendar invitations will be sent to all participants</li>
            <li>You'll receive confirmation with meeting details</li>
          </ul>
          
          <p>If you have any questions or encounter any issues, please don't hesitate to contact us.</p>
          
          <p>We look forward to speaking with you!</p>
          
          <p>Best regards,<br>AITF Recruitment Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Booking email sent to ${email}`);
  } catch (error) {
    console.error('Error sending booking email:', error);
    throw error;
  }
};

const sendInterviewSlotBookedNotification = async (organizerEmail, organizerName, candidateEmail, candidateName, interviewerEmails, startTime, endTime, summary, meetLink) => {
  try {
    const formatDateTime = (date) => {
      return date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    };

    const duration = Math.round((endTime - startTime) / (1000 * 60)); // Duration in minutes
    const allInterviewers = interviewerEmails.join(', ');
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: organizerEmail,
      subject: `Interview Slot Booked - ${candidateName} (${summary})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Interview Slot Booked</h2>
          <p>Hello ${organizerName},</p>
          
          <p>An interview slot has been successfully booked. As the primary interviewer, you are the organizer of this interview session.</p>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="margin: 0 0 15px 0; color: #28a745;">📅 Interview Details</h3>
            <p><strong>Interview Title:</strong> ${summary}</p>
            <p><strong>Candidate:</strong> ${candidateName} (${candidateEmail})</p>
            <p><strong>Date & Time:</strong> ${formatDateTime(startTime)}</p>
            <p><strong>Duration:</strong> ${duration} minutes</p>
            <p><strong>All Interviewers:</strong> ${allInterviewers}</p>
          </div>
          
          ${meetLink ? `
          <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0d6efd;">
            <h3 style="margin: 0 0 15px 0; color: #0d6efd;">🎥 Meeting Link</h3>
            <p><strong>Google Meet:</strong> <a href="${meetLink}" style="color: #0d6efd;">${meetLink}</a></p>
            <p><em>This link will be shared with all participants via calendar invitations.</em></p>
          </div>
          ` : ''}
          
          <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #856404;">📋 As the Organizer:</h4>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>You have been set as the event organizer in Google Calendar</li>
              <li>Other interviewers will receive calendar invitations from you</li>
              <li>The candidate will also receive a calendar invitation</li>
              <li>You can manage the event from your Google Calendar</li>
            </ul>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #495057;">📝 Next Steps:</h4>
            <ol style="margin: 5px 0; padding-left: 20px;">
              <li>Check your Google Calendar for the event details</li>
              <li>Ensure all interviewers have accepted the invitation</li>
              <li>Prepare interview materials and questions</li>
              <li>Join the Google Meet at the scheduled time</li>
            </ol>
          </div>
          
          <p>If you need to make any changes to this interview, please contact the HR team or use your Google Calendar to modify the event.</p>
          
          <p>Thank you for your participation in the interview process!</p>
          
          <p>Best regards,<br>AITF System</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Interview slot booked notification sent to organizer: ${organizerEmail}`);
  } catch (error) {
    console.error('❌ Error sending interview slot booked notification:', error);
    throw error;
  }
};

const sendFinalOfferEmail = async (email, name, subject, body) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: subject || `Offer - Congratulations ${name}!`,
      html: body?.includes('<') ? body : (body || '').replace(/\n/g, '<br/>')
    };
    await transporter.sendMail(mailOptions);
    console.log(`Final offer email sent to ${email}`);
  } catch (error) {
    console.error('Error sending final offer email:', error);
    throw error;
  }
};

module.exports = { 
  sendWelcomeEmail, 
  sendPasswordResetEmail, 
  sendPasswordResetLink,
  sendSlackWorkspaceInviteEmail,
  sendSlackChannelAddedEmail,
  sendRejectionEmail,
  sendBookingEmail,
  sendInterviewSlotBookedNotification,
  sendFinalOfferEmail
};