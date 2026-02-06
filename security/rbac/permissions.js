/**
 * Role-Based Access Control (RBAC) System
 * Defines roles and permissions for each vertical
 */

// Define permissions for each vertical
const PERMISSIONS = {
  // Healthcare (MediGuard AI)
  healthcare: {
    // Patient data
    'patient:read': 'View patient information',
    'patient:write': 'Create/update patient records',
    'patient:delete': 'Delete patient records',

    // Clinical operations
    'appointment:read': 'View appointments',
    'appointment:write': 'Create/update appointments',
    'appointment:cancel': 'Cancel appointments',

    'prescription:read': 'View prescriptions',
    'prescription:write': 'Create prescriptions',
    'prescription:approve': 'Approve prescriptions',

    'clinical-notes:read': 'View clinical notes',
    'clinical-notes:write': 'Create/edit clinical notes',

    // Administrative
    'billing:read': 'View billing information',
    'billing:write': 'Create/update billing',
    'billing:process': 'Process payments',

    'prior-auth:read': 'View prior authorizations',
    'prior-auth:submit': 'Submit prior authorizations',

    // Compliance
    'audit:read': 'View audit logs',
    'phi:redact': 'Redact PHI from documents',
    'reports:generate': 'Generate compliance reports'
  },

  // Finance (FinSecure AI)
  finance: {
    // Client management
    'client:read': 'View client information',
    'client:write': 'Create/update clients',
    'client:delete': 'Delete clients',

    // Financial operations
    'tax-return:read': 'View tax returns',
    'tax-return:write': 'Create/edit tax returns',
    'tax-return:file': 'File tax returns',

    'bank-reconciliation:read': 'View reconciliations',
    'bank-reconciliation:perform': 'Perform reconciliations',

    'financial-statement:read': 'View financial statements',
    'financial-statement:generate': 'Generate statements',

    // Audit
    'audit-trail:read': 'View audit trails',
    'audit-trail:export': 'Export audit data',

    // Compliance
    'compliance:read': 'View compliance status',
    'fraud:monitor': 'Monitor fraud alerts'
  },

  // Enterprise (DevShield AI)
  enterprise: {
    // Code & repositories
    'code:read': 'View code and repositories',
    'code:review': 'Review pull requests',
    'code:approve': 'Approve code changes',

    // Infrastructure
    'infrastructure:read': 'View infrastructure',
    'infrastructure:manage': 'Manage infrastructure',
    'cost:optimize': 'Access cost optimization',

    // Incidents
    'incident:read': 'View incidents',
    'incident:respond': 'Respond to incidents',
    'incident:manage': 'Manage incident resolution',

    // Monitoring
    'monitor:read': 'View monitoring data',
    'alert:manage': 'Manage alerts'
  },

  // Legal (LegalVault AI)
  legal: {
    // Documents
    'document:read': 'View legal documents',
    'document:write': 'Create/edit documents',
    'document:redact': 'Redact privileged information',

    // Cases
    'case:read': 'View case information',
    'case:manage': 'Manage cases',

    // Contracts
    'contract:read': 'View contracts',
    'contract:analyze': 'Analyze contracts',
    'contract:approve': 'Approve contracts',

    // Research
    'research:perform': 'Perform legal research',

    // E-discovery
    'ediscovery:read': 'View e-discovery materials',
    'ediscovery:organize': 'Organize e-discovery',

    // Compliance
    'compliance:check': 'Run compliance checks'
  },

  // Data Engineering (DataForge AI)
  data: {
    // Data access
    'data:read': 'Read data sources',
    'data:write': 'Write to data sources',
    'data:delete': 'Delete data',

    // Pipelines
    'pipeline:read': 'View pipelines',
    'pipeline:create': 'Create pipelines',
    'pipeline:execute': 'Execute pipelines',

    // Analytics
    'analytics:read': 'View analytics',
    'analytics:create': 'Create analytics',

    // Databases
    'query:read': 'Execute read queries',
    'query:write': 'Execute write queries',
    'query:optimize': 'Optimize queries'
  }
};

