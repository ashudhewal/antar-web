# antar-backend

Fastify + TypeScript backend for Antar MVP.

## Features

- Firebase ID token verification middleware
- Firestore-backed users/entitlements/usage/sessions/subscriptions
- OpenAI Realtime session minting endpoint
- Razorpay one-time weekly order create + payment verification
- User preferences endpoint and one-active-session protection
- Metrics endpoint and unit tests
- Core `/v1` API surface for Android app

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install deps:
   - `npm install`
3. Run dev server:
   - `npm run dev`

## Cloud Run Deploy (MVP)

```bash
gcloud run deploy antar-backend \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated
```

## Endpoints

- `GET /health`
- `GET /v1/me`
- `POST /v1/realtime/session`
- `POST /v1/usage/ping`
- `POST /v1/usage/finish`
- `POST /v1/payments/weekly-order`
- `POST /v1/payments/weekly-verify`
- `POST /v1/razorpay/webhook`
- `POST /v1/feedback`
- `POST /v1/me/device-token`
- `PATCH /v1/me/preferences`
- `POST /v1/internal/jobs/daily-reminders`
- `DELETE /v1/me`

## Notes

- `POST /v1/razorpay/webhook` expects signature header `x-razorpay-signature`.
- Quotas are server-enforced using:
  - `TRIAL_TOTAL_SECONDS` (default `300`)
  - `PAID_DAILY_SECONDS` (default `600`)
- Run tests:
  - `npm test`
