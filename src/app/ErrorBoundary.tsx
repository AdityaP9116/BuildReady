import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}
interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('BuildReady application error', error, info)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <p className="eyebrow">Application error</p>
          <h1>BuildReady could not load this workspace.</h1>
          <p>Reload the page to restore the controlled demonstration fixture.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
