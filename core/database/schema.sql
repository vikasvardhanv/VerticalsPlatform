-- Multi-Tenant Database Schema
-- PostgreSQL 14+ with Row-Level Security (RLS)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical VARCHAR(50) NOT NULL CHECK (vertical IN ('healthcare', 'finance', 'enterprise', 'legal', 'data')),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'trial')),

  -- Settings
  settings JSONB DEFAULT '{}',
  features JSONB DEFAULT '[]',
  compliance_requirements JSONB DEFAULT '[]',

  -- Encryption
  encryption_key_id VARCHAR(255) NOT NULL,
  dlp_strict_mode BOOLEAN DEFAULT TRUE,

  -- Subscription
  subscription_tier VARCHAR(50) DEFAULT 'starter' CHECK (subscription_tier IN ('starter', 'professional', 'enterprise')),
  subscription_status VARCHAR(50) DEFAULT 'trialing',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_vertical ON tenants(vertical);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identity
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255),

  -- Role & Permissions
  role VARCHAR(50) NOT NULL,
  permissions JSONB DEFAULT '[]',
  custom_permissions JSONB DEFAULT '[]',

  -- Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
  email_verified BOOLEAN DEFAULT FALSE,

  -- Security
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(tenant_id, role);
CREATE INDEX idx_users_status ON users(status) WHERE deleted_at IS NULL;

-- Row-Level Security for users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================
-- SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session data
  session_token VARCHAR(255) UNIQUE NOT NULL,
  refresh_token VARCHAR(255) UNIQUE,
  ip_address INET,
  user_agent TEXT,

  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_tenant_id ON sessions(tenant_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Row-Level Security for sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_tenant_isolation ON sessions
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================
-- AUDIT LOGS TABLE (already defined in audit/logger.js)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user_action ON audit_logs(user_id, action) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_skill_name ON audit_logs(skill_name) WHERE skill_name IS NOT NULL;
CREATE INDEX idx_audit_phi_detected ON audit_logs(phi_detected) WHERE phi_detected = TRUE;
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id) WHERE resource_type IS NOT NULL;
CREATE INDEX idx_audit_classification ON audit_logs(data_classification) WHERE data_classification IS NOT NULL;

-- Row-Level Security for audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================
-- HEALTHCARE-SPECIFIC TABLES (MediGuard AI)
-- ============================================================

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identifiers (encrypted)
  mrn VARCHAR(50) NOT NULL,
  external_id VARCHAR(255),

  -- Demographics (encrypted)
  demographics JSONB NOT NULL,

  -- Medical data (encrypted)
  medical_history JSONB DEFAULT '[]',
  allergies JSONB DEFAULT '[]',
  medications JSONB DEFAULT '[]',

  -- Insurance (encrypted)
  insurance_info JSONB DEFAULT '{}',

  -- Status
  active BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(tenant_id, mrn)
);

CREATE INDEX idx_patients_tenant_id ON patients(tenant_id);
CREATE INDEX idx_patients_mrn ON patients(tenant_id, mrn);
CREATE INDEX idx_patients_active ON patients(active) WHERE deleted_at IS NULL;

-- Row-Level Security
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_tenant_isolation ON patients
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Appointment details
  appointment_type VARCHAR(50) NOT NULL,
  scheduled_datetime TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'scheduled',
  reason TEXT,
  notes JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_appointments_tenant_id ON appointments(tenant_id);
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_provider_id ON appointments(provider_id);
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_datetime);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Row-Level Security
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_tenant_isolation ON appointments
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Prescription details
  prescription_number VARCHAR(50) UNIQUE NOT NULL,
  medications JSONB NOT NULL,
  diagnosis_codes JSONB DEFAULT '[]',
  interactions JSONB DEFAULT '[]',

  -- Status
  status VARCHAR(50) DEFAULT 'active',
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prescriptions_tenant_id ON prescriptions(tenant_id);
CREATE INDEX idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_provider_id ON prescriptions(provider_id);
CREATE INDEX idx_prescriptions_status ON prescriptions(status);
CREATE INDEX idx_prescriptions_issued ON prescriptions(issued_at DESC);

-- Row-Level Security
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY prescriptions_tenant_isolation ON prescriptions
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- PHI Redaction Cache
CREATE TABLE IF NOT EXISTS phi_redaction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Content
  content_hash VARCHAR(64) UNIQUE NOT NULL,
  redacted_content TEXT NOT NULL,
  phi_entities JSONB NOT NULL,

  -- Redaction metadata
  strategy VARCHAR(50) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_phi_cache_content_hash ON phi_redaction_cache(content_hash);
CREATE INDEX idx_phi_cache_expires ON phi_redaction_cache(expires_at);

-- Row-Level Security
ALTER TABLE phi_redaction_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY phi_cache_tenant_isolation ON phi_redaction_cache
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================
-- FINANCE-SPECIFIC TABLES (FinSecure AI)
-- ============================================================

-- Clients
CREATE TABLE IF NOT EXISTS finance_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Client info (encrypted)
  client_number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_info JSONB NOT NULL,
  tax_info JSONB DEFAULT '{}',

  -- Status
  status VARCHAR(50) DEFAULT 'active',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(tenant_id, client_number)
);

CREATE INDEX idx_finance_clients_tenant_id ON finance_clients(tenant_id);
CREATE INDEX idx_finance_clients_number ON finance_clients(tenant_id, client_number);

-- Row-Level Security
ALTER TABLE finance_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_clients_tenant_isolation ON finance_clients
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to set tenant context (call at start of transaction)
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', tenant_uuid::TEXT, TRUE);
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prescriptions_updated_at BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_finance_clients_updated_at BEFORE UPDATE ON finance_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED DATA (Development Only)
-- ============================================================

-- Insert default tenants (only if not exists)
INSERT INTO tenants (id, vertical, name, domain, encryption_key_id, subscription_tier)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'healthcare', 'MediGuard AI', 'mediguard-ai.com', 'healthcare-master-key', 'professional'),
  ('00000000-0000-0000-0000-000000000002', 'finance', 'FinSecure AI', 'finsecure-ai.com', 'finance-master-key', 'professional'),
  ('00000000-0000-0000-0000-000000000003', 'enterprise', 'DevShield AI', 'devshield-ai.com', 'enterprise-master-key', 'enterprise'),
  ('00000000-0000-0000-0000-000000000004', 'legal', 'LegalVault AI', 'legalvault-ai.com', 'legal-master-key', 'professional'),
  ('00000000-0000-0000-0000-000000000005', 'data', 'DataForge AI', 'dataforge-ai.com', 'data-master-key', 'professional')
ON CONFLICT (domain) DO NOTHING;
