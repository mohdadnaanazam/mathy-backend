# OpenAI Game Generation System

## Overview

The Mathy backend uses OpenAI GPT-3.5-turbo to generate math questions for the game. This document explains the complete flow from API call to database storage.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Game Cron     │────▶│  Game Generator  │────▶│  OpenAI API     │
│  (Scheduler)    │     │                  │     │  (GPT-3.5)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │    Supabase      │
                        │   (PostgreSQL)   │
                        └──────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/ai/openaiClient.ts` | OpenAI API client |
| `backend/src/ai/gameGenerator.ts` | Game generation logic |
| `backend/src/services/gameService.ts` | Session & batch management |
| `backend/src/jobs/gameCron.ts` | Scheduled game rotation |

---

## 1. OpenAI Client (`openaiClient.ts`)

### Configuration
```typescript
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const model = 'gpt-3.5-turbo'
const timeout = 30_000 // 30 seconds
```

### API Call Structure
```typescript
{
  model: 'gpt-3.5-turbo',
  messages: [
    {
      role: 'system',
      content: 'You are a math question generator. Generate questions in valid JSON format only.'
    },
    {
      role: 'user',
      content: prompt // The actual generation prompt
    }
  ],
  temperature: 0.7,
  max_tokens: 2048
}
```

### Environment Variable
```env
OPENAI_API_KEY=sk-proj-your-key-here
```

---

## 2. Game Generator (`gameGenerator.ts`)

### Main Function: `generateGamesWithAI()`

```typescript
export async function generateGamesWithAI(
  count: number,           // Number of questions (default: 20)
  operation?: OperationMode, // 'addition' | 'subtraction' | 'multiplication' | 'division' | 'mixed'
  difficultyHint?: GameDifficulty // 'easy' | 'medium' | 'hard'
): Promise<GeneratedGame[]>
```

### Prompt Template
```
Generate exactly {count} random math questions in JSON format.
Only use the "{operation}" operation for all questions.
All questions must match "{difficulty}" difficulty using digit-count scaling.
- Easy: 1–2 digit numbers
- Medium: 2–3 digit numbers  
- Hard: 3–5 digit numbers
Return ONLY a JSON array, no extra text.
Each object must have: "game_type", "question", "correct_answer", "difficulty".
```

### Response Format
```json
[
  {
    "game_type": "addition",
    "question": "15 + 9 = ?",
    "correct_answer": 24,
    "difficulty": "easy"
  },
  {
    "game_type": "multiplication",
    "question": "7 × 4 = ?",
    "correct_answer": 28,
    "difficulty": "easy"
  }
]
```

### Fallback Logic
If OpenAI fails or no API key is set, the system falls back to local generation:
```typescript
if (!env.openaiApiKey) {
  return generateGamesLocally(count, operation, difficultyHint)
}
```

---

## 3. Database Storage

### Games Table Schema
```sql
CREATE TABLE games (
  id UUID PRIMARY KEY,
  game_type VARCHAR NOT NULL,
  question TEXT NOT NULL,
  correct_answer VARCHAR NOT NULL,
  difficulty VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  session_id UUID REFERENCES sessions(id)
);
```

### Insert Function: `storeGeneratedGames()`
```typescript
const payload = games.map(g => ({
  id: randomUUID(),
  game_type: g.game_type,
  question: g.question,
  correct_answer: String(g.correct_answer),
  difficulty: g.difficulty,
  created_at: now.toISOString(),
  expires_at: expires.toISOString(),
  session_id: sessionId
}))

