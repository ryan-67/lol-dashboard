# stripe-sync

Authenticated fallback that pulls active Stripe subscriptions into `subscriptions` + `profiles` when the webhook is delayed or missed.

Called from the nuckyAI paywall on load, after checkout success (`session_id`), and before starting a new checkout.

Deploy with `stripe-webhook` and `stripe-checkout` after billing changes:

```bash
npx supabase functions deploy stripe-sync stripe-webhook stripe-checkout --no-verify-jwt
```

(`stripe-webhook` must remain JWT-disabled for Stripe event delivery.)
