import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    clearCaches,
    getProfile,
    loginWithGithub,
    searchUsers,
    followUser,
    validateOAuthState,
    buildSearchQueries,
    OAUTH_STATE_KEY,
} from './github'

// Mock fetch globally
const mockResponse = (body, { ok = true, status = 200, headers = {} } = {}) => ({
    ok,
    status,
    headers: headers instanceof Headers ? headers : new Headers(headers),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
})

global.fetch = vi.fn()

describe('GitHub Service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        clearCaches()
        sessionStorage.clear()
    })

    describe('clearCaches', () => {
        it('should clear all caches without throwing', () => {
            expect(() => clearCaches()).not.toThrow()
        })
    })

    describe('loginWithGithub', () => {
        it('should use mock mode when no client ID is configured', async () => {
            vi.useFakeTimers()

            loginWithGithub()

            vi.advanceTimersByTime(600)

            expect(localStorage.setItem).toHaveBeenCalledWith('githug_token', 'mock_token')

            vi.useRealTimers()
        })
    })

    describe('getProfile', () => {
        it('should return mock profile for mock token', async () => {
            const profile = await getProfile('mock_token')

            expect(profile).toEqual({
                login: 'mockuser',
                name: 'Mock Developer',
                avatar_url: 'https://github.com/shadcn.png',
                bio: 'Building cool things with React and TypeScript.',
                location: 'San Francisco, CA',
                followers: 120,
                following: 50,
                public_repos: 30,
                token_scopes: 'read:user user:follow',
            })
        })

        it('should fetch profile from GitHub API with real token and its OAuth scopes', async () => {
            const mockProfile = {
                login: 'testuser',
                name: 'Test User',
                avatar_url: 'https://github.com/testuser.png',
            }

            global.fetch.mockResolvedValueOnce(
                mockResponse(mockProfile, { headers: { 'x-oauth-scopes': 'read:user user:follow' } })
            )

            const profile = await getProfile('real_token')

            // The profile carries the token's effective scopes (used by the UI
            // to decide whether following is possible)
            expect(profile).toEqual({ ...mockProfile, token_scopes: 'read:user user:follow' })
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.github.com/user',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer real_token',
                    }),
                })
            )
        })

        it('should report empty scopes for GitHub App user-to-server tokens', async () => {
            // GitHub App tokens omit the x-oauth-scopes header entirely
            global.fetch.mockResolvedValueOnce(mockResponse({ login: 'u2s' }))

            const profile = await getProfile('u2s_token')

            expect(profile.token_scopes).toBe('')
        })
    })

    describe('followUser', () => {
        it('should return a mock result for mock tokens', async () => {
            const res = await followUser('mock_token', 'someone')
            expect(res).toEqual({ followed: true, mock: true })
        })

        it('should PUT the follow endpoint and handle 204 No Content', async () => {
            global.fetch.mockResolvedValueOnce(mockResponse('', { status: 204 }))

            const res = await followUser('real_token', 'octocat')

            expect(res).toEqual({ followed: true })
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.github.com/user/following/octocat',
                expect.objectContaining({
                    method: 'PUT',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer real_token',
                    }),
                })
            )
        })

        it('should use PUT, not POST (GitHub answers 404 to POST on this route)', async () => {
            // Regression test: the follow endpoint is PUT /user/following/{username}
            global.fetch.mockResolvedValueOnce(mockResponse('', { status: 204 }))

            await followUser('real_token', 'octocat')

            const [, options] = global.fetch.mock.calls[0]
            expect(options.method).toBe('PUT')
        })

        it('should encode the login and reject invalid input', async () => {
            global.fetch.mockResolvedValueOnce(mockResponse('', { status: 204 }))

            await followUser('real_token', 'weird/name')

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.github.com/user/following/weird%2Fname',
                expect.anything()
            )

            await expect(followUser('real_token', '')).rejects.toThrow(/valid login/i)
            await expect(followUser('real_token', null)).rejects.toThrow(/valid login/i)
        })

        it('should surface API errors with token scope context', async () => {
            global.fetch.mockResolvedValueOnce(
                mockResponse(
                    { message: 'Resource not accessible by integration' },
                    {
                        ok: false,
                        status: 403,
                        headers: {
                            'x-oauth-scopes': '',
                            'x-accepted-oauth-scopes': 'user, user:follow',
                        },
                    }
                )
            )

            try {
                await followUser('real_token', 'octocat')
                expect.unreachable('followUser should have thrown')
            } catch (e) {
                expect(e.status).toBe(403)
                expect(e.message).toMatch(/not accessible by integration/i)
                // Empty scopes + accepted user:follow = classic GitHub App token signature
                expect(e.scopes).toBe('')
                expect(e.acceptedScopes).toBe('user, user:follow')
            }
        })
    })

    describe('validateOAuthState', () => {
        it('should accept a matching one-time state and consume it', () => {
            sessionStorage.setItem(OAUTH_STATE_KEY, 'abc123')

            expect(validateOAuthState('abc123')).toBe(true)
            // Single use: a second attempt with the same value must fail
            expect(validateOAuthState('abc123')).toBe(false)
        })

        it('should reject a mismatched or missing state', () => {
            sessionStorage.setItem(OAUTH_STATE_KEY, 'abc123')
            expect(validateOAuthState('nope')).toBe(false)

            sessionStorage.removeItem(OAUTH_STATE_KEY)
            expect(validateOAuthState('abc123')).toBe(false)
            expect(validateOAuthState(null)).toBe(false)
        })
    })

    describe('buildSearchQueries', () => {
        const profile = {
            languages: ['TypeScript', 'Rust', 'Go', 'Python', 'Ruby'],
            topics: ['react', 'wasm', 'cli', 'devtools', 'machine-learning', 'cli-tools'],
            location: 'Naples, Italy',
        }

        it('should build base queries from the top languages, location and topics', () => {
            const queries = buildSearchQueries(profile, 1)

            expect(queries.some((q) => q.includes('language:TypeScript'))).toBe(true)
            expect(queries.some((q) => q.includes('language:Rust'))).toBe(true)
            expect(queries.some((q) => q.includes('location:"Italy"'))).toBe(true)
            expect(queries.some((q) => q.includes('react in:bio'))).toBe(true)
        })

        it('should diversify queries from page 2 onwards', () => {
            const page1 = buildSearchQueries(profile, 1)
            const page2 = buildSearchQueries(profile, 2)

            // Page 2 must add new queries not present on page 1
            const fresh = page2.filter((q) => !page1.includes(q))
            expect(fresh.length).toBeGreaterThan(0)

            // Secondary languages and later topics should be explored
            expect(fresh.some((q) => q.includes('language:Go'))).toBe(true)
            expect(fresh.some((q) => q.includes('machine-learning in:bio'))).toBe(true)
            // Queries must remain unique
            expect(new Set(page2).size).toBe(page2.length)
        })
    })

    describe('searchUsers', () => {
        it('should return mock users for mock token', async () => {
            const result = await searchUsers('mock_token', { login: 'mockuser' })

            expect(result.items).toHaveLength(4)
            expect(result.items[0].login).toBe('shadcn')
            expect(result.hasMore).toBe(false)
        })

        it('should handle pageSize parameter', async () => {
            const result = await searchUsers('mock_token', { login: 'mockuser' }, { pageSize: 2 })

            expect(result.items).toHaveLength(2)
            expect(result.hasMore).toBe(true)
        })

        it('should respect excluded logins in mock mode (load more)', async () => {
            const result = await searchUsers('mock_token', { login: 'mockuser' }, {
                pageSize: 12,
                excludeLogins: ['shadcn', 'leerob'],
            })

            const logins = result.items.map((u) => u.login)
            expect(logins).not.toContain('shadcn')
            expect(logins).not.toContain('leerob')
            expect(logins).toHaveLength(2)
        })
    })

    describe('Error handling', () => {
        it('should handle rate limit errors', async () => {
            const headers = new Headers({
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
            })

            global.fetch.mockResolvedValueOnce(
                mockResponse({ message: 'Rate limit exceeded' }, { ok: false, status: 403, headers })
            )

            await expect(getProfile('limited_token')).rejects.toThrow(/Rate limit exceeded/)
        })

        it('should handle network errors', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'))

            await expect(getProfile('error_token')).rejects.toThrow('Network error')
        })

        it('should handle empty responses safely', async () => {
            global.fetch.mockResolvedValueOnce(mockResponse('', { status: 200 }))

            // Empty body must not crash; the profile degrades to just the scopes
            await expect(getProfile('empty_token')).resolves.toEqual({ token_scopes: '' })
        })
    })
})
