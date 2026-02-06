/**
 * Audit Logging Service
 * Provides comprehensive audit trail for compliance (HIPAA, SOX, etc.)
 */

const { Pool } = require('pg');

class AuditLogger {
  constructor(dbConfig) {
    this.pool = new Pool(dbConfig);
    this.tableName = 'audit_logs';
    this.initialized = false;
  }

  /**
   * Initialize audit log table
   */
  async init() {
    if (this.initialized) return;

    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          user_id UUID,
          session_id VARCHAR(100),

          -- Action details
          action VARCHAR(100) NOT NULL,
          resource_type VARCHAR(100),
          resource_id VARCHAR(255),
          skill_name VARCHAR(100),

          -- Request details
          ip_address INET,
          user_agent TEXT,
          request_method VARCHAR(10),
          request_path TEXT,
          request_body_hash VARCHAR(64),

          -- Response details
          response_status INTEGER,
          response_body_hash VARCHAR(64),
          duration_ms INTEGER,

          -- Security details
          dlp_findings JSONB DEFAULT '[]',
          phi_detected BOOLEAN DEFAULT FALSE,
          pii_detected BOOLEAN DEFAULT FALSE,

          -- Compliance metadata
          data_classification VARCHAR(50),
          retention_period VARCHAR(50),

          -- Error details
          error_message TEXT,
          error_stack TEXT,

          -- Timestamps
          created_at TIMESTAMPTZ DEFAULT NOW(),

          -- Indexes
          CONSTRAINT fk_tenant FOREIGN KEY (tenant_id)
            REFERENCES tenants(id) ON DELETE CASCADE
        );

