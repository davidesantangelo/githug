# Changelog

All notable changes to GitHug are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-29

First tagged release, shipped from [githug.link](https://githug.link).

### Added

- **Follow from GitHug** — follow a match directly from their card with one click
  (uses the `user:follow` scope already requested at login). Followed users are
  tracked per account and shown as "Following", so you never lose track.
- **Match filtering** — search loaded matches by name, bio or @login, and filter
  by language via a dropdown. Includes an empty state with a one-click reset.
- **OAuth CSRF protection** — the login flow now sends a one-time `state` nonce
  that is validated when GitHub redirects back, preventing callback forgery.
- **Error boundary** — render errors show a friendly recovery screen instead of
  a blank page.
- **Repo count on cards** — public repo totals next to follower counts.
- **PWA manifest** — installable as a standalone app (`manifest.webmanifest`).
- **GitHub Actions CI** — lint, test and build run on every push/PR to `main`
  (`.github/workflows/ci.yml`).
- **Unit tests** — 54 tests covering the GitHub service (OAuth state validation,
  follow, search query diversification, rate-limit and network errors), utility
  helpers, and the full App component (login, follow, filtering, caching, error
  and OAuth callback handling).
- This CHANGELOG.

### Changed

- **"Load More" now returns new people** — later pages diversify GitHub search
  queries (secondary languages, more topics, broader popularity bands) and grow
  the candidate pool, instead of rescoring the same results. Duplicates are
  merged out defensively.
- **Theme no longer flashes** — the saved theme is applied before first paint
  via an inline bootstrap script in `index.html`.
- **Transient errors keep your session** — network/rate-limit failures during
  profile load now show an error message without logging you out; only real
  auth errors (401/Bad credentials) clear the token.
- **Logged-in badge shows your @login** and the logout button is a proper
  labeled control.
- Bumped `package.json` version to 1.0.0.

### Fixed

- **403s misreported as rate limits** — a 403 without rate-limit headers (e.g.
  "Resource not accessible by integration") is now reported with its real
  message instead of "Rate limit exceeded".
- **Edge function returns clear errors** when GitHub answers 200 without a
  token (expired/reused code) instead of persisting an empty token.
- `netlify.toml` no longer references a nonexistent `netlify/functions`
  directory (auth lives in `netlify/edge-functions`).
- `.gitignore` no longer excludes `.github/`, which silently blocked CI.
- README duplicate setup step and outdated project structure.
- `fetchGitHub` supports non-GET methods and `204 No Content` responses
  (previously it would crash with a JSON parse error on the follow endpoint).
- `npm run lint` (and CI) now passes: ESLint is aware of the Deno runtime in
  Netlify Edge Functions and of Node/Vitest globals in tests.

## [0.x] - Pre-release

Initial development iterations: React 19 + Vite 7 frontend, Netlify Edge
Function OAuth token exchange, weighted matching algorithm, dark/light theme,
session caching, Vitest setup. See the git history for details.
