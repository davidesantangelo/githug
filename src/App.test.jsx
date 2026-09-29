import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// Mock the github service
vi.mock('./services/github', () => ({
  loginWithGithub: vi.fn(),
  getProfile: vi.fn(),
  searchUsers: vi.fn(),
  clearCaches: vi.fn(),
  followUser: vi.fn(),
  validateOAuthState: vi.fn((state) => Boolean(state)),
}))

import { loginWithGithub, getProfile, searchUsers, clearCaches, followUser, validateOAuthState } from './services/github'

// Helper to properly mock sessionStorage for each test
const mockSessionStorage = () => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value?.toString()
    }),
    removeItem: vi.fn((key) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    _getStore: () => store,
    _setStore: (newStore) => { store = newStore },
  }
}

const flushAsync = () => act(async () => {})

describe('App Component', () => {
  let sessionStorageMock

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Create a fresh sessionStorage mock for each test
    sessionStorageMock = mockSessionStorage()
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true
    })

    // Reset location mock
    window.location.href = 'http://localhost:5173'
    window.location.search = ''
    window.location.replace.mockClear()
  })

  describe('Logged out state', () => {
    it('should render login page when no token exists', async () => {
      render(<App />)

      expect(screen.getByText(/Find your/i)).toBeInTheDocument()
      expect(screen.getByText(/code/i)).toBeInTheDocument()
      expect(screen.getByText(/mate/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Connect with GitHub/i })).toBeInTheDocument()
      await flushAsync()
    })

    it('should call loginWithGithub when login button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      const loginButton = screen.getByRole('button', { name: /Connect with GitHub/i })
      await user.click(loginButton)

      expect(loginWithGithub).toHaveBeenCalledTimes(1)
    })

    it('should show theme toggle button', async () => {
      render(<App />)

      expect(screen.getByLabelText(/Toggle theme/i)).toBeInTheDocument()
      await flushAsync()
    })

    it('should show GitHub source link', async () => {
      render(<App />)

      const link = screen.getByLabelText(/View source on GitHub/i)
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://github.com/davidesantangelo/githug')
      await flushAsync()
    })
  })

  describe('Theme toggle', () => {
    it('should toggle theme when button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      const themeButton = screen.getByLabelText(/Toggle theme/i)

      // Initial state (dark by default based on system preference mock)
      expect(document.documentElement.classList.contains('dark')).toBe(false)

      // Click to toggle
      await user.click(themeButton)

      // Theme should have changed
      expect(localStorage.theme).toBeDefined()
    })
  })

  describe('Logged in state', () => {
    const mockUser = {
      login: 'testuser',
      name: 'Test User',
      avatar_url: 'https://github.com/testuser.png',
      bio: 'A test user',
      location: 'Test City',
      followers: 100,
      following: 50,
    }

    const mockMatches = [
      {
        id: 1,
        login: 'match1',
        name: 'Match One',
        avatar_url: 'https://github.com/match1.png',
        html_url: 'https://github.com/match1',
        bio: 'React and frontend developer',
        location: 'Location 1',
        public_repos: 42,
        matchScore: 85,
        matchReasons: ['Uses JavaScript'],
        languages: ['JavaScript'],
        followers: 200,
      },
      {
        id: 2,
        login: 'match2',
        name: 'Match Two',
        avatar_url: 'https://github.com/match2.png',
        html_url: 'https://github.com/match2',
        bio: 'Django and backend developer',
        location: 'Location 2',
        public_repos: 7,
        matchScore: 72,
        matchReasons: ['Uses TypeScript'],
        languages: ['TypeScript'],
        followers: 1500,
      },
    ]

    beforeEach(() => {
      localStorage.setItem('githug_token', 'test_token')
      getProfile.mockResolvedValue(mockUser)
      searchUsers.mockResolvedValue({ items: mockMatches, hasMore: false })
      followUser.mockResolvedValue({ followed: true })
    })

    it('should show loading state initially', async () => {
      render(<App />)

      expect(screen.getByText(/Connecting to GitHub/i)).toBeInTheDocument()
      await flushAsync()
    })

    it('should display user avatar after login', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByAltText('testuser')).toBeInTheDocument()
      })
    })

    it('should display the logged in user next to the logout control', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /Log out of GitHug/i })).toBeInTheDocument()
    })

    it('should display matches after loading', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Match One')).toBeInTheDocument()
        expect(screen.getByText('Match Two')).toBeInTheDocument()
      })
    })

    it('should display match count', async () => {
      render(<App />)

      await waitFor(() => {
        // Use getAllByText since "New Users" appears multiple times
        const elements = screen.getAllByText(/New Users/i)
        expect(elements.length).toBeGreaterThan(0)
      })
    })

    it('should display match scores', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('85% match')).toBeInTheDocument()
        expect(screen.getByText('72% match')).toBeInTheDocument()
      })
    })

    it('should display match languages', async () => {
      render(<App />)

      await waitFor(() => {
        // Languages appear both as card badges and filter options
        expect(screen.getAllByText('JavaScript').length).toBeGreaterThan(0)
        expect(screen.getAllByText('TypeScript').length).toBeGreaterThan(0)
      })
    })

    it('should format follower and repo counts compactly', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('1.5k')).toBeInTheDocument() // match2 followers: 1500
      })
      expect(screen.getByText('42')).toBeInTheDocument() // match1 repos
    })

    it('should logout when logout button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByAltText('testuser')).toBeInTheDocument()
      })

      const logoutButton = screen.getByRole('button', { name: /Log out of GitHug/i })
      await user.click(logoutButton)

      expect(clearCaches).toHaveBeenCalled()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Connect with GitHub/i })).toBeInTheDocument()
      })
    })
  })

  describe('Follow feature', () => {
    const mockUser = {
      login: 'testuser',
      name: 'Test User',
      avatar_url: 'https://github.com/testuser.png',
    }

    const mockMatches = [
      {
        id: 1,
        login: 'match1',
        name: 'Match One',
        avatar_url: 'https://github.com/match1.png',
        html_url: 'https://github.com/match1',
        bio: 'First match',
        public_repos: 5,
        matchScore: 85,
        matchReasons: ['Uses JavaScript'],
        languages: ['JavaScript'],
        followers: 200,
      },
    ]

    beforeEach(() => {
      localStorage.setItem('githug_token', 'test_token')
      getProfile.mockResolvedValue(mockUser)
      searchUsers.mockResolvedValue({ items: mockMatches, hasMore: false })
      followUser.mockResolvedValue({ followed: true })
    })

    it('follows a user when the Follow button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Match One')).toBeInTheDocument()
      })

      const followButton = screen.getByRole('button', { name: /Follow @match1/i })
      await user.click(followButton)

      expect(followUser).toHaveBeenCalledWith('test_token', 'match1')

      await waitFor(() => {
        expect(screen.getByText('Following')).toBeInTheDocument()
      })
    })

    it('persists followed users per account', async () => {
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Follow @match1/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /Follow @match1/i }))

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'githug_followed_testuser',
          JSON.stringify(['match1'])
        )
      })
    })

    it('shows an error when the follow request fails', async () => {
      followUser.mockRejectedValueOnce(new Error('user:follow scope missing'))
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Follow @match1/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /Follow @match1/i }))

      await waitFor(() => {
        expect(screen.getByText(/user:follow scope missing/i)).toBeInTheDocument()
      })
      // The Follow button stays available for a retry
      expect(screen.getByRole('button', { name: /Follow @match1/i })).toBeInTheDocument()
    })

    it('marks users as already followed when reloading (localStorage hydration)', async () => {
      localStorage.setItem('githug_followed_testuser', JSON.stringify(['match1']))

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Following')).toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: /Follow @match1/i })).not.toBeInTheDocument()
    })
  })

  describe('Follow capability detection', () => {
    const mockUser = {
      login: 'testuser',
      name: 'Test User',
      avatar_url: 'https://github.com/testuser.png',
    }

    const mockMatches = [
      {
        id: 1,
        login: 'match1',
        name: 'Match One',
        avatar_url: 'https://github.com/match1.png',
        html_url: 'https://github.com/match1',
        bio: 'First match',
        public_repos: 5,
        matchScore: 85,
        matchReasons: [],
        languages: ['JavaScript'],
        followers: 200,
      },
    ]

    beforeEach(() => {
      localStorage.setItem('githug_token', 'test_token')
      searchUsers.mockResolvedValue({ items: mockMatches, hasMore: false })
      followUser.mockResolvedValue({ followed: true })
    })

    it('shows the GitHub App banner and disables Follow when the token has no scopes', async () => {
      getProfile.mockResolvedValue({ ...mockUser, token_scopes: '' })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(/GitHub App/i)
      })

      const followButton = screen.getByRole('button', { name: /Follow @match1/i })
      expect(followButton).toBeDisabled()
      // No reconnect button is offered for GitHub App tokens (it wouldn't help)
      expect(screen.queryByRole('button', { name: /^Reconnect$/ })).not.toBeInTheDocument()
    })

    it('offers Reconnect when the token has scopes but lacks user:follow', async () => {
      getProfile.mockResolvedValue({ ...mockUser, token_scopes: 'read:user' })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(/user:follow/i)
      })
      expect(screen.getByRole('button', { name: /^Reconnect$/ })).toBeInTheDocument()

      const followButton = screen.getByRole('button', { name: /Follow @match1/i })
      expect(followButton).toBeDisabled()
    })

    it('Reconnect clears the session and starts a fresh OAuth login', async () => {
      const user = userEvent.setup()
      getProfile.mockResolvedValue({ ...mockUser, token_scopes: 'read:user' })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Reconnect$/ })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /^Reconnect$/ }))

      expect(clearCaches).toHaveBeenCalled()
      expect(localStorage.removeItem).toHaveBeenCalledWith('githug_token')
      expect(loginWithGithub).toHaveBeenCalledTimes(1)
    })

    it('follows normally when the token carries user:follow', async () => {
      const user = userEvent.setup()
      getProfile.mockResolvedValue({ ...mockUser, token_scopes: 'read:user user:follow' })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Follow @match1/i })).toBeEnabled()
      })

      await user.click(screen.getByRole('button', { name: /Follow @match1/i }))

      expect(followUser).toHaveBeenCalledWith('test_token', 'match1')
      await waitFor(() => {
        expect(screen.getByText('Following')).toBeInTheDocument()
      })
    })

    it('shows GitHub App guidance when a follow fails with 403 integration error', async () => {
      const user = userEvent.setup()
      getProfile.mockResolvedValue({ ...mockUser, token_scopes: 'read:user user:follow' })
      followUser.mockRejectedValueOnce(
        Object.assign(new Error('Resource not accessible by integration'), { status: 403 })
      )

      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Follow @match1/i })).toBeEnabled()
      })

      await user.click(screen.getByRole('button', { name: /Follow @match1/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/OAuth App/i)
      })
      // Reconnect is still offered as an escape hatch
      expect(screen.getByRole('button', { name: /^Reconnect$/ })).toBeInTheDocument()
    })

    it('shows rate-limit guidance when a follow hits a secondary rate limit', async () => {
      const user = userEvent.setup()
      getProfile.mockResolvedValue({ ...mockUser, token_scopes: 'read:user user:follow' })
      followUser.mockRejectedValueOnce(
        Object.assign(new Error('You have exceeded a secondary rate limit'), { status: 403 })
      )

      render(<App />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Follow @match1/i })).toBeEnabled()
      })

      await user.click(screen.getByRole('button', { name: /Follow @match1/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/rate limiting/i)
      })
    })
  })

  describe('Match filtering', () => {
    const mockUser = { login: 'testuser', name: 'Test User' }
    const mockMatches = [
      {
        id: 1,
        login: 'match1',
        name: 'Match One',
        avatar_url: 'https://github.com/match1.png',
        html_url: 'https://github.com/match1',
        bio: 'React and frontend developer',
        public_repos: 3,
        matchScore: 85,
        matchReasons: [],
        languages: ['JavaScript'],
        followers: 200,
      },
      {
        id: 2,
        login: 'match2',
        name: 'Match Two',
        avatar_url: 'https://github.com/match2.png',
        html_url: 'https://github.com/match2',
        bio: 'Django and backend developer',
        public_repos: 4,
        matchScore: 72,
        matchReasons: [],
        languages: ['TypeScript'],
        followers: 150,
      },
    ]

    beforeEach(() => {
      localStorage.setItem('githug_token', 'test_token')
      getProfile.mockResolvedValue(mockUser)
      searchUsers.mockResolvedValue({ items: mockMatches, hasMore: false })
    })

    it('filters matches by free text', async () => {
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Match One')).toBeInTheDocument()
      })

      const input = screen.getByLabelText(/Filter matches/i)
      await user.type(input, 'react')

      expect(screen.getByText('Match One')).toBeInTheDocument()
      expect(screen.queryByText('Match Two')).not.toBeInTheDocument()
    })

    it('filters matches by language', async () => {
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Match One')).toBeInTheDocument()
      })

      await user.selectOptions(screen.getByLabelText(/Filter by language/i), 'TypeScript')

      expect(screen.getByText('Match Two')).toBeInTheDocument()
      expect(screen.queryByText('Match One')).not.toBeInTheDocument()
    })

    it('shows an empty state and clears filters', async () => {
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Match One')).toBeInTheDocument()
      })

      const input = screen.getByLabelText(/Filter matches/i)
      await user.type(input, 'nonexistent-stack')

      expect(screen.getByText(/No matches for the current filters/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Clear filters/i }))

      await waitFor(() => {
        expect(screen.getByText('Match One')).toBeInTheDocument()
        expect(screen.getByText('Match Two')).toBeInTheDocument()
      })
    })
  })

  describe('Cache handling', () => {
    const mockUser = {
      login: 'testuser',
      name: 'Test User',
      avatar_url: 'https://github.com/testuser.png',
    }

    beforeEach(() => {
      localStorage.setItem('githug_token', 'test_token')
      getProfile.mockResolvedValue(mockUser)
      searchUsers.mockResolvedValue({ items: [], hasMore: false })
    })

    it('should skip cache when force refresh flag is set', async () => {
      // Set force refresh flag before setting cached matches
      sessionStorageMock._setStore({
        'githug_force_refresh': 'true',
        'githug_cached_matches_v1': JSON.stringify({
          matches: [{ id: 1, login: 'cached' }],
          page: 1,
          hasMore: false,
          savedAt: Date.now(),
        })
      })

      render(<App />)

      // Wait for profile to be loaded
      await waitFor(() => {
        expect(getProfile).toHaveBeenCalled()
      })

      // Force refresh flag should have been removed
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('githug_force_refresh')
    })

    it('should use cached matches when available and no force refresh', async () => {
      const cachedMatches = [
        {
          id: 1,
          login: 'cacheduser',
          name: 'Cached User',
          avatar_url: 'https://github.com/cached.png',
          html_url: 'https://github.com/cacheduser',
          matchScore: 90,
          matchReasons: [],
          languages: [],
          followers: 100,
        },
      ]

      // Set cached data in mock before render
      sessionStorageMock._setStore({
        'githug_cached_matches_v1': JSON.stringify({
          matches: cachedMatches,
          page: 1,
          hasMore: false,
          savedAt: Date.now(),
        })
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Cached User')).toBeInTheDocument()
      })

      // searchUsers should NOT be called because we have cached data
      expect(searchUsers).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('should remove the token and return to login on auth errors', async () => {
      localStorage.setItem('githug_token', 'bad_token')
      getProfile.mockRejectedValue(Object.assign(new Error('Bad credentials'), { status: 401 }))

      render(<App />)

      await waitFor(() => {
        expect(localStorage.getItem('githug_token')).toBeNull()
      })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Connect with GitHub/i })).toBeInTheDocument()
      })
    })

    it('should keep the session on transient network errors and show the error', async () => {
      localStorage.setItem('githug_token', 'good_token')
      getProfile.mockRejectedValue(new Error('Network error'))

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument()
      })

      // The token must NOT be removed for a transient failure
      expect(localStorage.getItem('githug_token')).toBe('good_token')
    })
  })

  describe('OAuth callback handling', () => {
    it('should handle OAuth error in URL', async () => {
      // Set error in URL
      const url = new URL('http://localhost:5173')
      url.searchParams.set('error', 'access_denied')
      url.searchParams.set('error_description', 'User denied access')
      window.location.href = url.toString()
      window.location.search = url.search

      render(<App />)

      // App should render without crashing
      expect(screen.getByText(/Find your/i)).toBeInTheDocument()
      await flushAsync()
    })

    it('should reject the callback when the state nonce does not validate', async () => {
      validateOAuthState.mockReturnValueOnce(false)
      const url = new URL('http://localhost:5173/callback')
      url.searchParams.set('code', 'abc123')
      url.searchParams.set('state', 'tampered')
      window.location.href = url.toString()
      window.location.search = url.search

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/could not be verified/i)).toBeInTheDocument()
      })
      // No token should be stored
      expect(localStorage.setItem).not.toHaveBeenCalledWith('githug_token', expect.anything())
    })
  })

  describe('App Cache Functions', () => {
    describe('readMatchesCache', () => {
      it('should return null for empty sessionStorage', async () => {
        sessionStorage.clear()

        render(<App />)

        // No matches should be displayed from cache
        expect(screen.getByText(/Find your/i)).toBeInTheDocument()
        await act(async () => {})
      })

      it('should return null for invalid JSON', async () => {
        sessionStorage.setItem('githug_cached_matches_v1', 'invalid json')

        render(<App />)

        // Should not crash
        expect(screen.getByText(/Find your/i)).toBeInTheDocument()
        await act(async () => {})
      })

      it('should return null for missing matches array', async () => {
        sessionStorage.setItem('githug_cached_matches_v1', JSON.stringify({ page: 1 }))

        render(<App />)

        // Should not crash
        expect(screen.getByText(/Find your/i)).toBeInTheDocument()
        await act(async () => {})
      })
    })
  })
})
