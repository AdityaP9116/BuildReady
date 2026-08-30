import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="page narrow-page">
      <section className="empty-state">
        <span>404</span>
        <h1>This workspace does not exist.</h1>
        <p>Return to the controlled design fixture and restart the manufacturing review.</p>
        <Link className="button-link" to="/design">Open design workspace</Link>
      </section>
    </div>
  )
}
