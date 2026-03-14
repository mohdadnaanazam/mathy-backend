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

#### Deployment

- **Docker**: `docker build -t mathy-backend .` then `docker run -p 4000:4000 mathy-backend`  
- **Render / Railway**: use `npm run build` as build command, `npm start` as start, and set env vars from `.env`.  

