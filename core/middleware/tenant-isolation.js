/**
 * Multi-Tenant Isolation Middleware
 * Routes requests to the appropriate vertical based on domain
 */

// Tenant configuration mapping domains to verticals
const TENANT_CONFIG = {
  'mediguard-ai.com': {
    id: 'healthcare',
    name: 'MediGuard AI',
    vertical: 'healthcare',
    features: ['hipaa', 'phi_detection', 'prior_auth', 'clinical_notes'],
    compliance: ['HIPAA', 'HITECH'],
    dlpStrictMode: true
  },
  'finsecure-ai.com': {
    id: 'finance',
    name: 'FinSecure AI',
    vertical: 'finance',
    features: ['pci', 'audit_trail', 'tax_automation', 'fraud_detection'],
    compliance: ['SOX', 'PCI-DSS'],
    dlpStrictMode: true
  },
  'devshield-ai.com': {
    id: 'enterprise',
    name: 'DevShield AI',
    vertical: 'enterprise',
    features: ['sso', 'ldap', 'code_review', 'incident_management'],
    compliance: ['SOC2', 'ISO27001'],
    dlpStrictMode: false
  },
  'legalvault-ai.com': {
    id: 'legal',
    name: 'LegalVault AI',
    vertical: 'legal',
    features: ['privilege', 'retention', 'ediscovery', 'contract_analysis'],
    compliance: ['ATTORNEY_CLIENT_PRIVILEGE', 'RETENTION_POLICIES'],
    dlpStrictMode: true
  },
  'dataforge-ai.com': {
    id: 'data',
    name: 'DataForge AI',
    vertical: 'data',
    features: ['bigquery', 'snowflake', 'databricks', 'query_optimization'],
    compliance: ['GDPR', 'CCPA'],
    dlpStrictMode: false
  },

  // Development/testing domains
  'localhost:3000': {
    id: 'healthcare',
    name: 'MediGuard AI (Dev)',
    vertical: 'healthcare',
    features: ['hipaa', 'phi_detection'],
    compliance: ['HIPAA'],
    dlpStrictMode: false
  },
  'localhost:8000': {
    id: 'healthcare',
    name: 'MediGuard AI (Dev)',
    vertical: 'healthcare',
    features: ['hipaa', 'phi_detection'],
    compliance: ['HIPAA'],
    dlpStrictMode: false
  }
};

/**
 * Tenant isolation middleware
 * Identifies tenant from domain and adds context to request
 */
function tenantMiddleware(req, res, next) {
  try {
    // Get host from request (remove port if present)
    let host = req.get('host');
    if (!host) {
      return res.status(400).json({
        error: 'MISSING_HOST_HEADER',
        message: 'Host header is required'
      });
    }

    // Normalize host (handle www prefix, case sensitivity)
    host = host.replace(/^www\./, '').toLowerCase();

    // Find matching tenant configuration
    const tenantConfig = TENANT_CONFIG[host];

    if (!tenantConfig) {
      return res.status(404).json({
        error: 'INVALID_TENANT',
        message: `No tenant configuration found for domain: ${host}`,
        availableDomains: Object.keys(TENANT_CONFIG).filter(d => !d.includes('localhost'))
      });
    }

    // Add tenant context to request
    req.tenant = {
      id: tenantConfig.id,
      name: tenantConfig.name,
      vertical: tenantConfig.vertical,
      features: tenantConfig.features,
      compliance: tenantConfig.compliance,
      dlpStrictMode: tenantConfig.dlpStrictMode,
      domain: host
    };

    // Add tenant context to response headers (for debugging)
    res.setHeader('X-Tenant-ID', tenantConfig.id);
    res.setHeader('X-Vertical', tenantConfig.vertical);

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    return res.status(500).json({
      error: 'TENANT_RESOLUTION_ERROR',
      message: 'Failed to resolve tenant configuration'
    });
  }
}

/**
 * Tenant feature check middleware
 * Verify that tenant has access to a specific feature
 */
function requireFeature(feature) {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(500).json({
        error: 'MISSING_TENANT_CONTEXT',
        message: 'Tenant context not initialized'
      });
    }

    if (!req.tenant.features.includes(feature)) {
      return res.status(403).json({
        error: 'FEATURE_NOT_ENABLED',
        message: `Feature '${feature}' is not enabled for this tenant`,
        tenant: req.tenant.name,
        vertical: req.tenant.vertical
      });
    }

    next();
  };
}

/**
 * Tenant vertical check middleware
 * Restrict endpoint to specific verticals
 */
function requireVertical(...allowedVerticals) {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(500).json({
        error: 'MISSING_TENANT_CONTEXT',
        message: 'Tenant context not initialized'
      });
    }

    if (!allowedVerticals.includes(req.tenant.vertical)) {
      return res.status(403).json({
        error: 'VERTICAL_NOT_ALLOWED',
        message: `This endpoint is only available for: ${allowedVerticals.join(', ')}`,
        currentVertical: req.tenant.vertical
      });
    }

    next();
  };
}

/**
 * Get tenant configuration
 * @param {string} domain - Domain name
 * @returns {object|null} Tenant configuration
 */
function getTenantConfig(domain) {
  const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();
  return TENANT_CONFIG[normalizedDomain] || null;
}

/**
 * Get all tenant domains
 * @returns {Array} List of all configured domains
 */
function getAllTenantDomains() {
  return Object.keys(TENANT_CONFIG).filter(d => !d.includes('localhost'));
}

/**
 * Get tenant by vertical
 * @param {string} vertical - Vertical name
 * @returns {object|null} Tenant configuration
 */
function getTenantByVertical(vertical) {
  const entry = Object.entries(TENANT_CONFIG).find(
    ([domain, config]) => config.vertical === vertical && !domain.includes('localhost')
  );

  return entry ? entry[1] : null;
}

module.exports = {
  tenantMiddleware,
  requireFeature,
  requireVertical,
  getTenantConfig,
  getAllTenantDomains,
  getTenantByVertical,
  TENANT_CONFIG
};
