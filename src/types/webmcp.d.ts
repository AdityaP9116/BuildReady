export {}

declare global {
  interface Document {
    readonly modelContext?: unknown
  }
}
