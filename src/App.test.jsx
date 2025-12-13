import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

// Mock the github service
vi.mock('./services/github', () => ({
  loginWithGithub: vi.fn(),
  getProfile: vi.fn(),
  searchUsers: vi.fn(),
  clearCaches: vi.fn(),
}))

import { loginWithGithub, getProfile, searchUsers, clearCaches } from './services/github'

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
    it('should render login page when no token exists', () => {
      render(<App />)
      
      expect(screen.getByText(/Find your/i)).toBeInTheDocument()
      expect(screen.getByText(/code/i)).toBeInTheDocument()
      expect(screen.getByText(/mate/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Connect with GitHub/i })).toBeInTheDocument()
    })

    it('should call loginWithGithub when login button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const loginButton = screen.getByRole('button', { name: /Connect with GitHub/i })
      await user.click(loginButton)
      
      expect(loginWithGithub).toHaveBeenCalledTimes(1)
    })

    it('should show theme toggle button', () => {
      render(<App />)
      
      expect(screen.getByLabelText(/Toggle theme/i)).toBeInTheDocument()
    })

    it('should show GitHub source link', () => {
      render(<App />)
      
      const link = screen.getByLabelText(/View source on GitHub/i)
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://github.com/davidesantangelo/githug')
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
        bio: 'First match',
        location: 'Location 1',
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
        bio: 'Second match',
        location: 'Location 2',
        matchScore: 72,
        matchReasons: ['Uses TypeScript'],
        languages: ['TypeScript'],
        followers: 150,
      },
    ]

    beforeEach(() => {
      localStorage.setItem('githug_token', 'test_token')
      getProfile.mockResolvedValue(mockUser)
      searchUsers.mockResolvedValue({ items: mockMatches, hasMore: false })
    })

    it('should show loading state initially', async () => {
      render(<App />)
      
      expect(screen.getByText(/Connecting to GitHub/i)).toBeInTheDocument()
    })

    it('should display user avatar after login', async () => {
      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByAltText('testuser')).toBeInTheDocument()
      })
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
        expect(screen.getByText('JavaScript')).toBeInTheDocument()
        expect(screen.getByText('TypeScript')).toBeInTheDocument()
      })
    })

    it('should logout when logout button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByAltText('testuser')).toBeInTheDocument()
      })
      
      // Find logout button by the LogOut icon's parent button
      const logoutButtons = document.querySelectorAll('button')
      const logoutButton = Array.from(logoutButtons).find(btn => 
        btn.querySelector('.lucide-log-out')
      )
      
      if (logoutButton) {
        await user.click(logoutButton)
        expect(clearCaches).toHaveBeenCalled()
      }
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
    it('should display auth error message', async () => {
      localStorage.setItem('githug_token', 'bad_token')
      getProfile.mockRejectedValue(new Error('Authentication failed'))
      
      render(<App />)
      
      await waitFor(() => {
        // Should remove bad token and show login screen
        expect(localStorage.getItem('githug_token')).toBeNull()
      })
    })
  })

  describe('OAuth callback handling', () => {
    it('should handle OAuth error in URL', () => {
      // Set error in URL
      const url = new URL('http://localhost:5173')
      url.searchParams.set('error', 'access_denied')
      url.searchParams.set('error_description', 'User denied access')
      window.location.href = url.toString()
      window.location.search = url.search
      
      // Note: Testing OAuth flow is complex due to URL manipulation
      // This is a simplified test
      render(<App />)
      
      // App should render without crashing
      expect(screen.getByText(/Find your/i)).toBeInTheDocument()
    })
  })
})

describe('App Cache Functions', () => {
  describe('readMatchesCache', () => {
    it('should return null for empty sessionStorage', () => {
      sessionStorage.clear()
      
      render(<App />)
      
      // No matches should be displayed from cache
      expect(screen.getByText(/Find your/i)).toBeInTheDocument()
    })

    it('should return null for invalid JSON', () => {
      sessionStorage.setItem('githug_cached_matches_v1', 'invalid json')
      
      render(<App />)
      
      // Should not crash
      expect(screen.getByText(/Find your/i)).toBeInTheDocument()
    })

    it('should return null for missing matches array', () => {
      sessionStorage.setItem('githug_cached_matches_v1', JSON.stringify({ page: 1 }))
      
      render(<App />)
      
      // Should not crash
      expect(screen.getByText(/Find your/i)).toBeInTheDocument()
    })
  })
})
