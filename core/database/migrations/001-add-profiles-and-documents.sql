-- Migration: Add profile system and documents table
-- Run this migration to add user profiles and document storage

-- Add profile_name to users table (simple name-based profiles)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_name VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_users_profile_name ON users(tenant_id, profile_name) WHERE profile_name IS NOT NULL;

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Profile association (simple name-based)
  profile_name VARCHAR(255),

  -- File metadata
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  file_path TEXT NOT NULL,
  storage_location VARCHAR(50) DEFAULT 'local',

  -- Document classification
  document_type VARCHAR(100),
  client_id UUID,

  -- Processing status
  status VARCHAR(50) DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'failed', 'archived')),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,

  -- Extracted data (from doc-extract skill)
  extracted_data JSONB,

  -- Security
  encryption_key_id VARCHAR(255),
  encrypted BOOLEAN DEFAULT FALSE,

  -- DLP scan results
  dlp_scanned BOOLEAN DEFAULT FALSE,
  dlp_findings JSONB DEFAULT '[]',
  contains_phi BOOLEAN DEFAULT FALSE,
  contains_pii BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for documents
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_documents_user_id ON documents(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_documents_profile_name ON documents(tenant_id, profile_name) WHERE profile_name IS NOT NULL;
CREATE INDEX idx_documents_status ON documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_type ON documents(document_type) WHERE document_type IS NOT NULL;
CREATE INDEX idx_documents_created ON documents(tenant_id, created_at DESC);

-- Row-Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_tenant_isolation ON documents
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Trigger for updated_at
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create profiles table (optional, for more structured profile management)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Profile info
  profile_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  description TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Status
  active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(tenant_id, profile_name)
);

CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX idx_profiles_name ON profiles(tenant_id, profile_name);
CREATE INDEX idx_profiles_active ON profiles(active) WHERE deleted_at IS NULL;

-- Row-Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_tenant_isolation ON profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Trigger for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
