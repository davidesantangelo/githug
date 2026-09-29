# GitHug

**Find your code mate.** Discover new GitHub users you don't follow yet, matched by your stack and interests.

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Vite](https://img.shields.io/badge/Vite-7-purple?logo=vite)
![Netlify](https://img.shields.io/badge/Netlify-ready-00C7B7?logo=netlify)
[![Netlify Status](https://api.netlify.com/api/v1/badges/e98b7c2e-e642-4595-be45-e86d5ec132f8/deploy-status)](https://app.netlify.com/projects/githug/deploys)

## Features

- GitHub OAuth authentication (with `state` nonce CSRF protection)
- Find **new users** by location, languages & starred repos
- Automatically excludes people you already follow
- **Follow matches in one click** — follow directly from a card, tracked per account
- **Filter matches** — search by name/bio/@login and filter by language
- Dark/light mode (no flash on reload, respects system preference)
- Fast & responsive UI, installable as a PWA
- Deploy-ready for Netlify
- **Architecture**: Separated Client (React) and Server (Netlify Edge Functions)

## Matching Algorithm

GitHug uses a weighted scoring system (0-100%) to find your best matches. It analyzes your public GitHub profile and compares it with potential candidates.

**Key Factors:**

1.  **Tech Stack (30%)**: High overlap in your primary languages (e.g. both use Rust & TypeScript).
2.  **Admired Work (20%)**: Matches who are maintainers of repositories you've starred.
3.  **Shared Interests (18%)**: Common topics in repositories and bio (e.g. "machine-learning", "react").
4.  **Bio Context (12%)**: Keywords in their bio that match your interests.
5.  **Proximity (8%)**: Users located in the same country/region.
6.  **Influence (7%)**: Balanced follower/following ratio.
7.  **Activity (5%)**: Recent code pushes (within last 7-30 days).

*Note: You will never be matched with people you already follow.*

## Architecture

GitHug uses a **hybrid architecture** to ensure security and performance:

- **Client (Frontend)**: React + Vite. Handles the UI, matching logic, and caching.
- **Server (Backend)**: Netlify Functions. Handles the secure OAuth token exchange with GitHub.

This separation ensures your `client_secret` never exposes to the browser.
To run the full application locally, you use the Netlify CLI to spin up both the frontend dev server and the functions server.

```bash
# Clone & install
git clone https://github.com/davidesantangelo/githug.git
cd githug
npm install

# Configure (see Setup below)
cp .env.example .env

# Run full stack (two terminals)

# Terminal 1: Netlify CLI (serves the OAuth edge function on :8888)
npm run dev:netlify

# Terminal 2: Frontend (Vite on :5173, proxies /api to :8888)
npm run dev

# Or Vite only (mock mode, no OAuth)
npm run dev
```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Netlify (edge functions)**: [http://localhost:8888](http://localhost:8888)

> The Vite dev server proxies `/api/*` to `netlify dev`, so
> `GITHUG_FUNCTION_URL=/api/auth` works identically in dev and production.

## Setup

1. Create a [GitHub OAuth App](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Set callback URL: `http://localhost:5173/callback`

   > **Important**: Use port **5173** even with `netlify dev` (port 8888 is just a proxy layer).

3. Copy Client ID & generate a Client Secret
4. Edit `.env` (Set ports correctly):

```env
# Frontend (exposed to browser)
GITHUG_CLIENT_ID=your_client_id
GITHUG_REDIRECT_URI=http://localhost:5173/callback
GITHUG_FUNCTION_URL=/api/auth

# Backend (Netlify function - keep secret!)
GITHUG_SERVER_CLIENT_ID=your_client_id
GITHUG_SERVER_CLIENT_SECRET=your_client_secret
GITHUG_SERVER_REDIRECT_URI=http://localhost:5173/callback
```

📖 See [SETUP_GITHUB_AUTH.md](SETUP_GITHUB_AUTH.md) for detailed instructions.

## Deploy to Netlify

1. Push to GitHub
2. Connect repo on [netlify.com](https://app.netlify.com)
3. Add environment variables (same as above, with production URLs)
4. Update GitHub OAuth App callback to `https://YOUR-SITE.netlify.app/callback`
5. Deploy!

## Project Structure

```
githug/
├── src/
│   ├── App.jsx           # Main app component
│   ├── ErrorBoundary.jsx # Render-error recovery screen
│   ├── services/
│   │   └── github.js     # GitHub API, OAuth & matching
│   └── lib/
│       └── utils.js      # Utilities (cn, formatCount)
├── netlify/
│   └── edge-functions/
│       └── auth.js       # OAuth token exchange
├── .github/workflows/
│   └── ci.yml            # Lint, test & build on push/PR
├── netlify.toml          # Netlify config
├── CHANGELOG.md          # Release history
└── .env.example          # Env template
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Frontend only (Mock mode/UI) |
| `npm run dev:netlify` | Start Netlify CLI with edge functions |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint with ESLint |

## Releasing

Releases follow [Semantic Versioning](https://semver.org/). History is tracked
in [CHANGELOG.md](CHANGELOG.md); CI (lint + tests + build) must pass on `main`
before tagging.

## License

MIT
