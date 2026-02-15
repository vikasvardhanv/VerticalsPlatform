require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./core/database/connection');
const { tenantMiddleware } = require('./core/middleware/tenant-isolation');
const healthRoutes = require('./api/routes/health');
const skillRoutes = require('./api/routes/skills');
const chatRoutes = require('./api/routes/chat');
const authRoutes = require('./api/routes/auth');
const documentRoutes = require('./api/routes/documents');
const profileRoutes = require('./api/routes/profiles');
const exportsRoutes = require('./api/routes/exports');

// Security services for injection
const dlpScanner = require('./security/dlp/scanner');
const auditLogger = require('./security/audit/logger');

// Initialize security services
const dlp = new dlpScanner({ strictMode: process.env.DLP_STRICT_MODE === 'true' });
const audit = new auditLogger({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_SSL === 'true' || process.env.NODE_ENV === 'production')
    ? { rejectUnauthorized: false }
    : false
});

const app = express();
const PORT = process.env.PORT || 8000;
const BIND_ADDRESS = process.env.BIND_ADDRESS || '0.0.0.0';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.LOG_LEVEL === 'debug') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[REQ] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

// Landing pages (public, no tenant required)
const landingRoot = path.join(__dirname, 'landing-pages');
app.use('/assets', express.static(path.join(landingRoot, 'assets')));

const landingRoutes = {
  '/healthcare': 'healthcare/index.html',
  '/finance': 'finance/index.html',
  '/enterprise': 'enterprise/index.html',
  '/legal': 'legal/index.html',
  '/data': 'data/index.html'
};

app.get(Object.keys(landingRoutes), (req, res) => {
  const filePath = landingRoutes[req.path];
  return res.sendFile(path.join(landingRoot, filePath));
});

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Tenant isolation (applies to all routes)
app.use(tenantMiddleware);

// Inject security services into request
app.use((req, res, next) => {
  req.dlp = dlp;
  req.audit = audit;
  req.db = db;

  // Debug route for Vercel paths
  app.get('/api/v1/debug-path', (req, res) => {
    const paths = [
      { label: 'cwd', path: process.cwd() },
      { label: 'dirname', path: __dirname },
      { label: 'publicExists', path: fs.existsSync(path.join(process.cwd(), 'public')) },
      { label: 'publicFilesDist', path: fs.existsSync(path.join(__dirname, 'public')) ? fs.readdirSync(path.join(__dirname, 'public')) : 'not found' },
      { label: 'distExists', path: fs.existsSync(path.join(__dirname, 'dashboard/dist')) },
      { label: 'rootContents', path: fs.readdirSync(process.cwd()) },
      { label: 'dirnameContents', path: fs.readdirSync(__dirname) }
    ];
    res.json({ success: true, paths });
  });

  // Dynamic vertical override via header (demo functionality)
  const verticalOverride = req.header('X-Vertical');

  if (verticalOverride && req.tenant) {
    req.tenant.vertical = verticalOverride;
    req.tenant.name = verticalOverride === 'healthcare' ? 'MediGuard AI' : 'FinSecure AI';
    // Ensure all demo features are enabled when switching
    req.tenant.features = ['pci_redaction', 'sox_compliance', 'phi_detection', 'hipaa'];
  } else if (!req.tenant) {
    // Fallback for development if tenantMiddleware didn't pick up a host
    const vertical = verticalOverride || 'finance';
    req.tenantId = '00000000-0000-0000-0000-000000000002';
    req.tenant = {
      id: '00000000-0000-0000-0000-000000000002',
      name: vertical === 'healthcare' ? 'MediGuard AI' : 'FinSecure AI',
      vertical: vertical,
      features: ['pci_redaction', 'sox_compliance', 'phi_detection', 'hipaa'],
      compliance: ['SOX', 'PCI-DSS', 'HIPAA'],
      dlpStrictMode: false
    };
  }
  next();
});

// Routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/skills', skillRoutes);
app.use('/api/v1/exports', exportsRoutes);

// Serve dashboard (React app) - Served from root public folder in production
const dashboardPath = path.join(__dirname, 'public');
app.use(express.static(dashboardPath));

// Catch-all route for React Router (must be after API routes, before 404)
// This serves index.html for any non-API route so React Router can handle it
app.get('*', (req, res, next) => {
  // Only serve React app for non-API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

// 404 handler (only reaches here for API routes that don't exist)
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);

  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    error: err.code || 'INTERNAL_ERROR',
    message,
    tenant: req.tenant?.id,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server gracefully...');
  await db.close();
  process.exit(0);
});

// Start server
async function start() {
  try {
    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    app.listen(PORT, BIND_ADDRESS, () => {
      console.log('🚀 Multi-Vertical AI Platform');
      console.log(`📍 Server running on ${BIND_ADDRESS}:${PORT}`);
      console.log(`🏥 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔐 Security: Encryption ✓ | DLP ✓ | Audit ✓ | RBAC ✓`);
      console.log(`\nConfigured Verticals:`);
      console.log(`  - MediGuard AI (Healthcare)`);
      console.log(`  - FinSecure AI (Finance)`);
      console.log(`  - DevShield AI (Enterprise)`);
      console.log(`  - LegalVault AI (Legal)`);
      console.log(`  - DataForge AI (Data)\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Export app for serverless use
module.exports = app;

if (require.main === module) {
  start();
}
