import { Component } from 'react'

/**
 * Catches render errors anywhere in the app so users see a friendly
 * recovery screen instead of a blank page. Errors are logged to the
 * console (and could be forwarded to a monitoring service later).
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
        console.error('[GitHug] Render error:', error, errorInfo)
    }

    handleReset = () => {
        this.setState({ hasError: false })
    }

    handleReload = () => {
        window.location.reload()
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
                    <div className="max-w-md text-center space-y-6 animate-in fade-in duration-500">
                        <div className="text-5xl" aria-hidden="true">🫂</div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
                            <p className="text-muted-foreground leading-relaxed">
                                GitHug hit an unexpected error. Your session is still safe — try again, and if the
                                problem persists please reload the page.
                            </p>
                        </div>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={this.handleReset}
                                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:shadow-lg hover:shadow-primary/25 transition-all"
                            >
                                Try again
                            </button>
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="px-6 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/80 transition-all"
                            >
                                Reload page
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
