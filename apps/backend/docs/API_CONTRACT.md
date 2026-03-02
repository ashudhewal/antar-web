# Antar Backend API Contract (MVP)

## Auth

All `/v1/*` endpoints except `/v1/razorpay/webhook` and `/v1/internal/jobs/daily-reminders` require:

`Authorization: Bearer <firebase_id_token>`

## Endpoints

### `GET /v1/me`
Returns user profile, entitlement state, and remaining usage values.

### `PATCH /v1/me/preferences`
Request:
```json
{
  "reminderEnabled": true,
  "saveTranscripts": false,
  "preferredLanguageMode": "hinglish",
  "timezone": "Asia/Kolkata"
}
```

### `POST /v1/realtime/session`
Request:
```json
{
  "deity": "krishna",
  "languageMode": "hinglish"
}
```
Headers:
- `x-device-id: <stable-device-id>` (recommended for abuse control)

Response includes:
- `sessionId`
- `clientSecret` (OpenAI ephemeral)
- `hardStopAt`
- `secondsAllowed`

### `POST /v1/usage/ping`
Heartbeat during active session.

### `POST /v1/usage/finish`
Final usage commit.

### `POST /v1/payments/weekly-order`
Creates Razorpay order for one-time weekly payment (`INR 100`).

### `POST /v1/payments/weekly-verify`
Verifies Razorpay payment signature and unlocks 7 days of paid access.

### `POST /v1/razorpay/webhook`
Verifies signature and updates entitlement/subscription records idempotently.

### `POST /v1/feedback`
Stores post-session feedback.

### `POST /v1/me/device-token`
Saves FCM device token.

### `DELETE /v1/me`
Creates data deletion request.

### `POST /v1/internal/jobs/daily-reminders`
Protected by `x-internal-token` header.

Request:
```json
{
  "userIds": ["uid_1", "uid_2"]
}
```
