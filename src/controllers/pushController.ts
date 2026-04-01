import type { Request, Response } from 'express'
import { getSupabaseClient } from '../database/supabaseClient'

/**
 * Save user browser push subscription for daily notifications.
 */
export async function subscribe(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as any
    const { user_id, subscription } = body
    
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      res.status(400).json({ error: 'Missing mandatory subscription data.' })
      return
    }

    const supabase = getSupabaseClient()
    
    // upsert the subscription based on unique endpoint
    const { error } = await supabase
      .from('push_subscriptions' as any)
      .upsert({
        user_id: user_id || null,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      } as any, { onConflict: 'endpoint' })

    if (error) throw error

    res.status(201).json({ message: 'Push subscription saved.' })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save subscription.' })
  }
}

/**
 * Remove an existing subscription endpoint.
 */
export async function unsubscribe(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as any
    const { endpoint } = body
    
    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint to unsubscribe.' })
      return
    }

    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('push_subscriptions' as any)
      .delete()
      .match({ endpoint })

    if (error) throw error

    res.json({ message: 'Unsubscribed successfully.' })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to unsubscribe.' })
  }
}
