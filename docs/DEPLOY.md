# Deploying The Bot Club to GCP Cloud Run

## Prerequisites

- GCP project with Cloud Run & Cloud SQL (PostgreSQL)
- Domain: `thebot.club` pointed at Cloud Run service

## 1. GitHub OAuth Setup

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in:
   - **Application name:** The Bot Club
   - **Homepage URL:** `https://thebot.club`
   - **Authorization callback URL:** `https://thebot.club/api/auth/callback/github`
3. Copy the **Client ID** → set as `AUTH_GITHUB_ID`
4. Generate a **Client Secret** → set as `AUTH_GITHUB_SECRET`

## 2. Google OAuth Setup (optional)

1. Go to **Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID**
2. Authorized redirect URI: `https://thebot.club/api/auth/callback/google`
3. Copy Client ID → `AUTH_GOOGLE_ID`, Client Secret → `AUTH_GOOGLE_SECRET`

## 3. Required Environment Variables

```bash
# Must set these in Cloud Run:
DATABASE_URL=postgresql://...        # Cloud SQL connection string
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=https://thebot.club
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
NEXT_PUBLIC_APP_URL=https://thebot.club
```

## 4. Optional Environment Variables

```bash
# Stripe (payments disabled without these)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Redis (rate limiting disabled without this)
REDIS_URL=redis://...

# OpenAI (QA scoring disabled without this)
OPENAI_API_KEY=sk-...
```

## 5. Build & Deploy

```bash
# Build the container
docker build -t thebotclub .

# Push to Artifact Registry
docker tag thebotclub gcr.io/PROJECT_ID/thebotclub
docker push gcr.io/PROJECT_ID/thebotclub

# Deploy to Cloud Run
gcloud run deploy thebotclub \
  --image gcr.io/PROJECT_ID/thebotclub \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "AUTH_URL=https://thebot.club,NEXT_PUBLIC_APP_URL=https://thebot.club" \
  --set-secrets "DATABASE_URL=db-url:latest,AUTH_SECRET=auth-secret:latest,AUTH_GITHUB_ID=gh-id:latest,AUTH_GITHUB_SECRET=gh-secret:latest"
```

## 6. Database Migration

```bash
# Run Prisma migrations against Cloud SQL
npx prisma migrate deploy
```

## Notes

- Redis and Stripe are fully optional — the app degrades gracefully without them
- Rate limiting is bypassed when Redis is unavailable
- Payment endpoints return 503 when Stripe is not configured
