/**
 * GitHug – GitHub matching service
 * Optimized for performance and match quality
 */

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_API_URL = 'https://api.github.com';

const CONFIG = Object.freeze({
    timeoutMs: 10_000,
    pageSize: 12,
    concurrency: 8,
    cacheTtlMs: 5 * 60_000,
    cacheMaxSize: 500,
    maxCandidatesToScore: 30,
    reposPerUser: 15,
    starredPerUser: 25,
});

// Scoring weights (total max ~100)
const WEIGHTS = Object.freeze({
    languageOverlap: 30,      // primary tech stack match
    starredOwner: 20,         // you admire their work
    topicOverlap: 18,         // shared interests
    bioKeyword: 12,           // bio mentions your topics
    sameCountry: 8,           // geographic proximity
    followerRatio: 7,         // influence indicator
    recentActivity: 5,        // actively coding
});

// ─────────────────────────────────────────────────────────────
// LRU Cache with size limit
// ─────────────────────────────────────────────────────────────
class LRUCache {
    constructor(maxSize = CONFIG.cacheMaxSize, ttlMs = CONFIG.cacheTtlMs) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        
        const now = Date.now();
        if (now > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }
        
        // Move to end only if not already the most recent
        if (this.cache.size > 1) {
            this.cache.delete(key);
            this.cache.set(key, entry);
        }
        return entry.value;
    }

    set(key, value, ttlMs = this.ttlMs) {
        // If key exists, just update it
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove oldest (first) entry
            const oldest = this.cache.keys().next().value;
            this.cache.delete(oldest);
        }
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    }

    has(key) {
        return this.get(key) !== undefined;
    }

    clear() {
        this.cache.clear();
    }
}

const profileCache = new LRUCache();
const searchCache = new LRUCache(200, 3 * 60_000);
const userCache = new LRUCache();

// ─────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────
class GitHubApiError extends Error {
    constructor(message, { status, rateLimit, requestId } = {}) {
        super(message);
        this.name = 'GitHubApiError';
        this.status = status;
        this.rateLimit = rateLimit;
        this.requestId = requestId;
    }
}

// ─────────────────────────────────────────────────────────────
// HTTP utilities
// ─────────────────────────────────────────────────────────────
const buildHeaders = (token) => ({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token && { Authorization: `Bearer ${token}` }),
});

const parseRateLimit = (headers) => ({
    remaining: Number(headers.get('x-ratelimit-remaining')) || 0,
    reset: Number(headers.get('x-ratelimit-reset')) || 0,
});

/**
 * Fetch JSON from GitHub API with timeout and error handling
 */
