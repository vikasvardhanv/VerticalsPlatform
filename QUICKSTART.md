# Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Option 1: Local Development

```bash
# 1. Setup environment and install dependencies
./scripts/setup.sh

# 2. Start PostgreSQL (if not using Docker)
# brew install postgresql@14  # macOS
# sudo systemctl start postgresql  # Linux

# 3. Create database
createdb platform_dev

# 4. Run migrations
npm run migrate

# 5. Start development server
npm run dev
```

Server runs at `http://localhost:8000`

### Option 2: Docker (Recommended)

```bash
# 1. Setup environment
./scripts/setup.sh

# 2. Start all services
docker-compose up -d

# 3. Run migrations
docker-compose exec app node core/database/migrate.js

# 4. Check logs
docker-compose logs -f app
```

### Option 3: Production Deployment (Coolify)

1. **Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

2. **Setup Coolify**
   - Create new project
   - Connect GitHub repo
   - Set environment variables (see below)
   - Add domains for each vertical
   - Deploy!

3. **Required Environment Variables in Coolify**
```bash
MASTER_ENCRYPTION_KEY=<64-char-hex>
JWT_SECRET=<128-char-hex>
POSTGRES_PASSWORD=<random-password>
REDIS_PASSWORD=<random-password>
ALLOWED_ORIGINS=https://mediguard-ai.com,https://finsecure-ai.com
NODE_ENV=production
```

Generate keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # MASTER_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"  # JWT_SECRET
```

## 🧪 Test the API

### Health Check
```bash
curl http://localhost:8000/api/v1/health -H "Host: mediguard-ai.com"
```

### List Skills
```bash
curl http://localhost:8000/api/v1/skills -H "Host: mediguard-ai.com"
```

### Execute PHI Redaction Skill
```bash
curl -X POST http://localhost:8000/api/v1/skills/phi-redact \
  -H "Host: mediguard-ai.com" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Patient SSN: 555-12-3456, MRN: ABC123",
    "redaction_strategy": "mask",
    "tenant_id": "00000000-0000-0000-0000-000000000001"
  }'
```

### Run All Skill Tests
```bash
./scripts/test-skills.sh
```

## 📁 Project Structure

```
platform/
├── index.js                    # Main server
├── package.json               # Dependencies
├── Dockerfile                 # Docker image
├── docker-compose.yml         # Multi-container setup
├── core/
│   ├── database/              # DB connection & migrations
│   └── middleware/            # Tenant isolation
├── security/
│   ├── encryption/            # AES-256 encryption
│   ├── dlp/                   # Data Loss Prevention
│   ├── audit/                 # Audit logging
│   └── rbac/                  # Role-based access
├── api/
│   └── routes/                # API endpoints
├── verticals/
│   └── healthcare/
│       └── skills/            # Healthcare skills
└── scripts/                   # Deployment scripts
```

## 🏥 Available Skills (Healthcare)

1. **phi-redact** - Redact PHI from text
2. **phi-validate** - Validate HIPAA compliance
3. **patient-intake** - Process intake forms
4. **appointment-schedule** - Manage appointments
5. **prescription-generate** - Create prescriptions

## 🎯 Next Steps

1. **Add More Skills**: Create new skills in `verticals/{vertical}/skills/`
2. **Build Landing Pages**: Use HTML template from `72HR-BLITZ-GUIDE.md`
3. **Setup Payment**: Integrate Stripe (see guide)
4. **Marketing**: Launch on Product Hunt, LinkedIn
5. **Get First Customer**: Target healthcare clinics via your network

## 🆘 Troubleshooting

**Database connection failed?**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Run migrations: `npm run migrate`

**Skills returning errors?**
- Check `MASTER_ENCRYPTION_KEY` is set (64-char hex)
- Verify tenant_id in request matches database
- Check logs: `docker-compose logs app`

**Port already in use?**
- Change `PORT` in `.env`
- Or stop conflicting service: `lsof -ti:8000 | xargs kill`

## 📚 Documentation

- [README.md](README.md) - Architecture overview
- [72HR-BLITZ-GUIDE.md](72HR-BLITZ-GUIDE.md) - Complete implementation guide
- [verticals/healthcare/SKILLS.md](../verticals/healthcare/SKILLS.md) - Skills specification

## 💬 Support

Issues? Questions? Open a GitHub issue or reach out!
