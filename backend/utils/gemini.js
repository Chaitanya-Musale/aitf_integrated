const fetch = require('node-fetch');

async function generateOfferEmail(candidateName, jobName, feedbackSummary) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const subject = `Offer: ${jobName} - Congratulations ${candidateName}!`;
    const body = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 12px 0;color:#0d6efd;">Congratulations, ${candidateName}!</h2>
        <p style="margin:0 0 12px 0">We're delighted to inform you that you have been selected for the <strong>${jobName}</strong> role.</p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:16px 0">
          <h3 style="margin:0 0 8px 0;font-size:15px;color:#334155;">Interview Feedback Highlights</h3>
          <div style="white-space:pre-line;font-size:14px;color:#334155;">${(feedbackSummary || '- Positive performance across rounds.').replace(/</g,'&lt;')}</div>
        </div>
        <h3 style="margin:16px 0 8px 0;font-size:15px;color:#334155;">Next Steps</h3>
        <ul style="margin:0 0 16px 18px;color:#111;font-size:14px;line-height:1.6">
          <li>Our HR team will contact you with offer details and joining formalities.</li>
          <li>Please review and acknowledge the offer upon receipt.</li>
          <li>Feel free to reply to this email for any clarifications.</li>
        </ul>
        <p style="margin:0 0 8px 0">Welcome aboard!</p>
        <p style="margin:0;color:#334155">Best regards,<br/>AITF Recruitment Team</p>
      </div>`;
    return { subject, body };
  }

  const prompt = `You are an HR assistant. Draft a concise, warm, professional job offer email in clean HTML. Requirements:\n- Personalize with candidate name and job name.\n- Add a congratulatory headline.\n- Include a bullet list of feedback highlights extracted from the raw feedback (use short, positive phrasing).\n- Add a short Next Steps section.\n- Keep under 220 words.\n- No extraneous wrappers beyond a single outer <div>.\n- Use semantic headings (<h2>/<h3>) and simple inline styles only.\n\nReturn ONLY HTML.\n\nCandidate: ${candidateName}\nRole: ${jobName}\nFeedback (raw):\n${feedbackSummary || 'N/A'}`;

  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const subject = `Offer: ${jobName} - Congratulations ${candidateName}!`;
    const fallbackHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 12px 0;color:#0d6efd;">Congratulations, ${candidateName}!</h2>
        <p style="margin:0 0 12px 0">You've been selected for the <strong>${jobName}</strong> role.</p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:16px 0">
          <h3 style="margin:0 0 8px 0;font-size:15px;color:#334155;">Interview Feedback Highlights</h3>
          <div style="white-space:pre-line;font-size:14px;color:#334155;">${(feedbackSummary || '- Positive performance across rounds.').replace(/</g,'&lt;')}</div>
        </div>
        <h3 style="margin:16px 0 8px 0;font-size:15px;color:#334155;">Next Steps</h3>
        <ul style="margin:0 0 16px 18px;color:#111;font-size:14px;line-height:1.6">
          <li>HR will share the formal offer and documentation.</li>
          <li>Review and confirm your acceptance.</li>
        </ul>
        <p style="margin:0;color:#334155">Best regards,<br/>AITF Recruitment Team</p>
      </div>`;
    const body = text && text.trim().length > 0 ? text : fallbackHtml;
    return { subject, body };
  } catch (e) {
    const subject = `Offer: ${jobName} - Congratulations ${candidateName}!`;
    const body = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 12px 0;color:#0d6efd;">Congratulations, ${candidateName}!</h2>
        <p style="margin:0 0 12px 0">You have been selected for the <strong>${jobName}</strong> role.</p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:16px 0">
          <h3 style="margin:0 0 8px 0;font-size:15px;color:#334155;">Interview Feedback Highlights</h3>
          <div style="white-space:pre-line;font-size:14px;color:#334155;">${(feedbackSummary || '- Positive performance across rounds.').replace(/</g,'&lt;')}</div>
        </div>
        <h3 style="margin:16px 0 8px 0;font-size:15px;color:#334155;">Next Steps</h3>
        <ul style="margin:0 0 16px 18px;color:#111;font-size:14px;line-height:1.6">
          <li>HR will reach out with offer details and joining formalities.</li>
          <li>Reply to this email if you have any questions.</li>
        </ul>
        <p style="margin:0;color:#334155">Best regards,<br/>AITF Recruitment Team</p>
      </div>`;
    return { subject, body };
  }
}

module.exports = { generateOfferEmail };
