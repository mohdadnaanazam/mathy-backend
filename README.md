### Mathy Backend

Node.js + Express + TypeScript backend for the Mathy game.

#### Tech

- **Runtime**: Node.js, Express, TypeScript  
- **Database**: Supabase PostgreSQL (`games` table)  
- **AI**: LangChain integration placeholder with a local fallback generator  
- **Scheduling**: `node-cron` hourly job to delete expired games and create new ones

#### Environment

Copy `.env.example` to `.env` and fill:

- `SUPABASE_URL`  
- `SUPABASE_SERVICE_ROLE_KEY` (service role key – keep secret)  
- `AI_API_KEY` (LLM provider key – optional; local generation is used if empty)  

#### Scripts

- `npm run dev` – start dev server with TS watcher  
- `npm run build` – build to `dist`  
- `npm start` – run compiled server  

#### API

- `GET /games` – all active games  
- `GET /games/:type` – filter by type (`addition|subtraction|multiplication|division|mixed`)  
- `POST /games/generate?count=20` – generate & store a new batch  
- `POST /games/custom` – generate custom games in memory:

```json
{
  "operation": "addition",
  "min_number": 1,
  "max_number": 50,
  "questions": 10,
  "difficulty": "easy"
}
```

#### Cron

An hourly job:

- deletes expired rows from `games`  
- inserts a fresh batch of generated games

#### Troubleshooting: No data in Supabase

1. **Check connection**  
   Call `GET /health/db`. It returns `gamesCount` and any DB error. If you see "Supabase not configured", set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your backend `.env` (and on Render if deployed).

2. **Create the table**  
   In Supabase: **Table Editor** → Create table, or **SQL Editor** → run:

```sql
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  game_type text not null,
  question text not null,
  correct_answer text not null,
  difficulty text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
```

3. **Insert data**  
   Call `POST /games/generate` (or `POST /games/generate?count=10`). Then open **Table Editor** → **games** to see rows.

4. **If backend is on Render**  
   Free tier sleeps after inactivity. Wake it with a request (e.g. GET `/health` or UptimeRobot), then call `POST /games/generate`.

#### Deployment

- **Docker**: `docker build -t mathy-backend .` then `docker run -p 4000:4000 mathy-backend`  
- **Render / Railway**: use `npm run build` as build command, `npm start` as start, and set env vars from `.env`.  

