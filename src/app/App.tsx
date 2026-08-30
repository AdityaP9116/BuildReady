import { NavLink, Route, Routes } from 'react-router-dom'
import { AboutPage } from '../pages/AboutPage'
import { DesignPage } from '../pages/DesignPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ReviewPage } from '../pages/ReviewPage'
import { SuppliersPage } from '../pages/SuppliersPage'
import { WebMcpStatus } from './WebMcpStatus'

const navigation = [
  { to: '/design', label: 'Design' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/review', label: 'Review' },
  { to: '/about', label: 'About' },
]

export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/design" aria-label="BuildReady home">
          <span className="brand-mark" aria-hidden="true">BR</span>
          <span>
            <strong>BuildReady</strong>
            <small>Manufacturing readiness, with evidence</small>
          </span>
        </NavLink>

        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <WebMcpStatus />
      </header>

      <main>
        <Routes>
          <Route path="/" element={<DesignPage />} />
          <Route path="/design" element={<DesignPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}
