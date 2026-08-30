import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('BuildReady root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
