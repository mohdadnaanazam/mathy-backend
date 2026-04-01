# Supabase Push Subscriptions Table

Run this SQL in your Supabase SQL Editor to create the necessary table for storing push notification subscriptions.

```sql
-- Table to store push subscriptions for anonymous users
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text, -- optional: matches the anonymous UUID generated in the frontend
  endpoint text UNIQUE NOT NULL,
  keys jsonb NOT NULL, -- contains p256dh and auth keys
  created_at timestamptz DEFAULT now()
);

-- Index for faster cleanup/lookup
CREATE INDEX IF NOT EXISTS idx_push_endpoint ON public.push_subscriptions(endpoint);

-- Enable RLS (Optional, but recommended)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (if using supabase client directly) 
-- or you can keep it restricted and use service_role from your Node backend.
-- Since the backend uses the service role key, no specific RLS policy is strictly required 
-- for the backend to perform its tasks, but good practice is to allow authenticated/anon 
-- to insert if they are the owners.
```

> [!NOTE]
> Since we are building for anonymous users, the `user_id` field is optional but useful if you want to group subscriptions by the same device/browser instance.
