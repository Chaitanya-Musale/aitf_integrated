// Resume parsing helper: uses Gemini if configured, otherwise basic regex heuristics.
// Exports: parseResume(text) -> { name, email, contact, program, course, skills_summary, ... }
async function parseWithGemini(text) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    let _fetch = (typeof fetch !== 'undefined') ? fetch : null;
    console.log('[Gemini] Key present:', !!key);
    if (!_fetch) {
      try { _fetch = require('node-fetch'); } catch (_) { return null; }
      console.log('[Gemini] Using node-fetch');
    } else {
      console.log('[Gemini] Using global fetch');
    }
    // Simple JSON extraction prompt. Uses Google Generative Language API v1beta REST.
    const prompt = [
      'You are an information extraction engine. Extract ONLY a strict JSON object with these keys:',
      'name, email, phone, college, degree, graduation_year, skills, experience_years, college_name,degree, graduation_year, other_educational_details, work_history.',
      'Rules:',
      '- Output JSON only, no prose, no markdown, no code fences.',
      '- skills must be an array of strings.',
      '- experience_years must be a number (0 if unknown).',
      '- work_history must be an array of objects: { company, position } (omit fields if unknown). for example:[{"company":"Advenzone","position":"SDE"},{"company":"amazon","position":"sde"}]',
      'Text to extract from follows:\n\n' + text
    ].join('\n');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + key;
    console.log('[Gemini] Requesting:', url);
    const resp = await _fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    console.log('[Gemini] Response status:', resp.status);
    const data = await resp.json();
    if (!resp.ok) {
      console.warn('[Gemini] Non-OK response:', data);
      return null;
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const combined = parts.map(p => p?.text || '').join('\n');
    // Try to find JSON in the response (handle optional code fences)
    let content = combined;
    const fenceMatch = content.match(/```json[\s\S]*?```/i);
    if (fenceMatch) {
      content = fenceMatch[0].replace(/```json|```/gi, '').trim();
    }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    console.log('[Gemini] Parsed JSON keys:', Object.keys(parsed || {}));
    return parsed;
  } catch (_) {
    console.warn('[Gemini] Exception during parseWithGemini');
    return null;
  }
}

