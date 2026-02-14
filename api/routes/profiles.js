/**
 * Profile Management API Routes
 * Simple profile/user management for document organization
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/v1/profiles
 * List all profiles for the tenant
 */
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenantId;

        const result = await req.db.query(`
            SELECT id, profile_name as "profileName", display_name as "displayName",
                   description, metadata, active, created_at as "createdAt"
            FROM profiles
            WHERE tenant_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC
        `, [tenantId]);

        res.json({
            success: true,
            profiles: result.rows
        });
    } catch (error) {
        console.error('List profiles error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list profiles'
        });
    }
});

/**
 * POST /api/v1/profiles
 * Create a new profile
 */
router.post('/', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { profile_name, display_name, description, metadata } = req.body;

        if (!profile_name) {
            return res.status(400).json({
                success: false,
                error: 'profile_name is required'
            });
        }

        // Check if profile already exists
        const existingResult = await req.db.query(`
            SELECT id FROM profiles
            WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL
        `, [tenantId, profile_name]);

        if (existingResult.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Profile with this name already exists'
            });
        }

        // Create profile
        const result = await req.db.query(`
            INSERT INTO profiles (tenant_id, profile_name, display_name, description, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, profile_name as "profileName", display_name as "displayName",
                      description, metadata, active, created_at as "createdAt"
        `, [tenantId, profile_name, display_name || profile_name, description || null, metadata || {}]);

        // Log audit
        if (req.audit) {
            await req.audit.log({
                tenantId,
                action: 'PROFILE_CREATE',
                resourceType: 'profile',
                resourceId: result.rows[0].id,
                meta: { profile_name }
            });
        }

        res.status(201).json({
            success: true,
            profile: result.rows[0]
        });
    } catch (error) {
        console.error('Create profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create profile'
        });
    }
});

/**
 * GET /api/v1/profiles/:name
 * Get a profile by name
 */
router.get('/:name', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { name } = req.params;

        const result = await req.db.query(`
            SELECT id, profile_name as "profileName", display_name as "displayName",
                   description, metadata, active, created_at as "createdAt"
            FROM profiles
            WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL
        `, [tenantId, name]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Profile not found'
            });
        }

        res.json({
            success: true,
            profile: result.rows[0]
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile'
        });
    }
});

/**
 * GET /api/v1/profiles/:name/documents
 * Get all documents for a profile
 */
router.get('/:name/documents', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { name } = req.params;

        const result = await req.db.query(`
            SELECT id, filename, original_name as "originalName", mimetype, size_bytes as size,
                   profile_name as "profileName", document_type as "documentType",
                   status, processed_at as "processedAt", created_at as "uploadedAt",
                   extracted_data as "extractedData"
            FROM documents
            WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL
            ORDER BY created_at DESC
        `, [tenantId, name]);

        res.json({
            success: true,
            profile_name: name,
            document_count: result.rows.length,
            documents: result.rows
        });
    } catch (error) {
        console.error('Get profile documents error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile documents'
        });
    }
});

/**
 * DELETE /api/v1/profiles/:name
 * Delete a profile (soft delete)
 */
router.delete('/:name', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { name } = req.params;

        const result = await req.db.query(`
            UPDATE profiles
            SET deleted_at = NOW()
            WHERE tenant_id = $1 AND profile_name = $2 AND deleted_at IS NULL
            RETURNING id
        `, [tenantId, name]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Profile not found'
            });
        }

        // Log audit
        if (req.audit) {
            await req.audit.log({
                tenantId,
                action: 'PROFILE_DELETE',
                resourceType: 'profile',
                resourceId: result.rows[0].id,
                meta: { profile_name: name }
            });
        }

        res.json({
            success: true,
            message: 'Profile deleted'
        });
    } catch (error) {
        console.error('Delete profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete profile'
        });
    }
});

module.exports = router;
