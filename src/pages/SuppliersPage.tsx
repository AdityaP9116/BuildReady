import { PageIntro } from '../components/PageIntro'

export function SuppliersPage() {
  return (
    <div className="page">
      <PageIntro
        eyebrow="Supplier comparison"
        title="Compare controlled manufacturing options."
        description="Two fictional suppliers will return normalized prices, lead times, assumptions, and DFM feedback for the reviewed configuration."
      />
      <section className="empty-state">
        <span>Gate 6</span>
        <h2>Supplier fixtures are intentionally not connected yet.</h2>
        <p>The comparison unlocks only after a visible human decision on the design preview.</p>
      </section>
    </div>
  )
}
