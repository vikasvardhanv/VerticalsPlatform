#!/bin/bash

# Verification script for Healthcare PoC Skills
BASE_URL="http://localhost:8000"
TENANT="mediguard-ai.com"

echo "🧪 Verifying Healthcare PoC Skills..."
echo ""

# Test 1: Clinical Notes (Doc Convo)
echo "1️⃣  Testing clinical-notes skill (Doc Convo)..."
curl -X POST "$BASE_URL/api/v1/skills/clinical-notes" \
  -H "Host: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Patient John Doe visited complaining of chest pain. BP was 140/90. MRN: 123456. Suggested follow-up in 2 weeks.",
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  }' | jq '.'

echo ""
echo "------------------------------------------------"

# Test 2: Prior Authorization
echo "2️⃣  Testing prior-auth skill..."
curl -X POST "$BASE_URL/api/v1/skills/prior-auth" \
  -H "Host: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "11111111-1111-1111-1111-111111111111",
    "clinical_data": {
      "diagnosis": "Severe Hypertension",
      "codes": ["I10"],
      "medications": ["Lisinopril 10mg"]
    },
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  }' | jq '.'

echo ""
echo "------------------------------------------------"

# Test 3: Verify security baseline (DLP scan for PHI)
echo "3️⃣  Verifying security baseline (DLP scan)..."
curl -X POST "$BASE_URL/api/v1/skills/phi-validate" \
  -H "Host: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Patient Jane Smith, SSH: 555-12-3456",
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  }' | jq '.'

echo ""
echo "✅ Verification complete!"
