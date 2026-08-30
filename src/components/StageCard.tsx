interface StageCardProps {
  number: string
  title: string
  description: string
  status?: 'ready' | 'planned'
}
export function StageCard({
  number,
  title,
  description,
  status = 'planned',
}: StageCardProps) {
  return (
    <article className="stage-card">
      <div className="stage-number">{number}</div>
      <div>
        <div className="stage-heading">
          <h2>{title}</h2>
          <span className={`stage-status ${status}`}>{status}</span>
        </div>
        <p>{description}</p>
      </div>
    </article>
  )
}