// Define roles with their permissions
const ROLES = {
  healthcare: {
    physician: {
      name: 'Physician',
      description: 'Licensed medical doctor',
      permissions: [
        'patient:read', 'patient:write',
        'appointment:read', 'appointment:write',
        'prescription:read', 'prescription:write', 'prescription:approve',
        'clinical-notes:read', 'clinical-notes:write',
        'prior-auth:read', 'prior-auth:submit',
        'phi:redact'
      ]
    },
    nurse: {
      name: 'Nurse',
      description: 'Registered nurse',
      permissions: [
        'patient:read', 'patient:write',
        'appointment:read', 'appointment:write',
        'prescription:read',
        'clinical-notes:read', 'clinical-notes:write'
      ]
    },
    admin: {
      name: 'Administrator',
      description: 'Healthcare administrator',
      permissions: [
        'patient:read',
        'appointment:read', 'appointment:write', 'appointment:cancel',
        'billing:read', 'billing:write', 'billing:process',
        'prior-auth:read', 'prior-auth:submit',
        'audit:read', 'reports:generate'
      ]
    },
    billing_specialist: {
      name: 'Billing Specialist',
      description: 'Medical billing specialist',
      permissions: [
        'patient:read',
        'billing:read', 'billing:write', 'billing:process',
        'prior-auth:read',
        'audit:read'
      ]
    },
    compliance_officer: {
      name: 'Compliance Officer',
      description: 'HIPAA compliance officer',
      permissions: [
        'audit:read',
        'phi:redact',
        'reports:generate'
      ]
    }
  },

  finance: {
    cpa: {
      name: 'CPA',
      description: 'Certified Public Accountant',
      permissions: [
        'client:read', 'client:write',
        'tax-return:read', 'tax-return:write', 'tax-return:file',
        'bank-reconciliation:read', 'bank-reconciliation:perform',
        'financial-statement:read', 'financial-statement:generate',
        'audit-trail:read', 'audit-trail:export',
        'compliance:read'
      ]
    },
    bookkeeper: {
      name: 'Bookkeeper',
      description: 'Bookkeeping staff',
      permissions: [
        'client:read',
        'bank-reconciliation:read', 'bank-reconciliation:perform',
        'financial-statement:read'
      ]
    },
    tax_preparer: {
      name: 'Tax Preparer',
      description: 'Tax preparation specialist',
      permissions: [
        'client:read',
        'tax-return:read', 'tax-return:write'
      ]
    },
    partner: {
      name: 'Partner',
      description: 'Firm partner',
      permissions: Object.keys(PERMISSIONS.finance)
    }
  },

  enterprise: {
    developer: {
      name: 'Developer',
      description: 'Software developer',
      permissions: [
        'code:read', 'code:review',
        'infrastructure:read',
        'incident:read',
        'monitor:read'
      ]
    },
    devops: {
      name: 'DevOps Engineer',
      description: 'DevOps/SRE engineer',
      permissions: [
        'code:read', 'code:review', 'code:approve',
        'infrastructure:read', 'infrastructure:manage',
        'cost:optimize',
        'incident:read', 'incident:respond', 'incident:manage',
        'monitor:read', 'alert:manage'
      ]
    },
    manager: {
      name: 'Engineering Manager',
      description: 'Engineering manager',
      permissions: [
        'code:read', 'code:review', 'code:approve',
        'infrastructure:read',
        'cost:optimize',
        'incident:read', 'incident:manage',
        'monitor:read'
      ]
    }
  },

  legal: {
    attorney: {
      name: 'Attorney',
      description: 'Licensed attorney',
      permissions: [
        'document:read', 'document:write', 'document:redact',
        'case:read', 'case:manage',
        'contract:read', 'contract:analyze', 'contract:approve',
        'research:perform',
        'ediscovery:read', 'ediscovery:organize',
        'compliance:check'
      ]
    },
    paralegal: {
      name: 'Paralegal',
      description: 'Paralegal staff',
      permissions: [
        'document:read', 'document:write',
        'case:read',
        'contract:read',
        'research:perform',
        'ediscovery:read', 'ediscovery:organize'
      ]
    },
    legal_secretary: {
      name: 'Legal Secretary',
      description: 'Legal secretary',
      permissions: [
        'document:read',
        'case:read',
        'contract:read'
      ]
    }
  },

  data: {
    data_engineer: {
      name: 'Data Engineer',
      description: 'Data engineering professional',
      permissions: [
        'data:read', 'data:write',
        'pipeline:read', 'pipeline:create', 'pipeline:execute',
        'analytics:read',
        'query:read', 'query:write', 'query:optimize'
      ]
    },
    data_analyst: {
      name: 'Data Analyst',
      description: 'Data analyst',
      permissions: [
        'data:read',
        'pipeline:read',
        'analytics:read', 'analytics:create',
        'query:read'
      ]
    },
    data_scientist: {
      name: 'Data Scientist',
      description: 'Data scientist',
      permissions: [
        'data:read', 'data:write',
        'pipeline:read', 'pipeline:execute',
        'analytics:read', 'analytics:create',
        'query:read', 'query:write'
      ]
    }
  }
};

class RBAC {
  constructor(vertical) {
    if (!PERMISSIONS[vertical]) {
      throw new Error(`Invalid vertical: ${vertical}`);
    }

    this.vertical = vertical;
    this.permissions = PERMISSIONS[vertical];
    this.roles = ROLES[vertical];
  }

  /**
   * Check if a role has a specific permission
   * @param {string} role - Role name
   * @param {string} permission - Permission to check
   * @returns {boolean}
   */
  hasPermission(role, permission) {
    if (!this.roles[role]) {
      return false;
    }

    return this.roles[role].permissions.includes(permission);
  }

  /**
   * Check if a user has a specific permission
   * @param {object} user - User object with roles
   * @param {string} permission - Permission to check
   * @returns {boolean}
   */
  userCan(user, permission) {
    if (!user || !user.role) {
      return false;
    }

    return this.hasPermission(user.role, permission);
  }

  /**
   * Get all permissions for a role
   * @param {string} role - Role name
   * @returns {Array} List of permissions
   */
  getRolePermissions(role) {
    if (!this.roles[role]) {
      return [];
    }

    return this.roles[role].permissions;
  }

  /**
   * Get all available roles
   * @returns {object} Roles configuration
   */
  getAvailableRoles() {
    return this.roles;
  }

  /**
   * Get all available permissions
   * @returns {object} Permissions configuration
   */
  getAvailablePermissions() {
    return this.permissions;
  }
}

module.exports = { RBAC, PERMISSIONS, ROLES };