        -- Performance indexes
        CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
          ON ${this.tableName}(tenant_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_audit_user_action
          ON ${this.tableName}(user_id, action) WHERE user_id IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_audit_skill_name
          ON ${this.tableName}(skill_name) WHERE skill_name IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_audit_phi_detected
          ON ${this.tableName}(phi_detected) WHERE phi_detected = TRUE;

        CREATE INDEX IF NOT EXISTS idx_audit_resource
          ON ${this.tableName}(resource_type, resource_id)
          WHERE resource_type IS NOT NULL;

        -- Compliance indexes
        CREATE INDEX IF NOT EXISTS idx_audit_classification
          ON ${this.tableName}(data_classification)
          WHERE data_classification IS NOT NULL;
      `);

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize audit logger:', error);
      throw error;
    }
  }

  /**
   * Log an audit event
   * @param {object} entry - Audit log entry
   * @returns {string} Audit log ID
   */
  async log(entry) {
    await this.init();

    const {
      tenantId,
      userId = null,
      sessionId = null,
      action,
      resourceType = null,
      resourceId = null,
      skillName = null,
      ipAddress = null,
      userAgent = null,
      requestMethod = null,
      requestPath = null,
      requestBodyHash = null,
      responseStatus = null,
      responseBodyHash = null,
      durationMs = null,
      dlpFindings = [],
      phiDetected = false,
      piiDetected = false,
      dataClassification = null,
      retentionPeriod = null,
      errorMessage = null,
      errorStack = null
    } = entry;

    if (!tenantId || !action) {
      throw new Error('tenantId and action are required for audit logging');
    }

    try {
      const result = await this.pool.query(
        `INSERT INTO ${this.tableName} (
          tenant_id, user_id, session_id, action, resource_type, resource_id,
          skill_name, ip_address, user_agent, request_method, request_path,
          request_body_hash, response_status, response_body_hash, duration_ms,
          dlp_findings, phi_detected, pii_detected, data_classification,
          retention_period, error_message, error_stack
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22
        ) RETURNING id`,
        [
          tenantId, userId, sessionId, action, resourceType, resourceId,
          skillName, ipAddress, userAgent, requestMethod, requestPath,
          requestBodyHash, responseStatus, responseBodyHash, durationMs,
          JSON.stringify(dlpFindings), phiDetected, piiDetected,
          dataClassification, retentionPeriod, errorMessage, errorStack
        ]
      );

      return result.rows[0].id;
    } catch (error) {
      // Don't let audit logging failures break the main application
      console.error('Failed to write audit log:', error);
      throw error;
    }
  }

  /**
   * Log skill execution start
   * @param {object} context - Execution context
   * @returns {string} Audit log ID
   */
  async logSkillStart(context) {
    const { tenantId, userId, sessionId, skillName, inputHash, metadata } = context;

    return await this.log({
      tenantId,
      userId,
      sessionId,
      action: 'SKILL_EXECUTION_START',
      skillName,
      resourceType: 'skill',
      resourceId: skillName,
      requestBodyHash: inputHash,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      dataClassification: metadata?.dataClassification || 'INTERNAL'
    });
  }

  /**
   * Log skill execution completion
   * @param {object} context - Execution context
   * @param {object} result - Execution result
   * @returns {string} Audit log ID
   */
  async logSkillEnd(context, result) {
    const {
      tenantId,
      userId,
      sessionId,
      skillName,
      inputHash,
      outputHash,
      durationMs,
      dlpFindings = [],
      metadata
    } = context;

    return await this.log({
      tenantId,
      userId,
      sessionId,
      action: 'SKILL_EXECUTION_END',
      skillName,
      resourceType: 'skill',
      resourceId: skillName,
      requestBodyHash: inputHash,
      responseBodyHash: outputHash,
      responseStatus: 200,
      durationMs,
      dlpFindings,
      phiDetected: dlpFindings.some(f => f.categories?.includes('PHI')),
      piiDetected: dlpFindings.some(f => f.categories?.includes('PII')),
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      dataClassification: metadata?.dataClassification || 'INTERNAL'
    });
  }

  /**
   * Log skill execution error
   * @param {object} context - Execution context
   * @param {Error} error - Error object
   * @returns {string} Audit log ID
   */
  async logSkillError(context, error) {
    const { tenantId, userId, sessionId, skillName, inputHash, durationMs, metadata } = context;

    return await this.log({
      tenantId,
      userId,
      sessionId,
      action: 'SKILL_EXECUTION_ERROR',
      skillName,
      resourceType: 'skill',
      resourceId: skillName,
      requestBodyHash: inputHash,
      responseStatus: 500,
      durationMs,
      errorMessage: error.message,
      errorStack: error.stack,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      dataClassification: metadata?.dataClassification || 'INTERNAL'
    });
  }

  /**
   * Search audit logs
   * @param {object} filters - Search filters
   * @returns {Array} Matching audit logs
   */
  async search(filters) {
    await this.init();

    const {
      tenantId,
      userId = null,
      action = null,
      skillName = null,
      resourceType = null,
      startDate = null,
      endDate = null,
      phiDetected = null,
      piiDetected = null,
      limit = 1000,
      offset = 0
    } = filters;

    if (!tenantId) {
      throw new Error('tenantId is required for audit log search');
    }

    const conditions = ['tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    if (userId) {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (skillName) {
      conditions.push(`skill_name = $${paramIndex}`);
      params.push(skillName);
      paramIndex++;
    }

    if (resourceType) {
      conditions.push(`resource_type = $${paramIndex}`);
      params.push(resourceType);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (phiDetected !== null) {
      conditions.push(`phi_detected = $${paramIndex}`);
      params.push(phiDetected);
      paramIndex++;
    }

    if (piiDetected !== null) {
      conditions.push(`pii_detected = $${paramIndex}`);
      params.push(piiDetected);
      paramIndex++;
    }

    const query = `
      SELECT *
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Failed to search audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit log statistics
   * @param {object} filters - Filter criteria
   * @returns {object} Statistics
   */
  async getStats(filters) {
    await this.init();

    const { tenantId, startDate, endDate } = filters;

    if (!tenantId) {
      throw new Error('tenantId is required for audit stats');
    }

    const conditions = ['tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN phi_detected = TRUE THEN 1 END) as phi_events,
        COUNT(CASE WHEN pii_detected = TRUE THEN 1 END) as pii_events,
        COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as error_events,
        AVG(duration_ms) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        json_object_agg(action, action_count) as actions_by_type
      FROM (
        SELECT
          action,
          COUNT(*) as action_count,
          user_id,
          phi_detected,
          pii_detected,
          error_message,
          duration_ms
        FROM ${this.tableName}
        WHERE ${conditions.join(' AND ')}
        GROUP BY action, user_id, phi_detected, pii_detected, error_message, duration_ms
      ) subquery
    `;

    try {
      const result = await this.pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to get audit stats:', error);
      throw error;
    }
  }

  /**
   * Export audit logs for compliance reporting
   * @param {object} filters - Export filters
   * @param {string} format - Export format (json, csv)
   * @returns {string|object} Exported data
   */
  async export(filters, format = 'json') {
    const logs = await this.search({ ...filters, limit: 100000 });

    if (format === 'csv') {
      return this.convertToCSV(logs);
    }

    return logs;
  }

  /**
   * Convert logs to CSV format
   * @param {Array} logs - Audit logs
   * @returns {string} CSV string
   */
  convertToCSV(logs) {
    if (!logs || logs.length === 0) {
      return '';
    }

    const headers = Object.keys(logs[0]);
    const csvRows = [headers.join(',')];

    for (const log of logs) {
      const values = headers.map(header => {
        const value = log[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value).replace(/"/g, '""');
      });
      csvRows.push(values.map(v => `"${v}"`).join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = AuditLogger;
