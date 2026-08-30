import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('BuildReady application shell', () => {
  it('renders the controlled design workspace and navigation', () => {
    render(
      <MemoryRouter initialEntries={['/design']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /prepare a cnc design/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument()
    expect(screen.getByText('BRKT-001-B')).toBeInTheDocument()
    expect(screen.getByText(/compatibility mode/i)).toBeInTheDocument()
  })

  it('renders a recovery page for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /workspace does not exist/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open design workspace/i })).toHaveAttribute(
      'href',
      '/design',
    )
  })
})
