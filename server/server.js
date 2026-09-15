// SenseBuddy backend server
// Made by Palak Soni
//
// This server holds the Gemini API key privately and proxies requests from
// the SenseBuddy web app. No user ever sees or needs their own API key.

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-flash-latest';

if (!GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY environment variable is not set.');
}

app.get('/', (req, res) => {
  res.send('SenseBuddy backend is running.');
});

app.post('/api/vision', async (req, res) => {
  try {
    const { image, prompt } = req.body;
    if (!image || !prompt) {
      return res.status(400).json({ error: 'Missing image or prompt' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: image } },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: `Gemini API error ${response.status}` });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ text });
  } catch (err) {
    console.error(err);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Gemini request timed out' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SenseBuddy backend listening on port ${PORT}`);
});