const fetchGitHub = async (url, { token, signal, timeoutMs = CONFIG.timeoutMs } = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Link external signal
    if (signal) {
        if (signal.aborted) throw new GitHubApiError('Request aborted');
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
        const res = await fetch(url, {
            headers: buildHeaders(token),
            signal: controller.signal,
        });

        if (res.ok) return res.json();

        const rateLimit = parseRateLimit(res.headers);
        if (res.status === 403 && rateLimit.remaining === 0) {
            const waitSec = Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000));
            throw new GitHubApiError(`Rate limit exceeded. Retry in ${waitSec}s.`, { status: 403, rateLimit });
        }

        const body = await res.json().catch(() => ({}));
        throw new GitHubApiError(body.message || `GitHub API error (${res.status})`, { status: res.status });
    } catch (err) {
        if (err.name === 'AbortError') throw new GitHubApiError('Request timed out');
        if (err instanceof GitHubApiError) throw err;
        throw new GitHubApiError(err.message || 'Network error');
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * Run async tasks with bounded concurrency
 */
const parallel = async (items, concurrency, fn) => {
    const results = [];
    let idx = 0;

    const worker = async () => {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await fn(items[i], i);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
};

// ─────────────────────────────────────────────────────────────
// Profile building (optimized: single call for repos+langs+topics)
// ─────────────────────────────────────────────────────────────

/**
 * Extract languages and topics from repos in one pass
 * Optimized: weights recent activity and popularity, filters low-quality repos
 */
const analyzeRepos = (repos) => {
    const langCount = {};
    const topicCount = {};
    const now = Date.now();

    for (const repo of repos) {
        // Skip forks and archived repos
        if (repo.fork || repo.archived) continue;

        if (repo.language) {
            // Weight by stars + recency (repos pushed in last 90 days get 2x weight)
            const daysSincePush = (now - new Date(repo.pushed_at || 0).getTime()) / (1000 * 60 * 60 * 24);
            const recencyMultiplier = daysSincePush < 90 ? 2 : 1;
            const weight = (repo.stargazers_count || 1) * recencyMultiplier;
            langCount[repo.language] = (langCount[repo.language] || 0) + weight;
        }
        
        for (const topic of repo.topics || []) {
            topicCount[topic] = (topicCount[topic] || 0) + 1;
        }
    }

    const languages = Object.entries(langCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([lang]) => lang);

    const topics = Object.entries(topicCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([topic]) => topic);

    return { languages, topics };
};

/**
 * Build complete user profile (cached)
 */
const buildProfile = async (token, user, { signal } = {}) => {
    const cacheKey = `profile:${user.login}`;
    const cached = profileCache.get(cacheKey);
    if (cached) return cached;

    // Fetch repos and starred in parallel
    const [repos, starred] = await Promise.all([
        fetchGitHub(`${GITHUB_API_URL}/users/${user.login}/repos?per_page=${CONFIG.reposPerUser}&sort=pushed`, { token, signal }).catch(() => []),
        fetchGitHub(`${GITHUB_API_URL}/users/${user.login}/starred?per_page=${CONFIG.starredPerUser}`, { token, signal }).catch(() => []),
    ]);

    const { languages, topics } = analyzeRepos(repos);

    const starredOwners = [...new Set(starred.map((r) => r.owner?.login).filter(Boolean))];
    const starredLanguages = [...new Set(starred.map((r) => r.language).filter(Boolean))];
    const starredTopics = [...new Set(starred.flatMap((r) => r.topics || []))];
    const starredRepoIds = new Set(starred.map((r) => r.id));

    const profile = {
        login: user.login.toLowerCase(),
        location: user.location || '',
        languages,
        topics,
        starredOwners,
        starredLanguages: starredLanguages.slice(0, 10),
        starredTopics: starredTopics.slice(0, 30),
        starredRepoIds,
        recentPushAt: repos[0]?.pushed_at || null,
    };

    profileCache.set(cacheKey, profile);
    return profile;
};

// ─────────────────────────────────────────────────────────────
// Exclusion lists (following + orgs) - with full pagination
//
// NOTE: Some tokens can get 403 "Resource not accessible by integration" for
// /user/* endpoints. To avoid noisy console/network errors, we use the public
// endpoints by default.
// ─────────────────────────────────────────────────────────────
const fetchAllLogins = async (token, urlForPage, { signal, maxPages = 10 } = {}) => {
    const all = [];
    const perPage = 100;
    for (let page = 1; page <= maxPages; page += 1) {
        const data = await fetchGitHub(urlForPage({ page, perPage }), { token, signal });
        if (!data || !Array.isArray(data) || data.length === 0) break;
        for (const item of data) {
            if (item?.login) all.push(item.login.toLowerCase());
        }
        if (data.length < perPage) break;
    }
    return all;
};

const getFollowingLogins = async (token, login, { signal } = {}) => {
    const me = (login || '').toLowerCase();
    const cacheKey = `me:following:${me || 'unknown'}`;
    const cached = profileCache.get(cacheKey);
    if (cached) return cached;

    // Public endpoint (avoids 403 noise from /user/following)
    if (!me) return [];
    try {
        const logins = await fetchAllLogins(
            token,
            ({ page, perPage }) => `${GITHUB_API_URL}/users/${encodeURIComponent(me)}/following?per_page=${perPage}&page=${page}`,
            { signal }
        );
        profileCache.set(cacheKey, logins);
        return logins;
    } catch {
        return [];
    }
};

const getOrgLogins = async (token, login, { signal } = {}) => {
    const me = (login || '').toLowerCase();
    const cacheKey = `me:orgs:${me || 'unknown'}`;
    const cached = profileCache.get(cacheKey);
    if (cached) return cached;

    // Public endpoint (avoids 403 noise from /user/orgs)
    if (!me) return [];
    try {
        const data = await fetchGitHub(`${GITHUB_API_URL}/users/${encodeURIComponent(me)}/orgs?per_page=100`, { token, signal });
        const logins = (data || []).map((o) => o.login?.toLowerCase()).filter(Boolean);
        profileCache.set(cacheKey, logins);
        return logins;
    } catch {
        return [];
    }
};

// ─────────────────────────────────────────────────────────────
// Candidate search
// ─────────────────────────────────────────────────────────────
const sanitizeQuery = (str) => {
    if (!str) return '';
    return str.replace(/["\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
};

const buildSearchQueries = (profile) => {
    const queries = [];
    const seenQueries = new Set();

    // Helper to add unique queries
    const addQuery = (q) => {
        if (!seenQueries.has(q)) {
            queries.push(q);
            seenQueries.add(q);
        }
    };

    // Language-based searches (most reliable) - prioritize top language
    if (profile.languages[0]) {
        addQuery(`type:user followers:>20 language:${profile.languages[0]} sort:followers`);
    }
    if (profile.languages[1]) {
        addQuery(`type:user followers:>10 language:${profile.languages[1]}`);
    }

    // Location + language (combined filter more effective)
    const country = sanitizeQuery(profile.location.split(',').pop());
    if (country && profile.languages[0]) {
        addQuery(`type:user location:"${country}" language:${profile.languages[0]}`);
    }

    // Topic in bio - only for substantial topics
    for (const topic of profile.topics.slice(0, 2)) {
        if (topic.length >= 4 && !/^\d+$/.test(topic)) {
            addQuery(`type:user followers:>5 ${topic} in:bio`);
        }
    }

    return queries;
};

const searchCandidates = async (token, profile, { excludeSet, signal } = {}) => {
    const queries = buildSearchQueries(profile);
    const candidates = new Map(); // login -> candidate object
    const targetCandidates = 50;

    // Priority 1: Starred owners (high-value, zero API cost)
    // These are pre-vetted by the user's own stars
    for (const owner of profile.starredOwners.slice(0, 15)) {
        const login = owner.toLowerCase();
        if (!excludeSet.has(login)) {
            candidates.set(login, { login: owner, priority: 1 });
        }
        if (candidates.size >= targetCandidates) {
            return [...candidates.values()].sort((a, b) => a.priority - b.priority);
        }
    }

    // Priority 2: Search results (run queries in parallel batches)
    const batchSize = 3;
    for (let i = 0; i < queries.length; i += batchSize) {
        // Early exit if we have enough candidates
        if (candidates.size >= targetCandidates) break;
        
        const batch = queries.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(async (query) => {
                const cacheKey = `search:${query}`;
                const cached = searchCache.get(cacheKey);
                if (cached) return cached;

                try {
                    const data = await fetchGitHub(
                        `${GITHUB_API_URL}/search/users?q=${encodeURIComponent(query)}&per_page=20`,
                        { token, signal }
                    );
                    const items = data?.items || [];
                    searchCache.set(cacheKey, items);
                    return items;
                } catch {
                    return [];
                }
            })
        );

        // Process results and deduplicate
        for (const items of results) {
            for (const u of items) {
                const login = u.login?.toLowerCase();
                if (login && !excludeSet.has(login) && !candidates.has(login)) {
                    candidates.set(login, { ...u, priority: 2 });
                }
            }
        }
    }

    // Sort by priority (starred owners first)
    return [...candidates.values()].sort((a, b) => a.priority - b.priority);
};

// ─────────────────────────────────────────────────────────────
// Scoring algorithm
// ─────────────────────────────────────────────────────────────

/**
 * Get candidate snapshot (user details + languages)
 */
const getCandidateData = async (token, login, { signal } = {}) => {
    const userKey = `user:${login}`;
    const cachedUser = userCache.get(userKey);

    const [userData, repos] = await Promise.all([
        cachedUser
            ? Promise.resolve(cachedUser)
            : fetchGitHub(`${GITHUB_API_URL}/users/${login}`, { token, signal })
                  .then((data) => {
                      userCache.set(userKey, data);
                      return data;
                  })
                  .catch(() => ({ login })),
        fetchGitHub(`${GITHUB_API_URL}/users/${login}/repos?per_page=10&sort=pushed`, { token, signal }).catch(() => []),
    ]);

    const { languages } = analyzeRepos(repos);
    const recentPush = repos[0]?.pushed_at;

    return { user: userData, languages, recentPush };
};

/**
 * Calculate match score between current user and candidate
 * Optimized: better weighting, memoization, and early exits
 */
const calculateScore = (myProfile, candidate) => {
    const { user, languages: candLangs, recentPush } = candidate;
    const reasons = [];
    let score = 0;
    let maxPossibleScore = 0;

    // Pre-compute for optimization
    const candLogin = (user.login || '').toLowerCase();
    const bio = (user.bio || '').toLowerCase();
    
    // 1. Language overlap (weighted by position - earlier = more important)
    const langOverlap = [];
    for (let i = 0; i < myProfile.languages.length; i++) {
        if (candLangs.includes(myProfile.languages[i])) {
            // Higher weight for primary languages (position 0, 1)
            const positionWeight = Math.max(1, 3 - i);
            score += 10 * positionWeight;
            langOverlap.push(myProfile.languages[i]);
        }
    }
    if (langOverlap.length > 0) {
        score = Math.min(score, WEIGHTS.languageOverlap);
        reasons.push(`Uses ${langOverlap.slice(0, 3).join(', ')}`);
    }
    maxPossibleScore += WEIGHTS.languageOverlap;

    // 2. Starred owner bonus (strong signal)
    if (myProfile.starredOwners.some(s => s.toLowerCase() === candLogin)) {
        score += WEIGHTS.starredOwner;
        reasons.push('You starred their repos');
    }
    maxPossibleScore += WEIGHTS.starredOwner;

    // 3. Topic overlap (combined check)
    const matchedTopics = new Set();
    if (bio) {
        // Check own topics first (stronger signal)
        for (const topic of myProfile.topics) {
            if (topic.length >= 3 && bio.includes(topic.toLowerCase())) {
                matchedTopics.add(topic);
            }
        }
        // Then starred topics
        for (const topic of myProfile.starredTopics) {
            if (topic.length >= 3 && bio.includes(topic.toLowerCase()) && matchedTopics.size < 5) {
                matchedTopics.add(topic);
            }
        }
    }
    
    if (matchedTopics.size > 0) {
        const topicScore = Math.min(WEIGHTS.topicOverlap, matchedTopics.size * 6);
        score += topicScore;
        reasons.push(`Bio: ${[...matchedTopics].slice(0, 2).join(', ')}`);
    }
    maxPossibleScore += WEIGHTS.topicOverlap;

    // 4. Same country
    const myCountry = (myProfile.location.split(',').pop() || '').trim().toLowerCase();
    const theirCountry = ((user.location || '').split(',').pop() || '').trim().toLowerCase();
    if (myCountry && theirCountry && myCountry.length > 2 && myCountry === theirCountry) {
        score += WEIGHTS.sameCountry;
        reasons.push(`Near you: ${theirCountry}`);
    }
    maxPossibleScore += WEIGHTS.sameCountry;

    // 5. Follower ratio (influence indicator) - logarithmic scale
    const followers = user.followers || 0;
    const following = user.following || 1;
    if (followers > 50) {
        const ratio = followers / following;
        if (ratio > 2) {
            const influenceScore = Math.min(WEIGHTS.followerRatio, Math.floor(Math.log10(followers) * 2));
            score += influenceScore;
        }
    }
    maxPossibleScore += WEIGHTS.followerRatio;

    // 6. Recent activity bonus (tiered)
    if (recentPush) {
        const daysSincePush = (Date.now() - new Date(recentPush).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSincePush < 7) {
            score += WEIGHTS.recentActivity;
            reasons.push('Very active');
        } else if (daysSincePush < 30) {
            score += Math.floor(WEIGHTS.recentActivity * 0.7);
            reasons.push('Recently active');
        }
    }
    maxPossibleScore += WEIGHTS.recentActivity;

    // Normalize to 0-99 (percentage-like scale)
    score = Math.max(0, Math.min(99, Math.round((score / maxPossibleScore) * 99)));

    return {
        score,
        reasons: reasons.slice(0, 3), // Limit reasons to avoid clutter
        languages: langOverlap.slice(0, 5),
    };
};

// ─────────────────────────────────────────────────────────────
// Normalize user for UI
// ─────────────────────────────────────────────────────────────
const normalizeUser = (user, matchInfo) => ({
    id: user.id,
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    html_url: user.html_url,
    bio: user.bio,
    location: user.location,
    public_repos: user.public_repos,
    followers: user.followers,
    matchScore: matchInfo.score,
    matchReasons: matchInfo.reasons,
    languages: matchInfo.languages,
});

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export const loginWithGithub = () => {
    const clientId = import.meta.env.GITHUG_CLIENT_ID;
    
    // Always use the current origin + /callback to ensure consistency with token exchange
    // This prevents mismatch errors between env vars and actual URL
    const redirectUri = `${window.location.origin}/callback`;

    if (!clientId) {
        console.warn('No Client ID. Using mock mode.');
        setTimeout(() => {
            localStorage.setItem('githug_token', 'mock_token');
            window.location.reload();
        }, 500);
        return;
    }

    if (/^\d+$/.test(clientId)) {
        console.error('Client ID looks numeric. Use OAuth App Client ID, not GitHub App ID.');
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        // Ask for read profile + follow list.
        // Even if some tokens can't use /user/following, we also have a public fallback.
        scope: 'read:user user:follow',
    });

    window.location.href = `${GITHUB_AUTH_URL}?${params}`;
};

export const getProfile = async (token) => {
    if (token === 'mock_token') {
        return {
            login: 'mockuser',
            name: 'Mock Developer',
            avatar_url: 'https://github.com/shadcn.png',
            bio: 'Building cool things with React and TypeScript.',
            location: 'San Francisco, CA',
            followers: 120,
            following: 50,
            public_repos: 30,
        };
    }

    return fetchGitHub(`${GITHUB_API_URL}/user`, { token });
};

export const searchUsers = async (token, currentUser, opts = {}) => {
    const { page = 1, pageSize = CONFIG.pageSize, excludeLogins = [], signal } = opts;

    // Mock mode
    if (token === 'mock_token') {
        const mockUsers = [
            { id: 1, login: 'shadcn', avatar_url: 'https://github.com/shadcn.png', bio: 'UI components.', location: 'SF', html_url: 'https://github.com/shadcn', matchScore: 85, matchReasons: ['Uses React, TypeScript'], languages: ['TypeScript'] },
            { id: 2, login: 'leerob', avatar_url: 'https://github.com/leerob.png', bio: 'Vercel DX.', location: 'Iowa', html_url: 'https://github.com/leerob', matchScore: 72, matchReasons: ['Uses JavaScript'], languages: ['JavaScript'] },
            { id: 3, login: 'rich-harris', avatar_url: 'https://github.com/rich-harris.png', bio: 'Svelte.', location: 'NYC', html_url: 'https://github.com/rich-harris', matchScore: 68, matchReasons: ['Uses JavaScript'], languages: ['JavaScript'] },
            { id: 4, login: 'youyuxi', avatar_url: 'https://github.com/youyuxi.png', bio: 'Vue.', location: 'NJ', html_url: 'https://github.com/youyuxi', matchScore: 65, matchReasons: ['Uses TypeScript'], languages: ['TypeScript'] },
        ];
        await new Promise((r) => setTimeout(r, 600));
        return { items: mockUsers.slice(0, pageSize), hasMore: mockUsers.length > pageSize };
    }

    // Build user profile
    const myProfile = await buildProfile(token, currentUser, { signal });

    // Get exclusion lists
    const [following, orgs] = await Promise.all([
        getFollowingLogins(token, myProfile.login, { signal }),
        getOrgLogins(token, myProfile.login, { signal }),
    ]);

    const excludeSet = new Set([
        myProfile.login,
        ...excludeLogins.map((l) => l.toLowerCase()),
        ...following,
        ...orgs,
    ]);

    // Find candidates
    const candidates = await searchCandidates(token, myProfile, { excludeSet, signal });

    // Score candidates with concurrency
    const toScore = candidates.slice(0, CONFIG.maxCandidatesToScore);
    const scored = await parallel(toScore, CONFIG.concurrency, async (candidate) => {
        try {
            const data = await getCandidateData(token, candidate.login, { signal });
            if (data.user?.type === 'Organization') return null;

            const matchInfo = calculateScore(myProfile, data);
            if (matchInfo.score <= 0) return null;

            return normalizeUser(data.user, matchInfo);
        } catch {
            return null;
        }
    });

    // Filter and sort
    const validResults = scored.filter(Boolean).sort((a, b) => b.matchScore - a.matchScore);

    const items = validResults.slice(0, pageSize);
    const hasMore = validResults.length > pageSize || candidates.length > CONFIG.maxCandidatesToScore;

    return { items, hasMore };
};

/**
 * Clear all internal caches (call on logout to force fresh data)
 */
export const clearCaches = () => {
    profileCache.clear();
    searchCache.clear();
    userCache.clear();
    console.log('[GitHug] All caches cleared');
};
