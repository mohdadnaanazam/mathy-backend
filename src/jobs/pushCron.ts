import cron from 'node-cron'
import webpush from 'web-push'
import { getSupabaseClient } from '../database/supabaseClient'
import { env } from '../config/env'

// Initialize web-push with VAPID keys from environment
// These should be configured in backend/.env or Vercel environment variables
function setupWebPush() {
  const publicVapidKey = env.vapidPublicKey || process.env.VAPID_PUBLIC_KEY
  const privateVapidKey = env.vapidPrivateKey || process.env.VAPID_PRIVATE_KEY
  const subject = env.vapidSubject || process.env.VAPID_SUBJECT || 'mailto:admin@themathy.com'

  if (!publicVapidKey || !privateVapidKey) {
    console.warn('[PushCron] Web Push VAPID keys missing. Notifications will not be sent.')
    return false
  }

  webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey)
  return true
}

/**
 * Schedules the notification job at 8:00 PM Indian Standard Time (IST).
 * IST is UTC+5:30, so 8 PM IST = 14:30 (2:30 PM) UTC.
 */
export function startPushCron() {
  if (!setupWebPush()) return

  // 14:30 UTC = 20:00 IST
  cron.schedule('30 14 * * *', async () => {
    console.log('[PushCron] Starting daily notification job at 8 PM IST...')
    await sendDailyNotifications()
  })
}

async function sendDailyNotifications() {
  const supabase = getSupabaseClient()
  const { data: subs, error } = await supabase
    .from('push_subscriptions' as any)
    .select('id, endpoint, keys')

  if (error || !subs) {
    console.error('[PushCron] Error fetching subscriptions:', error)
    return
  }

  console.log(`[PushCron] Sending notifications to ${(subs as any[]).length} active subscriptions.`)

  const payload = JSON.stringify({
    title: 'Time to play Mathy! 🧠',
    body: 'Your daily challenge is ready! Sharpen your brain and compete on the leaderboard. 🔥',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    url: '/',
  })

  const results = await Promise.allSettled(
    (subs as any[]).map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys as any,
          },
          payload
        )
      } catch (err: any) {
        // If endpoint is 404 (Not Found) or 410 (Gone), delete it
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log(`[PushCron] Removing invalid subscription: ${sub.endpoint}`)
          await supabase.from('push_subscriptions' as any).delete().match({ id: sub.id })
        }
        throw err
      }
    })
  )

  const successCount = results.filter((r) => r.status === 'fulfilled').length
  const failCount = results.filter((r) => r.status === 'rejected').length
  console.log(`[PushCron] Job finished. Success: ${successCount}, Failed/Cleaned: ${failCount}.`)
}