await supabase.from('games').insert(payload)
```

---

## 4. Session System

### Dual-Session Pattern
The system maintains 2 sessions for zero-downtime rotation:

1. **Active Session** - Currently serving games to users
2. **Next Session** - Pre-generated, waiting to become active

### Session Lifecycle
```
[Create Next] → [Generate Games] → [Wait for Active to Expire] → [Promote Next to Active] → [Delete Old]
```

### Session Table Schema
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  status VARCHAR DEFAULT 'active', -- 'active' | 'ready' | 'expired'
  starts_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Game Generation Schedule

### What Gets Generated Per Session

| Game Type | Easy | Medium | Hard | Total | Generator |
|-----------|------|--------|------|-------|-----------|
| Addition | 50 | 50 | 50 | 150 | OpenAI |
| Subtraction | 50 | 50 | 50 | 150 | OpenAI |
| Multiplication | 50 | 50 | 50 | 150 | OpenAI |
| Division | 50 | 50 | 50 | 150 | OpenAI |
| True/False | 50 | 50 | 50 | 150 | Local |
| Square Root | 50 | 50 | 50 | 150 | Local |
| Fractions | 50 | 50 | 50 | 150 | Local |
| Percentage | 50 | 50 | 50 | 150 | Local |
| Algebra | 50 | 50 | 50 | 150 | Local |
| Speed Math | 50 | 50 | 50 | 150 | Local |
| Logic Puzzle | 50 | 50 | 50 | 150 | Local |
| Speed Sort | 50 | 50 | 50 | 150 | Local |
| **Total** | | | | **~1800** | |

### Cron Schedule
- Games are pre-generated **5 minutes before** the active session expires
- Session duration: Configurable (default: 1 hour)
- Safety check: Every 5 minutes

---

## 6. API Endpoints

### Generate Games (Manual Trigger)
```
POST /games/generate
```

### Get Games by Type
```
GET /games/:type?difficulty=easy
```
Example: `GET /games/addition?difficulty=medium`

### Get Session Info
```
GET /games/session
```
Response:
```json
{
  "session_id": "uuid",
  "starts_at": "2024-01-01T00:00:00Z",
  "expires_at": "2024-01-01T01:00:00Z",
  "status": "active",
  "games_count": 1800,
  "next_session_ready": true
}
```

---

## 7. Logging

The system logs all OpenAI interactions:

```
[GameGenerator] 🎮 generateGamesWithAI called: { count: 20, operation: 'addition', difficultyHint: 'easy' }
[GameGenerator] 🤖 Using OpenAI for generation
[OpenAI] 🚀 Starting request to gpt-3.5-turbo
[OpenAI] 📝 Prompt length: 537 chars
[OpenAI] ⏱️ Response received in 4761 ms, status: 200
[OpenAI] ✅ Success! Response length: 1879 chars
[OpenAI] 📊 Tokens used: 665 (prompt: 168, completion: 497)
[GameGenerator] ✅ OpenAI generated 20 games successfully
[generateAndStoreGames] Inserted 20 games for session abc123
```

---

## 8. Error Handling

### Fallback Chain
1. Try OpenAI generation
2. If fails → Use local deterministic generation
3. If local fails → Log error, keep existing games

### Common Errors
| Error | Cause | Solution |
|-------|-------|----------|
| `OPENAI_API_KEY is required` | Missing env var | Add key to `.env` |
| `OpenAI API 401` | Invalid API key | Regenerate key |
| `OpenAI API 429` | Rate limited | Wait or upgrade plan |
| `Request timed out` | Slow response | Retry automatically |

---

## 9. Cost Estimation

### Per Generation Batch (20 questions)
- Prompt tokens: ~170
- Completion tokens: ~500
- Total: ~670 tokens

### Per Session (~1800 games, only 600 via OpenAI)
- OpenAI calls: 12 (4 operations × 3 difficulties)
- Total tokens: ~8,000
- Cost: ~$0.012 (at $0.0015/1K tokens for GPT-3.5-turbo)

### Monthly (assuming hourly rotation)
- Sessions/month: ~720
- Cost: ~$8.64/month

---

## 10. Testing

### Test OpenAI Connection
```bash
curl -X POST http://localhost:4000/games/generate
```

### Check Logs
Look for these in your terminal:
```
[OpenAI] ✅ Success!
[GameGenerator] ✅ OpenAI generated X games successfully
```

### Verify in Database
```sql
SELECT game_type, difficulty, COUNT(*) 
FROM games 
WHERE session_id = 'your-session-id'
GROUP BY game_type, difficulty;
```
