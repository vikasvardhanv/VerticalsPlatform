# Multi-Vertical AI Platform

## Overview
This platform powers 5 security-first AI verticals for regulated industries, built using architectural patterns inspired by OpenClaw but as a completely independent codebase.

## Verticals

1. **MediGuard AI** (Healthcare) - HIPAA-compliant AI for healthcare automation
2. **FinSecure AI** (Finance/CA Firms) - Audit-ready AI for financial services
3. **DevShield AI** (Enterprise) - Enterprise-grade AI automation
4. **LegalVault AI** (Legal) - Attorney-client privilege protection
5. **DataForge AI** (Data Engineering) - AI co-pilot for data teams

## Architecture Philosophy (Inspired by OpenClaw)

We study OpenClaw's architecture for:
- **Multi-channel messaging patterns** (Telegram, WhatsApp, Discord integration)
- **Gateway architecture** for message routing
- **Plugin system** for extensible skills
- **CLI-first design** for developer experience
- **Security-by-default** patterns

But we build our own:
- **Multi-tenant isolation** at the database level
- **Industry-specific compliance** (HIPAA, SOX, GDPR)
- **Vertical-specific skills** (not generic messaging)
- **SaaS deployment model** via Coolify
- **Usage-based billing** and subscription management

## Technology Stack

### Backend
- **Runtime**: Node.js 22+
- **Framework**: Express.js
- **Database**: PostgreSQL 14+ with Row-Level Security (RLS)
- **Caching**: Redis
- **Encryption**: AES-256-GCM (at rest), TLS 1.3 (in transit)

### Frontend
- **Landing Pages**: HTML + Tailwind CSS (static)
- **Dashboard**: React + shadcn/ui (future phase)

### Infrastructure
- **Deployment**: Coolify (self-hosted PaaS)
- **Hosting**: Hetzner VPS / DigitalOcean
- **DNS/CDN**: Cloudflare
- **Monitoring**: Sentry (errors), Posthog (analytics)

### Payments
- **Primary**: Stripe (subscriptions)
- **Email**: Resend.com

## Security Architecture

### Global Security Baseline (All Verticals)
- ✅ Multi-tenant isolation (tenant_id + RLS)
- ✅ AES-256-GCM encryption at rest
- ✅ TLS 1.3 in transit
- ✅ DLP scanning (pre-storage, pre-external-call)
- ✅ PostgreSQL audit logs
- ✅ Role-based access control (RBAC)
- ✅ Rate limiting (per tenant, per user, per IP)
- ✅ Security headers (CSP, HSTS, X-Frame-Options)
- ✅ Secrets via environment variables only

### Vertical-Specific Compliance
- **Healthcare**: HIPAA, HITECH
- **Finance**: SOX, PCI-DSS (if processing payments)
- **Legal**: Attorney-client privilege, retention policies
- **Data**: GDPR, CCPA

## Directory Structure

```
platform/
├── core/                  # Shared core services
│   ├── middleware/        # Tenant isolation, auth, rate limiting
│   ├── database/          # DB connection, migrations, models
│   └── utils/             # Shared utilities
├── security/              # Security layer
│   ├── encryption/        # AES-256-GCM encryption service
│   ├── audit/             # Audit logging
│   ├── dlp/               # Data Loss Prevention scanner
│   └── rbac/              # Role-based access control
├── verticals/             # Industry-specific implementations
│   ├── healthcare/        # MediGuard AI
│   │   └── skills/        # Healthcare-specific skills
│   ├── finance/           # FinSecure AI
│   ├── enterprise/        # DevShield AI
│   ├── legal/             # LegalVault AI
│   └── data/              # DataForge AI
├── api/                   # API layer
│   ├── routes/            # Express routes
│   ├── controllers/       # Business logic
│   └── validators/        # Input validation
├── landing-pages/         # Marketing pages for each vertical
├── infrastructure/        # Deployment configs
│   ├── coolify/           # Coolify deployment specs
│   └── docker/            # Dockerfiles
└── README.md
```

## Skill Contract

Every skill across all verticals must implement:

```javascript
module.exports = {
  name: 'skill-name',
  description: 'What this skill does',
  vertical: 'healthcare|finance|enterprise|legal|data',
  tier: 1, // 1 = core, 2 = advanced, 3 = intelligence

  inputSchema: {
    // JSON Schema for input validation
  },

  outputSchema: {
    // JSON Schema for output structure
  },

  async execute(context) {
    // 1. Validate input against schema
    // 2. Run DLP pre-check
    // 3. Log audit event START
    // 4. Execute skill logic
    // 5. Log audit event END/ERROR
    // 6. Return structured JSON
  }
};
```

## 72-Hour Launch Plan

### Day 1 (Friday) - Infrastructure + Core
- ✅ Coolify setup on VPS
- ✅ Fork/study OpenClaw patterns
- ✅ Build security layer (encryption, DLP, audit)
- ✅ Multi-tenant architecture
- ✅ Deploy to Coolify

### Day 2 (Saturday) - Skills + Landing Pages
- ✅ Build Tier 1 skills for each vertical
- ✅ Create landing pages (5 verticals)
- ✅ Payment integration (Stripe)

### Day 3 (Sunday) - Testing + Launch
- ✅ Security testing
- ✅ End-to-end testing
- ✅ Demo videos
- ✅ Product Hunt launch
- ✅ LinkedIn campaign
- ✅ Direct outreach (50 emails)

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run security scan
npm run security:scan

# Build for production
npm run build

# Deploy to Coolify
git push coolify main
```

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/platform
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50

# Encryption
ENCRYPTION_KEY_ID=your-kms-key-id
MASTER_ENCRYPTION_KEY=your-256-bit-key-in-hex

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Security
RATE_LIMIT_WINDOW=60s
RATE_LIMIT_MAX_REQUESTS=100
ALLOWED_ORIGINS=https://mediguard-ai.com,https://finsecure-ai.com

# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
RESEND_API_KEY=re_...

# Monitoring
SENTRY_DSN=https://...
POSTHOG_API_KEY=phc_...
```

## How We Use OpenClaw as Reference

### What We Study
1. **Message Routing Architecture** (`src/routing/`, `src/gateway/`)
   - Multi-channel pattern for handling different input sources
   - Gateway-based message processing
   - Adapter pattern for channel abstraction

2. **Plugin System** (`extensions/`, `src/plugin-sdk/`)
   - Dynamic skill loading mechanism
   - Plugin lifecycle management
   - Dependency injection patterns

3. **Security Patterns** (`src/security/`)
   - Encryption key management
   - Audit trail implementation
   - Access control patterns

4. **CLI Design** (`src/cli/`, `src/commands/`)
   - Command structure and help text
   - Progress indicators and user feedback
   - Configuration management

### What We Build Differently
1. **SaaS-First**: Multi-tenant from day one (OpenClaw is self-hosted)
2. **Industry Verticals**: Specialized compliance per vertical
3. **Skills vs Channels**: Focus on task automation, not messaging
4. **Web Dashboard**: React dashboard for non-technical users
5. **Subscription Billing**: Stripe integration for MRR

## References

- OpenClaw Repository: https://github.com/openclaw/openclaw
- MediGuard AI Skills Spec: `../verticals/healthcare/SKILLS.md`
- HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/
- Coolify Docs: https://coolify.io/docs

## Next Steps

1. Initialize Node.js project with dependencies
2. Build core security layer (encryption, DLP, audit)
3. Create database schema with RLS policies
4. Implement multi-tenant middleware
5. Build first skill (healthcare: phi-redact)
6. Create landing page for MediGuard AI
7. Deploy to Coolify
8. Launch! 🚀
