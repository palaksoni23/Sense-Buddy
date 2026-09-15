# SenseBuddy
Made by Palak Soni

An accessibility companion web app with two modes:
- **Vision Mode**: uses your camera + Gemini AI to describe your surroundings out loud, answer questions about what's in view, read text/signs aloud, and warn of hazards during live narration.
- **Voice Mode**: type or dictate a message and SenseBuddy speaks it out loud for you — and can listen to replies and show them as text.

No user ever needs their own API key — a private backend holds the Gemini key securely, so this is safe to share publicly.

## Project structure
```
sensebuddy-app/
├── index.html, app.js, manifest.json, service-worker.js, icons/  ← the web app (frontend)
└── server/                                                        ← the backend (keeps your Gemini key private)
    ├── server.js
    └── package.json
```

## Step 1: Deploy the backend (do this first)
1. Push this whole folder to GitHub (or a separate repo just for `server/`)
2. On Render.com: **New** → **Web Service**
3. Connect your repo, set **Root Directory** to `server`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Under **Environment**, add a variable: `GEMINI_API_KEY` = your Gemini key (get one free at aistudio.google.com — this is the ONE key that powers the whole app for everyone)
7. Deploy — Render gives you a URL like `https://sensebuddy-backend.onrender.com`

## Step 2: Point the frontend at your backend
1. Open `app.js`
2. Find this line near the top:
   ```js
   const BACKEND_URL = 'https://sensebuddy-backend.onrender.com';
   ```
3. Replace it with YOUR actual backend URL from Step 1
4. Save

## Step 3: Deploy the frontend
1. On Render: **New** → **Static Site**
2. Connect the same repo
3. Publish Directory: `.` (or wherever index.html sits, if you separated the repos)
4. Deploy — you get your public app link, e.g. `https://sensebuddy.onrender.com`

Share that link — anyone can use it immediately, no setup, no API key of their own needed.

## Testing locally before deploying
1. In `server/`, run `npm install` then `GEMINI_API_KEY=your_key npm start` (backend runs on port 3001)
2. In `app.js`, temporarily set `BACKEND_URL = 'http://localhost:3001'`
3. In the main folder, run `python3 -m http.server 8000`
4. Open `http://localhost:8000` — camera/mic work fine on localhost
5. Remember to switch `BACKEND_URL` back to your real Render backend URL before deploying the frontend

## A note on limits
This uses Gemini's free tier under the hood (no billing on your end), which has a shared rate limit across all users (roughly 15 requests/minute, ~1,500/day at time of writing — check your Google AI Studio dashboard for current numbers). That's enough for demos and early users. If usage grows a lot, you can enable billing on the same Gemini key later — nothing in the app needs to change, it'll just stop hitting the free-tier ceiling.

## Installing it as an app on a phone
1. Open the hosted link in Chrome (Android) or Safari (iPhone)
2. A banner will appear: "Install SenseBuddy as an app" — tap Install
   (On iPhone Safari: tap Share → Add to Home Screen)
3. The SenseBuddy icon appears on the home screen and opens full-screen, like a native app

## Turning it into a downloadable APK (optional)
1. After deploying the frontend (Step 3), go to **https://www.pwabuilder.com**
2. Paste your hosted URL and click "Start"
3. Download the generated Android package — it uses your SenseBuddy icon and name automatically

## Credits
Designed and built by **Palak Soni** for the Build, Ship, Shape: Amazon Developer Hackathon.

