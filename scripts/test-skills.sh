#!/bin/bash

# Test script for healthcare skills

BASE_URL="http://localhost:8000"
TENANT="mediguard-ai.com"

echo "🧪 Testing Healthcare Skills..."
echo ""

# Test 1: PHI Redaction
echo "1️⃣  Testing phi-redact skill..."
curl -X POST "$BASE_URL/api/v1/skills/phi-redact" \
  -H "Host: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Patient John Doe (MRN: 123456) visited on 2024-01-15. SSN: 555-12-3456.",
    "redaction_strategy": "mask",
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  }' | jq '.'

echo ""
echo ""

# Test 2: Patient Intake
echo "2️⃣  Testing patient-intake skill..."
curl -X POST "$BASE_URL/api/v1/skills/patient-intake" \
  -H "Host: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "form_data": {
      "name": "Jane Smith",
      "dob": "1985-03-22",
      "chief_complaint": "Persistent headaches",
      "medications": "Advil as needed",
      "allergies": "Penicillin"
    },
    "form_type": "new_patient",
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  }' | jq '.'

echo ""
echo ""

# Test 3: List available skills
echo "3️⃣  Listing available skills..."
curl -X GET "$BASE_URL/api/v1/skills" \
  -H "Host: $TENANT" | jq '.'

echo ""
echo "✅ Skill tests complete!"
