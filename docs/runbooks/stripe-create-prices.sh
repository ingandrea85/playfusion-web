#!/usr/bin/env bash
# Create (idempotently) the Stripe TEST-mode Products + monthly Prices for
# PlayFusion Starter (€15/mo) and Club (€45/mo), then print their price ids.
#
# Usage (run in YOUR terminal so the key never enters a chat):
#   export STRIPE_SECRET_KEY=sk_test_xxx        # your TEST secret key
#   bash docs/runbooks/stripe-create-prices.sh
#
# Safe to re-run: it reuses an existing price found by lookup_key instead of
# creating duplicates. Refuses live keys.
set -euo pipefail
: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY (sk_test_...) in your shell first}"
case "$STRIPE_SECRET_KEY" in
  sk_test_*) ;;
  *) echo "Refusing: STRIPE_SECRET_KEY is not a TEST key (must start with sk_test_)"; exit 1;;
esac

API=https://api.stripe.com/v1
sk() { curl -fsS -u "$STRIPE_SECRET_KEY:" "$@"; }
pyget() { python3 -c 'import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$1"; }

create_tier() {
  local name="$1" amount="$2" lookup="$3"
  # Reuse an existing price by lookup_key if present (search is eventually consistent;
  # fine for a run-once setup).
  local existing
  existing=$(sk -G "$API/prices/search" --data-urlencode "query=lookup_key:'$lookup'" \
             | pyget "d['data'][0]['id'] if d.get('data') else ''")
  if [ -n "$existing" ]; then echo "$existing"; return; fi
  local prod
  prod=$(sk "$API/products" --data-urlencode "name=$name" | pyget "d['id']")
  sk "$API/prices" \
     -d "product=$prod" -d "unit_amount=$amount" -d "currency=eur" \
     -d "recurring[interval]=month" -d "lookup_key=$lookup" \
     --data-urlencode "nickname=$name monthly" | pyget "d['id']"
}

STARTER=$(create_tier "PlayFusion Starter" 1500 "starter-monthly-eur")
CLUB=$(create_tier "PlayFusion Club"    4500 "club-monthly-eur")

echo
echo "=== Paste these two into the conversation (they are NOT secret) ==="
echo "priceStarter: $STARTER"
echo "priceClub:    $CLUB"
