import { useState, useEffect, useRef } from 'react'
import { Github, MapPin, Search, Moon, Sun, ArrowRight, ExternalLink, LogOut, Code, Star, Sparkles, RefreshCcw, Settings, Users } from 'lucide-react'
import { loginWithGithub, getProfile, searchUsers, clearCaches } from './services/github'

const MATCHES_CACHE_KEY = 'githug_cached_matches_v1'
const readMatchesCache = () => {
    try {
        const raw = sessionStorage.getItem(MATCHES_CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        if (!Array.isArray(parsed.matches)) return null
        return {
            matches: parsed.matches,
            page: Number.isFinite(parsed.page) ? parsed.page : 1,
            hasMore: Boolean(parsed.hasMore),
            savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
        }
    } catch {
        return null
    }
}

const writeMatchesCache = ({ matches, page, hasMore }) => {
    try {
        sessionStorage.setItem(
            MATCHES_CACHE_KEY,
            JSON.stringify({ matches, page, hasMore, savedAt: Date.now() })
        )
    } catch {
        // ignore storage quota / privacy mode
    }
}

const clearMatchesCache = () => {
    try {
        sessionStorage.removeItem(MATCHES_CACHE_KEY)
    } catch {
        // ignore
    }
}

// Key to force fresh fetch on next page load
const FORCE_REFRESH_KEY = 'githug_force_refresh'

const SkeletonCard = () => (
    <div className="p-6 rounded-3xl bg-card border border-border/60 dark:border-border/30 shadow-sm animate-pulse flex flex-col h-[320px]">
        <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-secondary/50"></div>
            <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-secondary/50 rounded-md"></div>
                <div className="h-4 w-20 bg-secondary/50 rounded-md"></div>
            </div>
        </div>
        <div className="space-y-3 flex-1">
             <div className="h-4 w-full bg-secondary/50 rounded-md"></div>
             <div className="h-4 w-5/6 bg-secondary/50 rounded-md"></div>
        </div>
        <div className="mt-6 h-10 w-full bg-secondary/50 rounded-xl"></div>
    </div>
)

function App() {
  const [user, setUser] = useState(null)
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [page, setPage] = useState(1)
  const [theme, setTheme] = useState('dark')
    const [authError, setAuthError] = useState('')

        const searchAbortRef = useRef(null)

      // Derived state to drive UI during the very first search
      // We rely on initialLoadComplete to know when the FIRST successful load happened.
      const [initialLoadComplete, setInitialLoadComplete] = useState(false)
      const isInitialSearch = Boolean(user) && !initialLoadComplete

        // Hydrate cached matches immediately (so reload feels like "load more")
        // BUT skip if user explicitly requested a refresh
        useEffect(() => {
            const token = localStorage.getItem('githug_token')
            if (!token) return
            
            // Check if user requested a fresh fetch
            const forceRefresh = sessionStorage.getItem(FORCE_REFRESH_KEY)
            if (forceRefresh) {
                sessionStorage.removeItem(FORCE_REFRESH_KEY)
                return // Skip cache hydration, will fetch fresh data
            }
            
            const cached = readMatchesCache()
            if (!cached) return
            setMatches(cached.matches)
            setHasMore(cached.hasMore)
            setPage(cached.page)
        }, [])

        // Persist matches cache for faster reloads
        useEffect(() => {
            if (!user) return
            if (!matches || matches.length === 0) return
            writeMatchesCache({ matches, page, hasMore })
        }, [user, matches, page, hasMore])

  useEffect(() => {
    // Check system preference on mount
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark')
      document.documentElement.classList.add('dark')
    } else {
      setTheme('light')
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
      const newTheme = theme === 'dark' ? 'light' : 'dark'
      setTheme(newTheme)
      if (newTheme === 'dark') {
          document.documentElement.classList.add('dark')
          localStorage.theme = 'dark'
      } else {
          document.documentElement.classList.remove('dark')
          localStorage.theme = 'light'
      }
  }
  
  const handleRefresh = () => {
      // Set flag to skip cache hydration on next load
      sessionStorage.setItem(FORCE_REFRESH_KEY, 'true')
      clearMatchesCache()
      clearCaches()
      // Force a complete navigation reload
      window.location.replace(window.location.origin)
  }

    // Handle OAuth redirect back to /callback?code=...
    useEffect(() => {
        const exchangeCodeForToken = async (code) => {
            setLoading(true)
            setAuthError('')
            try {
                console.log('[OAuth] Starting token exchange for code:', code?.substring(0, 10) + '...')
                // Use env var for function URL (allows different ports in dev vs prod)
                const functionUrl = import.meta.env.GITHUG_FUNCTION_URL || '/api/auth'
                console.log('[OAuth] Calling function:', functionUrl)
                const res = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        code,
                        redirect_uri: window.location.origin + '/callback'
                    }),
                })
                console.log('[OAuth] Response status:', res.status)
                const data = await res.json()
                console.log('[OAuth] Response data:', data)
                if (!res.ok || data.error) {
                    throw new Error(data.error_description || data.error || 'Token exchange failed')
                }
                console.log('[OAuth] Token received, saving and redirecting...')
                localStorage.setItem('githug_token', data.access_token)
                window.location.replace(window.location.origin) // reload without ?code
            } catch (e) {
                console.error('[OAuth] Token exchange failed:', e)
                setAuthError(e?.message || 'Token exchange failed')
                setLoading(false)
            }
        }

        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const oauthError = url.searchParams.get('error')

        if (oauthError) {
            const desc = url.searchParams.get('error_description')
            setAuthError(desc ? `${oauthError}: ${desc}` : oauthError)
            url.searchParams.delete('error')
            url.searchParams.delete('error_description')
            window.history.replaceState({}, '', url.pathname + url.search + url.hash)
        } else if (code) {
            // Clean URL immediately, then exchange
            url.searchParams.delete('code')
            url.searchParams.delete('state')
            window.history.replaceState({}, '', url.pathname + url.search + url.hash)
            exchangeCodeForToken(code)
        }
    }, [])

  // Check for token on load
  useEffect(() => {
    const token = localStorage.getItem('githug_token')

        const hasRealGithubAuthConfig = Boolean(import.meta.env.GITHUG_CLIENT_ID)

        // If the user previously ran in mock mode, a persisted mock token can make it
        // look like the app is "stuck" in mock even after adding real OAuth config.
        if (token === 'mock_token' && hasRealGithubAuthConfig) {
            localStorage.removeItem('githug_token')
            return
        }

        if (token) {
            // Check if user requested a fresh fetch (skip cache)
            const forceRefresh = sessionStorage.getItem(FORCE_REFRESH_KEY)
            
            // Check if we have cached results to show immediately
            const cached = !forceRefresh && readMatchesCache()
            const hasCachedResults = cached && cached.matches.length > 0
            
            setLoading(true)
            setSearching(true) // Set searching early to ensure UI shows loading state
            setAuthError('')
            
            getProfile(token)
                .then(async (u) => {
                    // Set user immediately so the UI shows the logged-in state
                    setUser(u)
                    
                    // If we have cached results, user already sees them - skip search
                    if (hasCachedResults) {
                        setLoading(false)
                        setSearching(false)
                        setInitialLoadComplete(true)
                        return
                    }

                    // Cancel any in-flight search before starting a new one
                    if (searchAbortRef.current) searchAbortRef.current.abort()
                    const controller = new AbortController()
                    searchAbortRef.current = controller

                    try {
                        const res = await searchUsers(token, u, { page: 1, pageSize: 12, excludeLogins: [], signal: controller.signal })
                        // Only update state if this request wasn't aborted
                        if (!controller.signal.aborted) {
                            setMatches(res.items)
                            setHasMore(Boolean(res.hasMore))
                            setPage(1)
                            setInitialLoadComplete(true)
                        }
                    } catch (e) {
                         if (e.name !== 'AbortError') {
                            console.error(e)
                            setAuthError(e?.message || 'Search failed')
                            // Even on error, we mark initial load as complete so we stop showing skeletons forever
                            setInitialLoadComplete(true)
                         }
                    } finally {
                        if (!controller.signal.aborted) {
                            setSearching(false)
                            setLoading(false)
                        }
                    }
                })
                .catch((e) => {
                    localStorage.removeItem('githug_token')
                    // Silently fail on auth errors (expired token), but show others
                    if (e?.status === 401 || e?.message?.toLowerCase()?.includes('bad credentials')) {
                        setAuthError('')
                    } else {
                        setAuthError(e?.message || 'GitHub authentication failed')
                    }
                    setLoading(false)
                })
        }
  }, [])

  const handleLogin = () => {
    loginWithGithub()
  }

  const handleLogout = () => {
    if (searchAbortRef.current) searchAbortRef.current.abort()
    localStorage.removeItem('githug_token')
    setUser(null)
    setMatches([])
    setHasMore(false)
    setPage(1)
    setInitialLoadComplete(false)
        clearMatchesCache()
        clearCaches()  // Clear internal GitHub service caches
  }

    const handleLoadMore = async () => {
        if (!user) return
        if (!hasMore || searching || loadingMore) return
        const token = localStorage.getItem('githug_token')
        if (!token) return

        // Cancel any in-flight request and start a fresh one
        if (searchAbortRef.current) searchAbortRef.current.abort()
        const controller = new AbortController()
        searchAbortRef.current = controller

        setLoadingMore(true)
        setAuthError('')
        try {
            const nextPage = page + 1
            const excludeLogins = matches.map(m => m.login)
            const res = await searchUsers(token, user, { page: nextPage, pageSize: 12, excludeLogins, signal: controller.signal })
            setMatches(prev => [...prev, ...res.items])
            setHasMore(Boolean(res.hasMore))
            setPage(nextPage)
        } catch (e) {
            console.error(e)
            setAuthError(e?.message || 'load more failed')
        } finally {
            setLoadingMore(false)
        }
    }

  // Show full-page loading spinner only when we don't have a user yet AND we're loading
  // Once user is set, we show the main UI with skeleton cards instead
  if (loading && !user) {
      return (
          <div className="min-h-screen bg-background flex items-center justify-center text-foreground transition-colors duration-300">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                  <p className="text-sm text-muted-foreground animate-pulse">Connecting to GitHub…</p>
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 font-sans selection:bg-primary/20">
      
      {/* Top Center Controls - Only when logged out */}
      {!user && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 rounded-full bg-background/80 backdrop-blur-md border border-border/60 shadow-md">
              <a
                  href="https://github.com/davidesantangelo/githug"
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-full hover:bg-secondary/80 transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="View source on GitHub"
              >
                  <Github className="w-5 h-5" />
              </a>
              <div className="w-px h-5 bg-border/60 my-1"></div>
              <button 
                  onClick={toggleTheme}
                  className="p-3 rounded-full hover:bg-secondary/80 transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Toggle theme"
              >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
          </div>
      )}

      {/* Top Right Controls */}
      <div className="fixed top-6 right-6 z-50 flex items-center gap-4">
          {/* Expandable Controls Menu - Only when logged in */}
          {user && (
              <div className="group relative flex items-center">
                  {/* Settings Icon - Always Visible */}
                  <div className="p-3 rounded-full bg-secondary/50 backdrop-blur-sm border border-border/50 shadow-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      <Settings className="w-5 h-5" />
                  </div>
                  
                  {/* Expanded Icons - Show on Hover */}
                  <div className="absolute right-full flex items-center gap-2 pr-2 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto">
                      <a
                          href="https://github.com/davidesantangelo/githug"
                          target="_blank"
                          rel="noreferrer"
                          className="p-3 rounded-full bg-secondary/50 backdrop-blur-sm hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground border border-border/50 shadow-sm"
                          aria-label="View source on GitHub"
                      >
                          <Github className="w-5 h-5" />
                      </a>
                      
                      <button 
                          onClick={handleRefresh}
                          className="p-3 rounded-full bg-secondary/50 backdrop-blur-sm hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground border border-border/50 shadow-sm"
                          aria-label="Refresh and clear cache"
                      >
                          <RefreshCcw className="w-5 h-5" />
                      </button>

                      <button 
                          onClick={toggleTheme}
                          className="p-3 rounded-full bg-secondary/50 backdrop-blur-sm hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground border border-border/50 shadow-sm"
                          aria-label="Toggle theme"
                      >
                          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                      </button>
                  </div>
              </div>
          )}
          
          {user && (
              <div className="flex items-center gap-3 bg-secondary/50 backdrop-blur-sm border border-border/50 rounded-full pl-1 pr-4 py-1 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                  <img src={user.avatar_url} alt={user.login} className="w-9 h-9 rounded-full ring-2 ring-background" />
                  <button 
                    onClick={handleLogout}
                    className="text-sm font-medium text-muted-foreground hover:text-destructive transition-colors flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
              </div>
          )}
      </div>

      {/* Main Content */}
      <main className="min-h-screen flex flex-col p-6 max-w-[1600px] mx-auto">
        {!user ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full"></div>
                    <Github className="w-24 h-24 relative z-10 text-primary drop-shadow-2xl" />
                </div>
                
                <div className="space-y-4">
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-primary">
                        Find your <span className="text-foreground/50">code</span> mate
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto">
                        Discover new GitHub users nearby who share your stack.
                    </p>
                </div>

                <div className="pt-4">
                    <button 
                        onClick={handleLogin}
                        className="group relative px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold text-lg hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-3"
                    >
                        Connect with GitHub
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>

                                        {authError && (
                                            <div className="mt-6 text-sm text-muted-foreground bg-secondary/40 border border-border/50 rounded-2xl p-4 text-left">
                                                {authError}
                                            </div>
                                        )}
                </div>
                

            </div>
        ) : (
            <div className="space-y-12 animate-in fade-in duration-700 py-12 md:py-20">
                <div className="mb-12">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="space-y-2 relative">
                            {/* Ambient Glow */}
                            <div className="absolute -left-10 -top-10 w-32 h-32 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>
                            
                            <div className="text-xs font-bold tracking-widest text-primary/60 uppercase mb-2 ml-1">GitHug</div>

                            <h2 className="relative text-4xl md:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70 leading-normal pb-2 pr-2">
                                {isInitialSearch ? (
                                    <span>Finding matches...</span>
                                ) : (
                                    <>
                                        Found <span className="mx-2 inline-flex items-center justify-center px-4 py-1 rounded-lg bg-primary text-primary-foreground text-3xl md:text-5xl align-middle shadow-lg hover:scale-105 transition-transform duration-300">{matches.length}</span> New Users
                                    </>
                                )}
                            </h2>
                            <p className="text-lg md:text-xl text-muted-foreground/80 font-medium max-w-2xl leading-relaxed">
                                {isInitialSearch 
                                    ? 'Analyzing your repos, languages and starred projects…'
                                    : searching 
                                        ? 'Scanning the Octoverse for more candidates…'
                                        : "Users you don't follow yet, matched by your public activity."
                                }
                            </p>
                        </div>

                        {(searching || loadingMore) && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 backdrop-blur-sm border border-border/50 shadow-sm animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                                <span className="text-xs font-semibold text-primary">{searching ? 'Analyzing...' : 'Loading more...'}</span>
                            </div>
                        )}

                        {authError && (
                            <div className="text-sm text-destructive border-l-2 border-destructive pl-3 py-1 bg-destructive/5 rounded-r-md">
                                {authError}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {matches.map((match) => (
                            <div key={match.id} className="group flex flex-col p-6 rounded-xl bg-card border border-border/60 dark:border-border/30 shadow-sm hover:shadow-2xl hover:shadow-primary/10 dark:hover:bg-card/80 hover:-translate-y-1 transition-all duration-300">
                                {/* Match Score & Followers */}
                                <div className="flex items-center justify-between mb-4">
                                    {match.matchScore > 0 && (
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 py-1 px-2.5 rounded-full">
                                            <Sparkles className="w-3 h-3" />
                                            {match.matchScore}% match
                                        </div>
                                    )}
                                    {/* Followers Count */}
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-secondary/50 py-1 px-2.5 rounded-full border border-border/40">
                                        <Users className="w-3 h-3" />
                                        {((num) => {
                                            if (!num) return 0;
                                            if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
                                            return num;
                                        })(match.followers)}
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="relative">
                                        <img src={match.avatar_url} alt={match.login} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-border/50 dark:ring-border ring-offset-2 ring-offset-background group-hover:scale-105 transition-transform duration-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-lg truncate leading-tight">{match.name || match.login}</h3>
                                        <p className="text-muted-foreground text-sm truncate">@{match.login}</p>
                                    </div>
                                </div>
                                
                                <div className="flex-1 space-y-3">
                                    {/* Languages - Enhanced Badges */}
                                    {match.languages && match.languages.length > 0 && (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {match.languages.slice(0, 3).map((lang) => (
                                                <span key={lang} className="text-xs font-semibold text-foreground/80 bg-secondary border border-border/50 py-1 px-2.5 rounded-md shadow-sm">
                                                    {lang}
                                                </span>
                                            ))}
                                            {match.languages.length > 3 && (
                                                <span className="text-[10px] font-medium text-muted-foreground bg-secondary/30 py-0.5 px-1.5 rounded-md">
                                                    +{match.languages.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Location */}
                                    {match.location && (
                                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                            <MapPin className="w-3 h-3" />
                                            {match.location}
                                        </div>
                                    )}
                                    
                                    {/* Match Reasons */}
                                    {match.matchReasons && match.matchReasons.length > 0 && (
                                        <div className="space-y-1">
                                            {match.matchReasons.slice(0, 2).map((reason, i) => (
                                                <p key={i} className="text-xs text-primary/80 flex items-center gap-1.5">
                                                    <Star className="w-3 h-3" />
                                                    {reason}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {/* Bio */}
                                    <p className="text-sm text-muted-foreground/80 line-clamp-2 leading-relaxed">
                                        {match.bio || "This developer prefers to let their code speak for itself."}
                                    </p>
                                </div>
                                
                                <a 
                                    href={match.html_url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold transition-all"
                                >
                                    View Profile <ExternalLink className="w-3 h-3 opacity-50" />
                                </a>
                            </div>
                        ))}

                    {/* Show skeleton cards during initial search or while loading with no matches */}
                    {isInitialSearch && (
                        Array(12).fill(0).map((_, i) => <SkeletonCard key={`s-${i}`} />)
                    )}

                    {loadingMore && (
                        Array(4).fill(0).map((_, i) => <SkeletonCard key={`m-${i}`} />)
                    )}
                </div>

                {!searching && matches.length > 0 && (
                    <div className="pt-2 flex flex-col items-center gap-3">
                        {hasMore ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleLoadMore}
                                    disabled={loadingMore}
                                    className="w-full max-w-xs px-6 py-4 rounded-2xl bg-secondary/80 hover:bg-secondary border border-border/60 text-sm font-bold tracking-wide transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {loadingMore ? (
                                        <>
                                            <span className="w-4 h-4 rounded-full border-2 border-foreground/30 border-t-foreground animate-spin" />
                                            Loading more...
                                        </>
                                    ) : (
                                        <>
                                            Load More Users
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <div className="text-xs text-muted-foreground pt-4">
                                {matches.length} new users found. People you follow are excluded.
                            </div>
                        )}
                    </div>
                )}
            </div>
        )}
      </main>
    </div>
  )
}

export default App