async function geminiGetFile(nameOrUri) {
  const key = process.env.GEMINI_API_KEY;
  const _fetch = await ensureFetch();
  if (!key || !_fetch || !nameOrUri) return null;
  try {
    const isUri = String(nameOrUri).startsWith('http');
    const id = isUri ? nameOrUri : `https://generativelanguage.googleapis.com/v1beta/${nameOrUri}`;
    const url = id.includes('?') ? `${id}&key=${key}` : `${id}?key=${key}`;
    const resp = await _fetch(url, { method: 'GET' });
    const data = await resp.json();
    if (!resp.ok) {
      console.warn('[GeminiOCR] Get file failed:', data);
      return null;
    }
    return data.file || data; // API may wrap in {file}
  } catch (e) {
    console.warn('[GeminiOCR] Exception during geminiGetFile:', e.message);
    return null;
  }
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function geminiWaitForActive(fileRef, { timeoutMs = 20000, intervalMs = 800 } = {}) {
  const start = Date.now();
  const name = typeof fileRef === 'string' ? fileRef : (fileRef.name || fileRef.uri);
  if (!name) return null;
  while (Date.now() - start < timeoutMs) {
    const meta = await geminiGetFile(name);
    const state = meta?.state;
    // console.log('[GeminiOCR] File state:', state);
    if (state === 'ACTIVE') return meta;
    if (state === 'FAILED') {
      console.warn('[GeminiOCR] File processing FAILED');
      return null;
    }
    await sleep(intervalMs);
  }
  console.warn('[GeminiOCR] Wait for ACTIVE timed out');
  return null;
}

async function parseResume(text, fallbackName = '') {
  // Try Gemini
  const ai = await parseWithGemini(text);
  if (ai) {
    console.log('[Gemini] Using AI parsed resume');
    const aiSummary = buildJapaneseFitSummary(ai);
    return {
      name: ai.name || fallbackName,
      email: ai.email || '',
      contact: ai.phone || '',
      program: ai.degree || '',
      course: '',
      cgpa_percentage: '',
      years_experience: ai.experience_years ? Number(ai.experience_years) : 0,
      past_workplaces: JSON.stringify([]),
      positions: JSON.stringify([]),
      skills_summary: Array.isArray(ai.skills) ? ai.skills.join(', ') : (ai.skills || ''),
      // New structured arrays (best effort)
      educations: Array.isArray(ai.educations) ? ai.educations : [],
      work_history: Array.isArray(ai.work_history) ? ai.work_history : [],
      ai_summary: JSON.stringify(aiSummary)
    };
  }
  // No fallback: return minimal structure
  console.warn('[Gemini] No AI parse available; returning minimal structure');
  return {
    name: fallbackName,
    email: '',
    contact: '',
    program: '',
    course: '',
    cgpa_percentage: '',
    years_experience: 0,
    past_workplaces: JSON.stringify([]),
    positions: JSON.stringify([]),
    skills_summary: '',
    educations: [],
    work_history: [],
    ai_summary: JSON.stringify(buildJapaneseFitSummary({}))
  };
}

module.exports = { parseResume };

// Gemini 1.5 File API OCR helpers
async function ensureFetch() {
  if (typeof fetch !== 'undefined') return fetch;
  try { return require('node-fetch'); } catch (_) { return null; }
}

async function geminiUploadFile(buffer, mimeType, fileName) {
  const key = process.env.GEMINI_API_KEY;
  const _fetch = await ensureFetch();
  if (!key || !_fetch) return null;
  try {
    const url = 'https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media';
    console.log('[GeminiOCR] Uploading file to Gemini File API:', { mimeType, fileName });
    const resp = await _fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType || 'application/pdf',
        'X-Goog-Api-Key': key
      },
      body: buffer
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.warn('[GeminiOCR] Upload failed:', data);
      return null;
    }
    console.log('[GeminiOCR] Upload success payload:', data);
    const uploadedName = (data && data.file && data.file.name) ? data.file.name : (data && data.name ? data.name : null);
    const uploadedUri = (data && data.file && data.file.uri) ? data.file.uri : null;
    return { name: uploadedName, uri: uploadedUri };
  } catch (e) {
    console.warn('[GeminiOCR] Exception during upload:', e.message);
    return null;
  }
}

async function parseWithGeminiFile(fileRef, mimeType, prompt) {
  const key = process.env.GEMINI_API_KEY;
  const _fetch = await ensureFetch();
  if (!key || !_fetch || !fileRef) return null;
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + key;
    const fileUri = (typeof fileRef === 'string') ? fileRef : (fileRef.uri || fileRef.name);
    console.log('[GeminiOCR] Generating content for file:', fileUri);
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { file_data: { file_uri: fileUri, mime_type: mimeType || 'application/pdf' } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: { response_mime_type: 'application/json' }
    };
    const resp = await _fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    console.log('[GeminiOCR] Response status:', resp.status);
    if (!resp.ok) {
      console.warn('[GeminiOCR] Non-OK response:', data);
      return null;
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let combined = parts.map(p => p?.text || '').join('\n');
    const fence = combined.match(/```json[\s\S]*?```/i);
    if (fence) combined = fence[0].replace(/```json|```/gi, '').trim();
    const match = combined.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    console.log('[GeminiOCR] Parsed JSON keys:', Object.keys(parsed || {}));
    return parsed;
  } catch (e) {
    console.warn('[GeminiOCR] Exception during parseWithGeminiFile:', e.message);
    return null;
  }
}

async function parseWithGeminiInline(buffer, mimeType, prompt) {
  const key = process.env.GEMINI_API_KEY;
  const _fetch = await ensureFetch();
  if (!key || !_fetch) return null;
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + key;
    const base64 = Buffer.from(buffer).toString('base64');
    console.log('[GeminiOCR] Using inline_data for PDF, size(base64):', base64.length);
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType || 'application/pdf', data: base64 } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: { response_mime_type: 'application/json' }
    };
    const resp = await _fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    console.log('[GeminiOCR] Inline response status:', resp.status);
    if (!resp.ok) {
      console.warn('[GeminiOCR] Inline non-OK response:', data);
      return null;
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let combined = parts.map(p => p?.text || '').join('\n');
    const fence = combined.match(/```json[\s\S]*?```/i);
    if (fence) combined = fence[0].replace(/```json|```/gi, '').trim();
    const match = combined.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    console.log('[GeminiOCR] Inline parsed JSON keys:', Object.keys(parsed || {}));
    return parsed;
  } catch (e) {
    console.warn('[GeminiOCR] Exception during parseWithGeminiInline:', e.message);
    return null;
  }
}

