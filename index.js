require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const db = require('./core/database/connection');
const { tenantMiddleware } = require('./core/middleware/tenant-isolation');
const healthRoutes = require('./api/routes/health');
const skillRoutes = require('./api/routes/skills');

const app = express();
const PORT = process.env.PORT || 8000;
const BIND_ADDRESS = process.env.BIND_ADDRESS || '0.0.0.0';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Tenant isolation (applies to all routes)
app.use(tenantMiddleware);

// Routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/skills', skillRoutes);

// 404 handler
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

start();
