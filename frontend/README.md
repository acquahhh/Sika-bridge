# SikaBridge frontend

A mobile-first PWA for SikaBridge: React 19, Vite, Tailwind CSS 4 and React Router.
It talks to the FastAPI backend in [`../backend`](../backend).

## Run it (Windows PowerShell)

Start the backend in one terminal. The full steps are in the [root README](../README.md).

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

Start the frontend in a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local   # then edit if needed
npm run dev
```

Open http://127.0.0.1:5173.

Production build:

```powershell
npm run build      # outputs to dist\
npm run preview    # serves dist\ on http://127.0.0.1:4173
```

To try the build on a phone on the same Wi-Fi, run `npm run dev -- --host 0.0.0.0`.
Then set `VITE_API_URL` to `http://<your-PC-IP>:8000`, start uvicorn with `--host 0.0.0.0`,
and add the frontend origin to the backend's `CORS_ORIGINS`.

## Configuration

Vite reads these from `.env.local`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://127.0.0.1:8000` | Backend base URL |
| `VITE_WEBHOOK_SECRET` | *(unset)* | **Dev only.** Shows the "Simulate MoMo confirmation" button on Top up. It must match the backend `WEBHOOK_SECRET` (default `dev-webhook-secret`). |

The secret is only read behind `import.meta.env.DEV`, so `npm run build` drops it
from the production bundle even when it is set. Still, don't set it on a build server.

In PowerShell you can also set a variable for one session, e.g.
`$env:VITE_API_URL = "http://192.168.1.20:8000"; npm run dev`.

## Demo logins (from `python -m app.seed`)

The password for all of them is `Password123!`.

| Who | Phone | Lands on |
| --- | --- | --- |
| Student, Rwanda, KYC verified | `+250788000010` | `/home` |
| Agent Ghana | `+233240000001` | `/agent` |
| Agent Rwanda / Nigeria | `+250788000001` / `+2348030000001` | `/agent` |
| Admin | `+250788000000` | `/admin` |

A walkthrough of the whole flow:

1. Log in as the student. Top up 150000, then tap **Simulate MoMo confirmation**.
2. Send 100000 RWF to Ghana. The recipient gets GHS 1,042.40.
3. Log in as the Ghana agent. Claim the payout and complete it with a reference.
4. Log in as the admin. Check the pools, then run the ledger check.

## Screens

* **Students:** register/login, Home (balance, Top up, Send, recent transfers),
  Top up (MoMo request, polls until confirmed), Send (country → amount → quote with
  a 10-minute countdown → recipient → MoMo or bank), History with status filters,
  and transfer detail.
* **Agents:** the payout queue for their country. They can claim, mark as paid with a
  reference, or fail with a reason (the sender is refunded).
* **Admins:** pool balances (cash, owed, available) and fees, prefunding a pool, the
  ledger check, and KYC verification by user ID or from the pending list.

After login, `GET /auth/me` decides where each role goes, and every route is guarded by role.

## How it handles money and errors

* **No floats.** Amounts stay as the decimal strings the API sends. `src/lib/money.js`
  formats them by string manipulation (`"1042.4"` → `GHS 1,042.40`). The only
  comparison, wallet balance against send amount, uses `BigInt` minor units.
* **Errors.** API errors look like `{detail: {code, message}}`. `src/lib/errors.js`
  maps them to friendly alerts:
  * `kyc_pending` (403) shows "Identity check pending". The Send button is also
    disabled ahead of time for unverified users.
  * `corridor_unavailable` (400) shows the backend's reason, e.g. Nigerian IMTO rules.
  * `pool_unavailable` (503) shows "Temporarily unavailable".
  * Expired or used quotes ask for a fresh quote. Network failures show an offline message.
* **Auth.** The JWT is kept in memory and mirrored to `sessionStorage`. It survives a
  reload but is gone when the tab closes. A 401 logs you out and explains why.

## PWA

* `public/manifest.webmanifest` sets standalone display and the theme colour, and lists
  192/512 icons plus a maskable icon. `index.html` adds the Apple touch icon.
* `public/sw.js` is registered in production builds only. It caches the app shell and
  hashed assets so the app installs and opens offline. API responses are never cached.
* The icons in `public/icons/` are generated from `favicon.svg`. To regenerate them after
  editing the SVG:

  ```powershell
  npm install --no-save playwright
  npx playwright install chromium
  npm run icons
  ```

## Layout

```
src/
  api/client.js       fetch wrapper, token storage, ApiError
  api/endpoints.js    one function per backend endpoint
  auth/AuthContext.jsx
  components/         UI primitives, Layout, StatusBadge, TransferListItem
  lib/                money, countries/phones, errors, useLoad, useCountdown
  pages/              AuthPages, student/*, agent/*, admin/*
```
