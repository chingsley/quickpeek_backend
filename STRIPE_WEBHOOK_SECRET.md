# Commands for .env.example

_Exported on 01/08/2026 at 21:12:52 GMT-3 from Cursor (3.9.8)_

---

**User**

@.env.example (40-43) provide all the commands in order to be run to complete this task

---

**Cursor**

I'll read the full `.env.example` and any related Stripe webhook setup so I can list the exact commands in order.

Here are the commands to run **in order** to set up `STRIPE_WEBHOOK_SECRET` for local dev (macOS), per `.env.example` lines 40–43.

### 1. Install Stripe CLI (one-time)

```bash
brew install stripe/stripe-cli/stripe
```

### 2. Log in to Stripe (one-time per machine)

```bash
stripe login
```

Ouput:

```bash
> Done! The Stripe CLI is configured for your account with account id acct_1FAIDyIsLlSTtAVi
Please note: this key will expire after 90 days, at which point you'll need to re-authenticate.
```

This opens a browser to link the CLI to your Stripe account.

### 3. Create backend `.env` (if you don’t have one yet)

```bash
cd /Users/kingsleyeneja/study_projects/my-apps/quickpeek/quickpeek_backend
cp .env.example .env
```

### 4. Add Stripe API keys from the dashboard

Get test keys from [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys), then set them in `quickpeek_backend/.env`:

```bash
# Edit .env and set:
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_PUBLISHABLE_KEY=pk_test_...
```

(Optional but needed for payments in the app — same publishable key in the frontend):

```bash
cd /Users/kingsleyeneja/study_projects/my-apps/quickpeek/quickpeek_frontend
cp .env.example .env
# Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (same pk_test as backend)
```

### 5. Start the backend (must be running on port 3000)

In one terminal:

```bash
cd /Users/kingsleyeneja/study_projects/my-apps/quickpeek/quickpeek_backend
npm run dev
```

### 6. Start Stripe webhook forwarding (new terminal)

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhooks/stripe
```

The CLI prints something like:

```text
Ready! Your webhook signing secret is whsec_xxxxxxxx (^C to quit)
```

### 7. Copy the webhook secret into `.env`

In `quickpeek_backend/.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
```

Paste the exact `whsec_...` from the `stripe listen` output.

### 8. Restart the backend

Stop and start `npm run dev` again so it picks up the new `STRIPE_WEBHOOK_SECRET`.

---

**Important notes**

- Keep `stripe listen` running while testing payments; the `whsec_...` value changes each time you start a new `stripe listen` session.
- You need **three terminals** for full local payment testing:
  1. Backend (`npm run dev`)
  2. Stripe CLI (`stripe listen ...`)
  3. Frontend (`npm run start:tunnel:clear` or your usual Expo command)

**Optional: verify webhooks are reaching the API**

With `stripe listen` still running:

```bash
stripe trigger payment_intent.succeeded
```

You should see the event forwarded in the `stripe listen` terminal and handled by your backend.
