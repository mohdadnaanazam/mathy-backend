// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: any, res: any, _next: any) {
  // eslint-disable-next-line no-console
  console.error('[error]', err)

  if (err instanceof Error) {
    // Check for common HTTP-like error patterns
    const statusMatch = err.message.match(/^(\d{3})\s*:/)
    const status = statusMatch ? Number(statusMatch[1]) : 500
    res.status(status).json({ error: err.message })
    return
  }

  res.status(500).json({ error: 'Internal server error' })
}