async function parseResumeFromPdfBuffer(buffer, mimeType, fileName, fallbackName = '') {
  const schemaPrompt = [
    'Extract ONLY a strict JSON object with keys:',
    'name, email, phone, college_name, degree, graduation_year, other_educational_details, skills, experience_years, work_history.',
    'Rules:',
    '- Output JSON only, no prose, no markdown, no code fences.',
    '- skills must be an array of strings.',
    '- experience_years must be a number (0 if unknown).',
    '- work_history is an array of { company, position }.',
    'The PDF is provided as a file input.'
  ].join('\n');

  const fileRef = await geminiUploadFile(buffer, mimeType || 'application/pdf', fileName || 'resume.pdf');
  let ai = null;
  if (fileRef) {
    // Wait until file is ACTIVE before requesting content generation
    const activeMeta = await geminiWaitForActive(fileRef);
    if (activeMeta) {
      ai = await parseWithGeminiFile(fileRef, mimeType || 'application/pdf', schemaPrompt);
    } else {
      console.warn('[GeminiOCR] File not ACTIVE, falling back to inline_data');
      ai = await parseWithGeminiInline(buffer, mimeType || 'application/pdf', schemaPrompt);
    }
  } else {
    console.warn('[GeminiOCR] No fileRef returned; falling back to inline_data');
    ai = await parseWithGeminiInline(buffer, mimeType || 'application/pdf', schemaPrompt);
  }
  if (ai) {
    const aiSummary = buildJapaneseFitSummary(ai);
    return {
      name: ai.name || fallbackName,
      email: ai.email || '',
      contact: ai.phone || '',
      college_name: ai.college_name || '',
      degree: ai.degree || '',
      graduation_year: ai.graduation_year || '',
      program: ai.degree || '',
      course: '',
      cgpa_percentage: '',
      years_experience: ai.experience_years ? Number(ai.experience_years) : 0,
      past_workplaces: JSON.stringify([]),
      positions: JSON.stringify([]),
      skills_summary: Array.isArray(ai.skills) ? ai.skills.join(', ') : (ai.skills || ''),
      educations: Array.isArray(ai.educations) ? ai.educations : [],
      work_history: Array.isArray(ai.work_history) ? ai.work_history : [],
      ai_summary: JSON.stringify(aiSummary)
    };
  }
  console.warn('[GeminiOCR] AI parse failed; returning minimal structure');
  return {
    name: fallbackName,
    email: '',
    contact: '',
    college_name: '',
    degree: '',
    graduation_year: '',
    program: '',
    course: '',
    cgpa_percentage: '',
    years_experience: 0,
    past_workplaces: JSON.stringify([]),
    positions: JSON.stringify([]),
    skills_summary: '',
    educations: [],
    work_history: [],
    ai_summary: JSON.stringify(buildJapaneseFitSummary({}))
  };
}

module.exports.parseResumeFromPdfBuffer = parseResumeFromPdfBuffer;

