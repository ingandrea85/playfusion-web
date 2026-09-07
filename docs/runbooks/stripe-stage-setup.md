# Stripe (stage, test mode) — setup runbook

This runbook documents the bootstrap of Stripe integration on the `stage` environment in **test mode**.

## Prerequisites
- Access to the [Stripe TEST dashboard](https://dashboard.stripe.com)
- Admin access to the playfusion-web repo
- GitHub Actions secrets admin for the repo

## Setup Steps

### 1. Create Stripe Products and Prices (TEST mode)

In the Stripe TEST dashboard:

1. Navigate to **Products** → **Add product**.
2. Create a product named **"Starter"**:
   - Set **Price** to EUR 10/month (monthly billing).
   - Copy the `price_...` ID (e.g., `price_1ABC...`) to your clipboard.
3. In `infra/cdk/env/stg.json`, locate the placeholder `stripe.priceStarter` and replace it with the copied ID.
4. Repeat for a **"Club"** product at EUR 50/month, copying the `price_...` ID into `stripe.priceClub`.

**Result:** `infra/cdk/env/stg.json` now contains:
```json
{
  "stripe": {
    "priceStarter": "price_1ABC...",
    "priceClub": "price_1DEF..."
  }
}
```

### 2. Add Stripe Secret Key to GitHub Actions Secrets

1. In the Stripe TEST dashboard, navigate to **Developers** → **API keys**.
2. Copy the **Secret key** (starts with `sk_test_`).
3. In the GitHub repo settings, add a new Actions secret:
   - **Name:** `STRIPE_SECRET_KEY`
   - **Value:** `sk_test_...` (paste the copied key)
4. Save the secret.

### 3. Deploy Stage to Create the API Gateway

Deploy the stage environment using the authorized `stg-*` tag from the `stage` branch:

```bash
git tag stg-stripe-o11-bootstrap
git push origin stage --tags
```

Wait for the GitHub Actions `deploy-frontend.yml` and backend CloudFormation to complete.

**Important:** Note the deployed API Gateway base URL. You will need the webhook endpoint in the next step:
```
https://hnvcmo803a.execute-api.eu-south-1.amazonaws.com/prod/o11/webhooks/stripe
```
(This is an example; your actual URL will be in the CloudFormation outputs or CloudWatch logs.)

### 4. Register Stripe Webhook Endpoint

1. In the Stripe TEST dashboard, navigate to **Developers** → **Webhooks**.
2. Click **Add endpoint**.
3. Enter the webhook URL from step 3:
   ```
   https://<api-gateway-url>/prod/o11/webhooks/stripe
   ```
4. Select the following **Events to send:**
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Click **Add endpoint**.
6. In the webhook details, copy the **Signing secret** (starts with `whsec_`).

### 5. Add Stripe Webhook Secret to GitHub Actions Secrets

1. In the GitHub repo settings, add a new Actions secret:
   - **Name:** `STRIPE_WEBHOOK_SECRET`
   - **Value:** `whsec_...` (paste the copied signing secret)
2. Save the secret.
3. Trigger a redeploy of the stage environment:
   ```bash
   git tag stg-stripe-o11-webhooks
   git push origin stage --tags
   ```
   Wait for deployment to complete.

### 6. Verify Integration

1. In the app (stage, E1 Organizer Experience):
   - Log in and register a new Organization.
   - The app will provision a Stripe Customer + a **14-day Club trial** (no card required).
2. In the Stripe TEST dashboard:
   - Navigate to **Customers** and search for the Organization name.
   - Verify a subscription exists with `Status: trialing`.
3. In the E1 app:
   - Navigate to the Account section.
   - Verify the subscription is displayed as **TRIAL** / **Club**.

## Follow-up: Production Live Keys

Live Stripe keys (for `prod` environment) are **out of scope** for this setup and will be provisioned in a future follow-up. Live keys will be stored in **AWS Secrets Manager** instead of GitHub Actions secrets for improved security.

---

**Last updated:** 2026-09-06  
**Related:** [D-O11-3 — Stripe is the billing system of record](../../playfusion-blueprint/20-domain/bc/o11-billing.md)
