#!/bin/bash

# Verification script for Finance PoC Skills
BASE_URL="http://localhost:8000"
TENANT="finsecure-ai.com"

echo "🧪 Verifying Finance PoC Skills..."
echo ""

# Test 1: Bank Reconciliation
echo "1️⃣  Testing bank-recon-sync skill..."
curl -X POST "$BASE_URL/api/v1/skills/bank-recon-sync" \
  -H "Host: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000002",
    "recon_period": "2024-02",
    "bank_feed": [
      { "id": "bank_tx_101", "amount": 150.00, "date": "2024-02-01", "description": "Software Subscription" },
      { "id": "bank_tx_102", "amount": 99.99, "date": "2024-02-05", "description": "Office Supplies" }
    ]
  }' | jq '.'

echo ""
echo "------------------------------------------------"

# Test 2: Verify vertical-specific isolation (Should FAIL if calling healthcare tenant)
echo "2️⃣  Verifying vertical-specific isolation (Expected to fail if wrong tenant context)..."
curl -X POST "$BASE_URL/api/v1/skills/bank-recon-sync" \
  -H "Host: mediguard-ai.com" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "bank_feed": []
  }' | jq '.'

echo ""
echo "✅ Finance Verification complete!"
