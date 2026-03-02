# antar-web monorepo

Antar web + backend monorepo.

## Apps

- `apps/web` - Next.js mobile-first PWA frontend.
- `apps/backend` - Fastify API backend (ported from Android backend).

## Scripts

- `npm run dev:web`
- `npm run dev:backend`
- `npm run build:web`
- `npm run build:backend`
- `npm run test:backend`
- `npm run lint:web`

## Frontend setup

1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Fill Firebase web credentials + backend base URL.
3. Run `npm run dev:web`.

## Backend setup

1. Copy `apps/backend/.env.example` to `apps/backend/.env`.
2. Fill Firebase service account, OpenAI, and Razorpay secrets.
3. Run `npm run dev:backend`.

## Deploy backend (Cloud Run)

```bash
cd apps/backend
gcloud run deploy antar-backend \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated
```

## Deploy frontend (Vercel)

Create Vercel project with root directory `apps/web`.
