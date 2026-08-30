import { PageIntro } from '../components/PageIntro'

export function ReviewPage() {
  return (
    <div className="page">
      <PageIntro
        eyebrow="Evidence package"
        title="Finish with a traceable manufacturing review."
        description="Findings, the proposed correction, the human decision, supplier quotes, provenance, and the audit timeline will resolve into one package."
      />
      <section className="empty-state">
        <span>Gate 7</span>
        <h2>No review package has been generated.</h2>
        <p>Complete the design inspection and supplier comparison before creating the final record.</p>
      </section>
    </div>
  )
}
