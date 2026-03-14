// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: any, res: any, _next: any) {
  // eslint-disable-next-line no-console
  console.error('[error]', err)
  res.status(500).json({ error: 'Internal server error' })
}