// Simple heuristic-based cultural fit summary for Japanese companies
function normScore(x) { return Math.max(0, Math.min(100, Math.round(x))); }
function containsAny(text, arr) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return arr.some(k => t.includes(k));
}
function yearsFrom(ai) {
  const y = Number(ai?.experience_years || ai?.years_experience || 0);
  if (!isFinite(y)) return 0;
  return Math.max(0, y);
}
function buildJapaneseFitSummary(ai) {
  const skills = Array.isArray(ai?.skills) ? ai.skills.join(', ') : (ai?.skills || '');
  const work = JSON.stringify(ai?.work_history || '');
  const text = [skills, work, ai?.other_educational_details || '', ai?.degree || '', ai?.college_name || ''].join(' ').toLowerCase();

  const expYears = yearsFrom(ai);
  const expScore = expYears >= 5 ? 85 : expYears >= 3 ? 70 : expYears >= 1 ? 55 : 35;

  const teamworkKeywords = ['team', 'collaborat', 'cross-functional', 'scrum', 'agile', 'pair programming', 'mentor'];
  const leadershipKeywords = ['lead', 'managed', 'mentored', 'ownership', 'initiative', 'captain'];
  const communicationKeywords = ['communicat', 'presentation', 'documentation', 'client', 'stakeholder'];
  const detailKeywords = ['quality', 'kaizen', '5s', 'lean', 'six sigma', 'attention to detail', 'testing', 'lint', 'pdca'];
  const punctualityKeywords = ['deadline', 'on-time', 'punctual', 'time management'];
  const languageKeywords = ['japanese', 'jlpt', 'n1', 'n2', 'n3', 'bilingual', 'nihongo'];
  const customerKeywords = ['customer', 'client', 'support', 'service', 'omotenashi', 'csat', 'nps', 'satisfaction'];
  const processKeywords = ['process', 'standard', 'sop', 'iso', 'compliance', 'documentation', 'audit', 'procedure', 'policy', 'kaizen', '5s', 'lean'];
  const humilityKeywords = ['humble', 'respect', 'polite', 'courteous', 'keigo', 'listen', 'feedback', 'collaborative'];
  const learningKeywords = ['learn', 'learning', 'training', 'certification', 'course', 'continuous improvement', 'self-learning'];
  const crossCulturalKeywords = ['japan', 'tokyo', 'osaka', 'kyoto', 'multinational', 'global', 'cross-cultural', 'international', 'onsite', 'offshore'];

  const teamworkHit = containsAny(text, teamworkKeywords);
  const leadershipHit = containsAny(text, leadershipKeywords);
  const communicationHit = containsAny(text, communicationKeywords);
  const attentionHit = containsAny(text, detailKeywords);
  const punctualityHit = containsAny(text, punctualityKeywords);
  const teamworkScore = teamworkHit ? 75 : 55;
  const leadershipScore = leadershipHit ? 70 : 50;
  const communicationScore = communicationHit ? 70 : 55;
  const attentionScore = attentionHit ? 80 : 60;
  const punctualityScore = punctualityHit ? 75 : 60;

  // Additional factors
  const hasN2N1 = containsAny(text, ['n1', 'n2']);
  const languageHit = containsAny(text, languageKeywords) || hasN2N1;
  const customerHit = containsAny(text, customerKeywords);
  const processHit = containsAny(text, processKeywords);
  const humilityHit = containsAny(text, humilityKeywords);
  const learningHit = containsAny(text, learningKeywords);
  const crossCulturalHit = containsAny(text, crossCulturalKeywords);
  const langScore = hasN2N1 ? 85 : languageHit ? 70 : 50;
  const customerScore = customerHit ? 75 : 55;
  const processScore = processHit ? 80 : 60;
  const humilityScore = humilityHit ? 70 : 60;
  const learningScore = learningHit ? 70 : 55;
  const crossCulturalScore = crossCulturalHit ? 70 : 55;

  // Stability/loyalty heuristic using work_history company count + years
  let companies = 0;
  try {
    const wh = Array.isArray(ai?.work_history) ? ai.work_history : [];
    const uniqueCompanies = new Set(wh.map(w => (w?.company || '').toLowerCase()).filter(Boolean));
    companies = uniqueCompanies.size;
  } catch(_) { companies = 0; }
  const stabilityScore = (expYears >= 5 && companies <= 2) ? 80 : (expYears >= 3 && companies <= 3) ? 70 : 55;

  const weights = {
    experience: 0.18,
    teamwork: 0.12,
    leadership: 0.08,
    communication: 0.10,
    attention_to_detail: 0.08,
    punctuality: 0.08,
    process_discipline: 0.08,
    customer_orientation: 0.08,
    language_japanese: 0.06,
    stability_loyalty: 0.06,
    humility_respect: 0.04,
    learning_mindset: 0.02,
    cross_cultural: 0.02,
  };
  const overall =
    expScore * weights.experience +
    teamworkScore * weights.teamwork +
    leadershipScore * weights.leadership +
    communicationScore * weights.communication +
    attentionScore * weights.attention_to_detail +
    punctualityScore * weights.punctuality +
    processScore * weights.process_discipline +
    customerScore * weights.customer_orientation +
    langScore * weights.language_japanese +
    stabilityScore * weights.stability_loyalty +
    humilityScore * weights.humility_respect +
    learningScore * weights.learning_mindset +
    crossCulturalScore * weights.cross_cultural;

  // Narrative assembly (detailed)
  const lines = [];
  // Experience summary
  const expMonths = Math.max(0, Math.round(expYears * 12));
  lines.push(`Experience: ${expYears} year${expYears === 1 ? '' : 's'} (${expMonths} month${expMonths === 1 ? '' : 's'}) overall${expYears >= 5 ? ', indicating a mature profile' : expYears >= 3 ? ', indicating mid-level capability' : ''}.`);

  // Skills and signals summary
  const signalBits = [];
  if (teamworkHit) signalBits.push('teamwork/collaboration');
  if (communicationHit) signalBits.push('stakeholder communication');
  if (processHit || attentionHit) signalBits.push('quality and process discipline (kaizen/5S/ISO/PDCA)');
  if (customerHit) signalBits.push('customer orientation');
  if (punctualityHit) signalBits.push('punctuality/time management');
  if (signalBits.length) {
    lines.push(`Observed strengths: ${signalBits.join(', ')}.`);
  }

  // Language & cross-cultural
  if (languageHit) {
    lines.push(`Japanese language: ${hasN2N1 ? 'JLPT N2/N1 signals present' : 'exposure detected'}; beneficial for client interactions and documentation.`);
  }
  if (crossCulturalHit) {
    lines.push('Cross-cultural exposure noted (Japan/global/onsite-offshore), suggesting adaptability to Japanese work settings.');
  }

  // Stability/loyalty
  lines.push(`Stability: ${stabilityScore >= 80 ? 'high (few employers over longer tenure)' : stabilityScore >= 70 ? 'good' : 'mixed'} based on work history.`);

  // Learning mindset
  if (learningHit) {
    lines.push('Learning mindset evidenced by training/certifications/courses, supporting continuous improvement.');
  }

  // Risks / gaps
  const gaps = [];
  if (!processHit && !attentionHit) gaps.push('limited explicit mention of kaizen/5S/ISO');
  if (!customerHit) gaps.push('few explicit customer-service references');
  if (!languageHit) gaps.push('no Japanese language signals');
  if (!teamworkHit) gaps.push('little emphasis on teamwork');
  if (gaps.length) {
    lines.push(`Potential gaps: ${gaps.join('; ')}.`);
  }

  // Closing remark linked to Japanese workplace expectations
  lines.push('Overall, the profile aligns with core Japanese workplace expectations around quality, reliability, and respect for process; onsite communication readiness may depend on language and client-facing exposure.');

  // Inline parameters (key=value) to give detailed signals without exposing the raw factor grid
  const params = [
    `experience=${Math.round(expScore)}`,
    `teamwork=${Math.round(teamworkScore)}`,
    `leadership=${Math.round(leadershipScore)}`,
    `communication=${Math.round(communicationScore)}`,
    `attention_to_detail=${Math.round(attentionScore)}`,
    `punctuality=${Math.round(punctualityScore)}`,
    `process_discipline=${Math.round(processScore)}`,
    `customer_orientation=${Math.round(customerScore)}`,
    `language_japanese=${Math.round(langScore)}`,
    `stability_loyalty=${Math.round(stabilityScore)}`,
    `learning_mindset=${Math.round(learningScore)}`,
    `cross_cultural=${Math.round(crossCulturalScore)}`,
  ].join(', ');
  lines.push(`Parameters: ${params}.`);

  const narrative = lines.join(' ');

  return {
    context: 'Cultural fit for Japanese companies',
    overall_score: normScore(overall),
    narrative
  };
}
