import type { Request, Response } from 'express'
import { getSupabaseClient } from '../database/supabaseClient'

/**
 * Save user browser push subscription for daily notifications.
 */
export async function subscribe(req: Request, res: Response) {
  try {
    const { user_id, subscription } = req.body
    
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Missing mandatory subscription data.' })
    }

    const supabase = getSupabaseClient()
    
    // upsert the subscription based on unique endpoint
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user_id || null,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      }, { onConflict: 'endpoint' })

    if (error) throw error

    res.status(201).json({ message: 'Push subscription saved.' })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save subscription.' })
  }
}

/**
 * Remove an existing subscription endpoint.
 */
export async function unsubscribe(req: Request, res: Response) {
  try {
    const { endpoint } = req.body
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint to unsubscribe.' })
    }

    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .match({ endpoint })

    if (error) throw error

    res.json({ message: 'Unsubscribed successfully.' })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to unsubscribe.' })
  }
}
