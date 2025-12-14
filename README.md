# GitHug

**Find your code mate.** Discover new GitHub users you don't follow yet, matched by your stack and interests.

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Vite](https://img.shields.io/badge/Vite-7-purple?logo=vite)
![Netlify](https://img.shields.io/badge/Netlify-ready-00C7B7?logo=netlify)
[![Netlify Status](https://api.netlify.com/api/v1/badges/e98b7c2e-e642-4595-be45-e86d5ec132f8/deploy-status)](https://app.netlify.com/projects/githug/deploys)

## Features

- GitHub OAuth authentication
- Find **new users** by location, languages & starred repos
- Automatically excludes people you already follow
- Dark/light mode
- Fast & responsive UI
- Deploy-ready for Netlify
- **Architecture**: Separated Client (React) and Server (Netlify Functions)

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

# Run full stack (Split Terminal - Recommended)

# Terminal 1: Backend (Netlify Functions)
npm run dev:functions

# Terminal 2: Frontend (Vite)
npm run dev

# Or Vite only (mock mode, no OAuth)
npm run dev
```

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend**: [http://localhost:9999](http://localhost:9999)

## Setup

1. Create a [GitHub OAuth App](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Set callback URL: `http://localhost:5173/callback`

   > **Important**: Use port **5173** even with `netlify dev` (port 8888 is just a proxy layer).

3. Copy Client ID & generate a Client Secret
4. Edit `.env`:

4. Edit `.env` (Set ports correctly):

```env
# Frontend (exposed to browser)
GITHUG_CLIENT_ID=your_client_id
GITHUG_REDIRECT_URI=http://localhost:5173/callback
GITHUG_FUNCTION_URL=http://localhost:9999/.netlify/functions/auth

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
│   ├── services/
│   │   └── github.js     # GitHub API & OAuth
│   └── lib/
│       └── utils.js      # Utilities
├── netlify/
│   └── functions/
│       └── auth.js       # OAuth token exchange
├── netlify.toml          # Netlify config
└── .env.example          # Env template
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Frontend only (Mock mode/UI) |
| `netlify dev` | Start Full Stack (Client + Functions) |
| `npm run dev:functions` | Start Functions server only |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage report |

## License

MIT
