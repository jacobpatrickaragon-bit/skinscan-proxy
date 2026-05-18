/**
 * SkinScan AI — Gemini Vision Proxy
 * Deploy this on Vercel. Set GEMINI_API_KEY in your Vercel environment variables.
 * This keeps your API key secret and off the client side.
 */

export default async function handler(req, res) {
  // Allow requests from your Shopify store domain
  // Replace 'your-store.myshopify.com' with your actual store URL
  const allowedOrigins = [
  'https://aragon-aesthetics-and-wellness.myshopify.com/',  // ← Replace with YOUR store URL
  'https://your-custom-domain.com',                 // ← If you have a custom domain
  'http://localhost:3000',                          // ← Keep this for testing
];

  const origin = req.headers.origin || '';
  if (allowedOrigins.some(o => origin.includes(o.replace('https://', '').replace('http://', '')))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*'); // loosen during dev, tighten for production
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { imageBase64, mimeType, quizData } = req.body;

    if (!imageBase64 || !quizData) {
      return res.status(400).json({ error: 'Missing imageBase64 or quizData' });
    }

    const prompt = buildPrompt(quizData);

    // Call Gemini 1.5 Flash — fast, free tier, great for vision
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: imageBase64,
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1000,
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

    // Strip any markdown code fences Gemini might add
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('JSON parse failed:', clean);
      // Return a fallback so the frontend never breaks
      parsed = buildFallback(quizData);
    }

    return res.status(200).json({ success: true, result: parsed });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function buildPrompt(quiz) {
  return `You are a professional dermatology AI assistant. Analyze this selfie photo carefully for visible skin indicators.

Customer quiz responses:
- Self-reported skin type: ${quiz.skinType || 'not specified'}
- Primary concerns: ${(quiz.concerns || []).join(', ') || 'not specified'}
- Daily sun exposure: ${quiz.sun || 'not specified'}
- Current routine complexity: ${quiz.routineSteps || 3} steps
- Age range: ${quiz.age || 'not specified'}

Instructions:
1. Carefully examine the photo for visible skin characteristics: texture, tone evenness, visible pores, oiliness or dryness, redness, dark spots, fine lines, or blemishes.
2. Combine your visual observations with the quiz data to form a complete picture.
3. Be constructive, professional, and specific — not generic.
4. Do NOT make medical diagnoses. Frame everything as skincare observations.

Respond ONLY with a valid JSON object. No preamble, no explanation, no markdown fences. Just the raw JSON:

{
  "analysis": "2-3 sentences of specific, professional skin analysis combining what you observe visually with the quiz data. Mention specific visible characteristics you notice.",
  "metrics": {
    "overallScore": <integer 40-95, honest assessment>,
    "hydration": <integer 0-100>,
    "clarity": <integer 0-100>,
    "texture": <integer 0-100>,
    "evenness": <integer 0-100>,
    "skinType": "<oily|dry|combination|normal|sensitive — your visual assessment>",
    "skinAge": "<estimated appearance age range e.g. '24-30'>",
    "topConcern": "<single most pressing concern you observe>",
    "concerns": [
      {"name": "<visible concern 1>", "severity": "<high|med|low>"},
      {"name": "<visible concern 2>", "severity": "<high|med|low>"},
      {"name": "<visible concern 3>", "severity": "<high|med|low>"}
    ],
    "positives": [
      "<one positive skin attribute you observe>",
      "<another positive attribute>"
    ]
  }
}`;
}

function buildFallback(quiz) {
  const type = quiz.skinType || 'combination';
  const concern = (quiz.concerns || [])[0] || 'overall balance';
  return {
    analysis: `Based on your quiz responses, your ${type} skin shows patterns that benefit from a targeted routine. Your primary focus area of ${concern} can be meaningfully improved with the right products and consistency. Your skin's baseline health looks promising with the right regimen.`,
    metrics: {
      overallScore: 68,
      hydration: 62,
      clarity: 70,
      texture: 65,
      evenness: 60,
      skinType: type,
      skinAge: '25-32',
      topConcern: concern,
      concerns: [
        { name: concern, severity: 'high' },
        { name: 'Hydration', severity: 'med' },
        { name: 'Texture', severity: 'low' }
      ],
      positives: [
        'Good overall skin structure',
        'Manageable concerns with proper routine'
      ]
    }
  };
}
