import { PageIntro } from '../components/PageIntro'

export function AboutPage() {
  return (
    <div className="page narrow-page">
      <PageIntro
        eyebrow="Why BuildReady"
        title="The browser becomes an engineering workspace the agent can understand."
        description="WebMCP exposes precise, page-controlled actions instead of forcing an agent to guess through clicks. Deterministic rules provide measurements; the engineer retains authority."
      />

      <section className="principles-grid">
        <article>
          <span>01</span>
          <h2>Evidence first</h2>
          <p>Every finding carries observed values, thresholds, rule versions, and affected features.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Human authority</h2>
          <p>The agent can prepare a change, but only the visible engineer control can approve it.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Safe demonstration</h2>
          <p>The challenge path uses controlled fixtures and makes no production-readiness claim.</p>
        </article>
      </section>
    </div>
  )
}
