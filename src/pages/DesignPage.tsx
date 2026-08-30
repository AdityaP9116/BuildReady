import { PageIntro } from '../components/PageIntro'
import { StageCard } from '../components/StageCard'

export function DesignPage() {
  return (
    <div className="page">
      <PageIntro
        eyebrow="Design workspace"
        title="Prepare a CNC design with your agent."
        description="BuildReady will bind the active bracket, revision, selected feature, and deterministic manufacturing evidence to a focused WebMCP tool surface."
      >
        <div className="part-chip">
          <span>Sample fixture</span>
          <strong>BRKT-001-B</strong>
        </div>
      </PageIntro>

      <section className="workspace-grid" aria-label="BuildReady workflow foundation">
        <div className="viewer-placeholder">
          <div className="bracket-mark" aria-hidden="true">
            <span />
            <span />
          </div>
          <p>Parametric bracket viewer arrives in Gate 4.</p>
        </div>

        <div className="stage-list">
          <StageCard
            number="01"
            title="Read design context"
            description="Expose the active part, material, process, quantity, revision, and selected feature."
            status="ready"
          />
          <StageCard
            number="02"
            title="Inspect manufacturability"
            description="Run five reproducible CNC checks and highlight measured evidence."
          />
          <StageCard
            number="03"
            title="Preview a correction"
            description="Show a bounded radius change without committing it for the engineer."
          />
        </div>
      </section>

      <aside className="compatibility-note">
        <strong>Gate 1 foundation</strong>
        <span>
          This shell remains usable without WebMCP. Tool registration begins in Gate 2 after the public deployment is verified.
        </span>
      </aside>
    </div>
  )
}
