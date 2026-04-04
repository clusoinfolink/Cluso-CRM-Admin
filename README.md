# Cluso Admin (New Isolated Starter)

This app is intentionally isolated under `cluso-new-suite` so it does not clash with your current portals.

## Scope implemented
- Admin login only
- Issue company login IDs (enterprise accounts)
- Receive and view candidate verification requests
- Approve/reject requests

## Environment variables
Create `.env.local`:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_strong_secret
ADMIN_SETUP_KEY=one_time_setup_key
```

## First admin setup
Call `POST /api/setup` with JSON body:

```json
{
  "name": "Cluso Super Admin",
  "email": "admin@cluso.com",
  "password": "StrongPass123",
  "setupKey": "same_as_ADMIN_SETUP_KEY"
}
```

## Run
```bash
npm install
npm run dev
```
Runs on `http://localhost:3010`.
