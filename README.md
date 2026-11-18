# SikaBridge

Student remittances between **Rwanda ↔ Ghana / Nigeria**, settled from prefunded
country pools. A student tops up a wallet with mobile money in their own country.
A local agent in the recipient's country then pays out of that country's pool, so
no money crosses a border per transfer.

| Folder | What |
| --- | --- |
| [`backend/`](backend) | FastAPI + SQLAlchemy 2 API with a double-entry ledger |
| [`frontend/`](frontend) | React PWA (see its own README) |

## Backend quick start (Windows PowerShell)

```powershell
cd backend
py -m venv .venv                # Python 3.11+
.\.venv\Scripts\Activate.ps1    # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt

python -m pytest -q             # run the tests
python -m app.seed              # create demo users + fund pools (safe to re-run)
uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/docs for the interactive API.

On macOS/Linux use `python3 -m venv .venv` and `source .venv/bin/activate`.

### Configuration (environment variables)

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./sikabridge.db` | Any SQLAlchemy URL |
| `JWT_SECRET` | dev value | **Set in production** (32+ bytes) |
| `JWT_TTL_MINUTES` | `720` | |
| `WEBHOOK_SECRET` | `dev-webhook-secret` | Must match the `X-Webhook-Secret` header on `/webhooks/momo` |
| `PBKDF2_ITERATIONS` | `600000` | |
| `QUOTE_TTL_SECONDS` | `600` | Quote lock (10 min) |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated |

PowerShell example: `$env:WEBHOOK_SECRET = "something-long"` before `uvicorn ...`.

### Seed accounts (password `Password123!`)

| Role | Phone |
| --- | --- |
| admin | `+250788000000` |
| agent RW | `+250788000001` |
| agent GH | `+233240000001` |
| agent NG | `+2348030000001` |
| student RW (KYC verified) | `+250788000010` |

Pools are prefunded with RW 5,000,000 RWF, GH 50,000.00 GHS and NG 5,000,000.00 NGN.

## How money works

* **Integer minor units everywhere.** RWF has exponent 0, GHS and NGN have 2. The API
  accepts and returns amounts as **decimal strings** (`"1042.40"`). No floats anywhere.
* **Double-entry ledger** (`app/ledger.py`): `Account(code, currency)`, `JournalTxn`,
  `Entry(amount)` with `+` = debit and `-` = credit. Every journal must sum to zero per
  currency, otherwise it is rejected. Every journal has a unique idempotency key.

| Account | Meaning |
| --- | --- |
| `pool:{CC}` | Our cash in country CC (asset) |
| `payable:{CC}` | Owed to recipients in CC, not yet paid out |
| `wallet:{uid}` | Student wallet balance (we owe it) |
| `fees:{CUR}` | Fee income |
| `fx:{CUR}` | FX position per currency |
| `equity:{CUR}` | Pool prefunding by the business |

### Flows and journals

| Step | Journal |
| --- | --- |
| Deposit confirmed (`POST /webhooks/momo`, idempotent) | `+pool:{user CC}`, `-wallet` |
| Transfer created (`POST /transfers`) | `+wallet send`, `-fees fee`, `-fx:{send} net`, `+fx:{recv} receive`, `-payable:{recv CC} receive` |
| Agent completes payout | `+payable`, `-pool` |
| Agent fails payout | Exact reversal of the transfer journal (fee included), status `REFUNDED` |
| Admin funds a pool | `+pool`, `-equity` |

### Pricing (`app/fx.py`)

* Fee = max(1.5% of the send amount rounded **up**, minimum fee). The minimum is 300 RWF or 3.00 GHS.
  The fee is taken out of the send amount.
* Rate = mid × (1 − 1% spread), rounded **down** to 8 dp. The placeholder USD mids are
  RWF 1450, GHS 15.50 and NGN 1550.
* Amount received = (send − fee) × rate, rounded **down** to the recipient currency.
* Quotes are locked for 10 minutes and can be used once.
* Corridors: RW→GH, GH→RW and RW→NG are on. **NG→RW is disabled** (Nigerian IMTO outbound
  rules).

### Transfer rules

`POST /transfers` requires all of the following, in this order:

1. `kyc_status = verified`, otherwise **403** `kyc_pending`.
2. An unused, unexpired quote that belongs to the user.
3. An enabled corridor, otherwise **400** `corridor_unavailable`.
4. A large enough wallet balance, otherwise **400** `insufficient_funds`.
5. Enough available in the destination pool (`pool − payable ≥ receive`), otherwise
   **503** `pool_unavailable`.

Statuses: `PAYOUT_PENDING → IN_PROGRESS → PAID`, or `→ REFUNDED`.

### Errors

Domain errors return `{"detail": {"code": "...", "message": "..."}}`. Request
validation errors are FastAPI's standard 422 response.

## API summary

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | public |
| GET | `/auth/me` | any |
| GET | `/corridors` | public |
| GET | `/wallet` | any |
| POST/GET | `/deposits`, `/deposits/{id}` | student |
| POST | `/webhooks/momo` (header `X-Webhook-Secret`) | MoMo |
| POST | `/quotes` | student |
| POST/GET | `/transfers`, `/transfers/{id}` | student |
| GET | `/agent/payouts` | agent (own country) |
| POST | `/agent/payouts/{id}/claim`, `/complete`, `/fail` | agent |
| GET | `/admin/pools`, `/admin/users?kyc_status=pending`, `/admin/ledger/check` | admin |
| POST | `/admin/pools/fund` (optional `Idempotency-Key`), `/admin/users/{id}/verify-kyc` | admin |

## Concurrency note

SQLite connections open every transaction with `BEGIN IMMEDIATE`, so a balance
check and the journal posted after it can't interleave with another write. On
Postgres, the transfer path takes `SELECT … FOR UPDATE` on the accounts it touches.
Status changes (claim, complete, fail, quote use, webhook) are conditional
`UPDATE … WHERE status = …`, so a second concurrent attempt gets 409 or a no-op.
