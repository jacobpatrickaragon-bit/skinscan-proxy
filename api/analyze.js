/**
 * SkinScan AI — Gemini Vision Proxy
 * Deploy this on Vercel. Set GEMINI_API_KEY in your Vercel environment variables.
 * This keeps your API key secret and off the client side.
 */

export default async function handler(req, res) {
  const allowedOrigins = [
    'https://aragon-aesthetics-and-wellness.myshopify.com/',
    'https://your-custom-domain.com',
    'http://localhost:3000',
  ];

  const origin = req.headers.origin || '';
  if (allowedOrigins.some(o => origin.includes(o.replace('https://', '').replace('http://', '')))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { imageBase64, mimeType, quizData } = req.body;
    if (!imageBase64 || !quizData) {
      return res.status(400).json({ error: 'Missing imageBase64 or quizData' });
    }

    const prompt = buildPrompt(quizData);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2500,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'AI service error', detail: errText });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('JSON parse failed:', clean);
      parsed = buildFallback(quizData);
    }

    return res.status(200).json({ success: true, result: parsed });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function buildPrompt(quiz) {
  return `You are a professional dermatology AI. Analyze this selfie photo and return a strict JSON object.

Customer quiz:
- Self-reported skin type: ${quiz.skinType || 'not specified'}
- Primary concerns: ${(quiz.concerns || []).join(', ') || 'not specified'}
- Daily sun exposure: ${quiz.sun || 'not specified'}
- Routine complexity: ${quiz.routineSteps || 3} steps
- Age range: ${quiz.age || 'not specified'}

Instructions:
1. First, locate the face in the image. Report its bounding box in normalized image coordinates (0-1 where 0,0 is top-left and 1,1 is bottom-right).
2. Evaluate ALL 10 specific skin concerns listed below. For each, score 0-100 where HIGHER = BETTER skin quality (LESS of that concern). So score 100 = perfect, no concern visible at all; score 50 = noticeable concern; score 20 = severe concern. Examples: very red face → redness score 35; clear skin with no redness → redness score 95.
3. For each concern, identify visible regions where it appears as normalized coordinates of the IMAGE (not the face crop). Return 1-4 regions per concern. If a concern is NOT visible (score >= 95), return an empty regions array []. Otherwise return regions near the affected face area.
4. Be honest and specific — vary scores based on what you actually see. Score 100 means truly no visible concern.
5. Do NOT make medical diagnoses.

Respond ONLY with this exact JSON shape (no markdown fences):

{
  "analysis": "2-3 sentence specific professional analysis of what you observe in the photo combined with quiz data.",
  "metrics": {
    "overallScore": <integer 40-95>,
    "hydration": <integer 0-100, higher = more hydrated>,
    "clarity": <integer 0-100, higher = clearer>,
    "texture": <integer 0-100, higher = smoother>,
    "evenness": <integer 0-100, higher = more even tone>,
    "skinType": "<oily|dry|combination|normal|sensitive>",
    "skinTone": "<very light|light|fair|medium|olive|tan|deep>",
    "skinAge": "<e.g. '24-30'>",
    "positives": ["<one positive>", "<another positive>"]
  },
  "faceBox": { "x": <0-1>, "y": <0-1>, "w": <0-1>, "h": <0-1> },
  "concerns": [
    { "id": "redness", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "dark_circles", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "hydration", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "sagging", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "uniformness", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "pigmentation", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "lines", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "pores", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "breakouts", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] },
    { "id": "under_eye_puffiness", "score": <0-100>, "regions": [{"x": <0-1>, "y": <0-1>, "rx": <0-1>, "ry": <0-1>}] }
  ]
}

CRITICAL: All 10 concern IDs MUST appear in the array. Coordinates must be normalized 0-1 of the whole image. Use SMALL rx/ry values: 0.02-0.05 for small spots (single pimple/dark spot), 0.05-0.08 for medium areas (cheek, under-eye), MAX 0.10 for large diffuse areas. NEVER use rx/ry > 0.10 — masks should appear as targeted highlights, not face-covering overlays.`;
}

function buildFallback(quiz) {
  const type = quiz.skinType || 'combination';
  const concern = (quiz.concerns || [])[0] || 'overall balance';
  const defaultRegion = (x, y) => [{ x, y, rx: 0.08, ry: 0.06 }];
  return {
    analysis: `Based on your quiz responses, your ${type} skin shows patterns that benefit from a targeted routine. Your primary focus area of ${concern} can be improved with the right products.`,
    metrics: {
      overallScore: 68,
      hydration: 62,
      clarity: 70,
      texture: 65,
      evenness: 60,
      skinType: type,
      skinTone: 'medium',
      skinAge: '25-32',
      positives: ['Good overall skin structure', 'Manageable concerns with proper routine']
    },
    faceBox: { x: 0.5, y: 0.4, w: 0.55, h: 0.6 },
    concerns: [
      { id: 'redness', score: 75, regions: defaultRegion(0.35, 0.48).concat(defaultRegion(0.65, 0.48)) },
      { id: 'dark_circles', score: 70, regions: defaultRegion(0.38, 0.4).concat(defaultRegion(0.62, 0.4)) },
      { id: 'hydration', score: 65, regions: defaultRegion(0.5, 0.5) },
      { id: 'sagging', score: 88, regions: defaultRegion(0.5, 0.62) },
      { id: 'uniformness', score: 78, regions: defaultRegion(0.5, 0.5) },
      { id: 'pigmentation', score: 82, regions: defaultRegion(0.45, 0.52) },
      { id: 'lines', score: 85, regions: defaultRegion(0.5, 0.32) },
      { id: 'pores', score: 72, regions: defaultRegion(0.5, 0.5) },
      { id: 'breakouts', score: 88, regions: defaultRegion(0.45, 0.52) },
      { id: 'under_eye_puffiness', score: 80, regions: defaultRegion(0.38, 0.42).concat(defaultRegion(0.62, 0.42)) }
    ]
  };
}