export function WebMcpStatus() {
  const isSupported = typeof document !== 'undefined' && 'modelContext' in document

  return (
    <div className={isSupported ? 'protocol-status supported' : 'protocol-status'}>
      <span aria-hidden="true" />
      <span>
        <strong>WebMCP</strong>
        <small>{isSupported ? 'Available' : 'Compatibility mode'}</small>
      </span>
    </div>
  )
}
