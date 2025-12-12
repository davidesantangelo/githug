# How to Activate Real GitHub Authentication

To switch from "Mock Mode" to real GitHub login, follow these steps:

## 1. Create a GitHub OAuth Application (OAuth App)

> **Important**: Create an **OAuth App**, NOT a **GitHub App**.  
> A GitHub App gives you an **App ID** (often numeric) and a different auth flow; using that ID here commonly results in a GitHub **404** on the authorize page.

1. Go to your [GitHub Developer Settings](https://github.com/settings/developers).
2. Under **OAuth Apps**, click **"New OAuth App"**.
3. Fill in the form:
   - **Application Name**: `GitHug Local` (or any name you like)
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:5173/callback`
4. Click **Register application**.

## 2. Get your Client ID and Client Secret

1. On the next screen, you will see **Client ID** (a string like `Iv1.abc123...`).
2. Click **"Generate a new client secret"** and copy the secret immediately (you won't see it again).

> If your "client id" is just a number, you're likely looking at a **GitHub App ID** (wrong for this flow).

## 3. Configure Environment Variables

Create (or edit) a `.env` file in the project root:

```env
# Frontend (exposed to browser via Vite)
GITHUG_CLIENT_ID=your_client_id_here
GITHUG_REDIRECT_URI=http://localhost:5173/callback

# Backend (Netlify function) - keep these secret!
GITHUG_SERVER_CLIENT_ID=your_client_id_here
GITHUG_SERVER_CLIENT_SECRET=your_client_secret_here
GITHUG_SERVER_REDIRECT_URI=http://localhost:5173/callback
```

> **Note**: The `GITHUG_` prefix is configured in `vite.config.js` to expose frontend vars to the browser.  
> The `GITHUG_SERVER_` vars are only available server-side (in the Netlify function).

## 4. Run it locally

### Option A: With Netlify CLI (recommended)

```bash
npm install -g netlify-cli   # if you don't have it
netlify dev
```

This runs both Vite and the Netlify Functions locally on `http://localhost:8888`.

### Option B: Vite only (Mock mode)

```bash
npm run dev
```

Without the backend function, OAuth won't work and the app will run in **Mock Mode** with sample data.

## 5. Deploy to Netlify

1. Push your repo to GitHub.
2. Create a new site on [app.netlify.com](https://app.netlify.com) and connect your repo.
3. In **Site settings → Environment variables**, add:

   | Variable | Value |
   |----------|-------|
   | `GITHUG_CLIENT_ID` | your OAuth App Client ID |
   | `GITHUG_REDIRECT_URI` | `https://YOUR-SITE.netlify.app/callback` |
   | `GITHUG_SERVER_CLIENT_ID` | your OAuth App Client ID |
   | `GITHUG_SERVER_CLIENT_SECRET` | your OAuth App Client Secret |
   | `GITHUG_SERVER_REDIRECT_URI` | `https://YOUR-SITE.netlify.app/callback` |

4. **Update your GitHub OAuth App** with the production callback URL: `https://YOUR-SITE.netlify.app/callback`

5. Deploy!

---

## Troubleshooting

### GitHub 404 on authorize page
- You created a **GitHub App** instead of an **OAuth App**.
- You pasted an **App ID** instead of the OAuth App **Client ID**.
- Your OAuth App URLs don't match your dev server (e.g. `5174` vs `5173`).

### Token exchange fails
- Make sure `GITHUG_SERVER_CLIENT_SECRET` is set correctly.
- If running locally, use `netlify dev` to enable the backend function.
