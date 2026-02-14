const { Pool } = require('pg');

class Database {
  constructor() {
    const redactUrl = (rawUrl) => {
      if (!rawUrl) return 'missing';
      try {
        const parsed = new URL(rawUrl);
        if (parsed.password) {
          parsed.password = '****';
        }
        return parsed.toString();
      } catch (error) {
        return 'invalid';
      }
    };

    const sslMode = (process.env.DATABASE_SSL || process.env.PGSSLMODE || '').toLowerCase();
    const disableSsl = ['disable', 'disabled', 'false', '0', 'no'].includes(sslMode);
    const forceSsl = ['require', 'true', '1', 'yes'].includes(sslMode);
    const sslEnabled = disableSsl ? false : (forceSsl || process.env.NODE_ENV === 'production');

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      min: parseInt(process.env.DATABASE_POOL_MIN) || 10,
      max: parseInt(process.env.DATABASE_POOL_MAX) || 50,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,  // 10s default
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,              // 30s default
      query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 15000,                 // 15s default
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 15000          // 15s default
    });

    if (process.env.LOG_LEVEL === 'debug') {
      console.log('DB init', {
        url: redactUrl(process.env.DATABASE_URL),
        sslMode: sslMode || 'default',
        sslEnabled,
        nodeEnv: process.env.NODE_ENV || 'development'
      });
    }

    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('Query executed', { duration, rows: result.rowCount });
      }
      return result;
    } catch (error) {
      console.error('Database query error:', error.message);
      throw error;
    }
  }

  async setTenantContext(tenantId) {
    await this.query('SELECT set_tenant_context($1)', [tenantId]);
  }

  async close() {
    await this.pool.end();
  }

  async testConnection() {
    try {
      const result = await this.query('SELECT NOW() as time');
      console.log('✅ Database connected:', result.rows[0].time);
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: process.env.LOG_LEVEL === 'debug' ? error.stack : undefined
      });
      return false;
    }
  }
}

module.exports = new Database();
