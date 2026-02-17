/**
 * Document Management API Routes
 * Handles document upload, storage, and management
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Configure multer for file uploads
// Configure multer for file uploads
const isVercel = process.env.VERCEL === '1';
const UPLOAD_DIR = process.env.UPLOAD_DIR || (isVercel ? '/tmp/uploads' : path.join(__dirname, '../../uploads'));

// Ensure upload directory exists
try {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
} catch (err) {
    console.warn('Failed to create upload directory:', err.message);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tenantDir = path.join(UPLOAD_DIR, req.tenantId || 'default');
        if (!fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }
        cb(null, tenantDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, `doc-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'application/octet-stream'  // For CSV files sometimes detected as binary
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 10 // Max 10 files per upload
    }
});

/**
 * POST /api/v1/documents/upload
 * Upload one or more documents (with profile support)
 */
router.post('/upload', upload.array('files', 10), async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.userId || null;
        const { client_id, document_type, profile_name } = req.body;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No files uploaded'
            });
        }

        const documents = [];

        for (const file of req.files) {
            // Insert into database
            const result = await req.db.query(`
                INSERT INTO documents (
                    tenant_id, user_id, profile_name, filename, original_name,
                    mimetype, size_bytes, file_path, document_type, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, filename, original_name as "originalName", mimetype, size_bytes as size,
                          profile_name as "profileName", document_type as "documentType",
                          status, created_at as "uploadedAt"
            `, [
                tenantId,
                userId,
                profile_name || null,
                file.filename,
                file.originalname,
                file.mimetype,
                file.size,
                file.path,
                document_type || 'unknown',
                'uploaded'
            ]);

            documents.push(result.rows[0]);
        }

        // Log audit
        if (req.audit) {
            await req.audit.log({
                tenantId,
                userId,
                action: 'DOCUMENT_UPLOAD',
                resourceType: 'document',
                meta: {
                    document_count: documents.length,
                    total_size: documents.reduce((sum, d) => sum + d.size, 0),
                    client_id
                }
            });
        }

        res.status(201).json({
            success: true,
            message: `${documents.length} document(s) uploaded successfully`,
            documents
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Upload failed'
        });
    }
});

/**
 * GET /api/v1/documents
 * List all documents for the tenant (with profile filter support)
 */
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { client_id, status, profile_name, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT id, filename, original_name as "originalName", mimetype, size_bytes as size,
                   profile_name as "profileName", document_type as "documentType",
                   status, processed_at as "processedAt", created_at as "uploadedAt",
                   extracted_data as "extractedData"
            FROM documents
            WHERE tenant_id = $1 AND deleted_at IS NULL
        `;
        const params = [tenantId];
        let paramIndex = 2;

        // Apply filters
        if (client_id) {
            query += ` AND client_id = $${paramIndex}`;
            params.push(client_id);
            paramIndex++;
        }
        if (status) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (profile_name) {
            query += ` AND profile_name = $${paramIndex}`;
            params.push(profile_name);
            paramIndex++;
        }

        // Count total
        const countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await req.db.query(countQuery, params);
        const total = countResult.rows.length > 0 ? parseInt(countResult.rows[0].count) : 0;

        // Add sorting and pagination
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(Number(limit), Number(offset));

        const result = await req.db.query(query, params);

        res.json({
            success: true,
            total,
            limit: Number(limit),
            offset: Number(offset),
            documents: result.rows
        });
    } catch (error) {
        console.error('List documents error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            query: error.query
        });
        res.status(500).json({
            success: false,
            error: 'Failed to list documents',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/v1/documents/:id
 * Get a specific document
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;

        const result = await req.db.query(`
            SELECT id, filename, original_name as "originalName", mimetype, size_bytes as size,
                   profile_name as "profileName", document_type as "documentType",
                   status, processed_at as "processedAt", created_at as "uploadedAt",
                   extracted_data as "extractedData"
            FROM documents
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        `, [id, tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        res.json({
            success: true,
            document: result.rows[0]
        });
    } catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get document'
        });
    }
});

/**
 * GET /api/v1/documents/:id/download
 * Download a document
 */
router.get('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;

        const result = await req.db.query(`
            SELECT file_path, original_name
            FROM documents
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        `, [id, tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = result.rows[0];

        if (!fs.existsSync(document.file_path)) {
            return res.status(404).json({
                success: false,
                error: 'File not found on disk'
            });
        }

        res.download(document.file_path, document.original_name);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to download document'
        });
    }
});

/**
 * GET /api/v1/documents/:id/content
 * Get document content as base64 (for processing)
 */
router.get('/:id/content', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;

        const result = await req.db.query(`
            SELECT file_path, mimetype, size_bytes
            FROM documents
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        `, [id, tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = result.rows[0];
        const content = fs.readFileSync(document.file_path);
        const base64 = content.toString('base64');

        res.json({
            success: true,
            document_id: id,
            mimetype: document.mimetype,
            size: document.size_bytes,
            content: base64
        });
    } catch (error) {
        console.error('Get content error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read document'
        });
    }
});

/**
 * PATCH /api/v1/documents/:id
 * Update document metadata
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        const updates = req.body;

        // Check document exists
        const checkResult = await req.db.query(`
            SELECT id FROM documents
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        `, [id, tenantId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        // Build update query dynamically for allowed fields
        const allowedFields = {
            profile_name: 'profile_name',
            document_type: 'document_type',
            status: 'status',
            extracted_data: 'extracted_data'
        };

        const updateParts = [];
        const params = [id, tenantId];
        let paramIndex = 3;

        for (const [apiField, dbField] of Object.entries(allowedFields)) {
            if (updates[apiField] !== undefined) {
                updateParts.push(`${dbField} = $${paramIndex}`);
                params.push(updates[apiField]);
                paramIndex++;
            }
        }

        if (updateParts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        const query = `
            UPDATE documents
            SET ${updateParts.join(', ')}
            WHERE id = $1 AND tenant_id = $2
            RETURNING id, filename, original_name as "originalName", profile_name as "profileName",
                      document_type as "documentType", status, created_at as "uploadedAt"
        `;

        const result = await req.db.query(query, params);

        res.json({
            success: true,
            document: result.rows[0]
        });
    } catch (error) {
        console.error('Update document error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update document'
        });
    }
});

/**
 * DELETE /api/v1/documents/:id
 * Delete a document (soft delete)
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;

        // Get document path before deletion
        const docResult = await req.db.query(`
            SELECT file_path
            FROM documents
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        `, [id, tenantId]);

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const filePath = docResult.rows[0].file_path;

        // Soft delete in database
        await req.db.query(`
            UPDATE documents
            SET deleted_at = NOW()
            WHERE id = $1
        `, [id]);

        // Delete file from disk
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error('Error deleting file:', error);
        }

        // Log audit
        if (req.audit) {
            await req.audit.log({
                tenantId,
                action: 'DOCUMENT_DELETE',
                resourceType: 'document',
                meta: { document_id: id }
            });
        }

        res.json({
            success: true,
            message: 'Document deleted'
        });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete document'
        });
    }
});

/**
 * POST /api/v1/documents/:id/process
 * Trigger document processing (extraction) - stores extracted data in DB
 */
router.post('/:id/process', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;

        // Check if document exists
        const docResult = await req.db.query(`
            SELECT id, file_path, document_type as "documentType", profile_name as "profileName"
            FROM documents
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        `, [id, tenantId]);

        if (docResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        const document = docResult.rows[0];

        // Execute doc-extract skill
        const { executeSkill } = require('../services/tool-executor');

        // Pass document_ids which is what the skill expects
        const result = await executeSkill('doc-extract', {
            document_ids: [id],
            tenant_id: tenantId
        }, {
            tenantId,
            vertical: req.tenant?.vertical || 'finance',
            dlp: req.dlp,
            audit: req.audit,
            db: req.db
        });

        res.json({
            success: true,
            document_id: id,
            profile_name: document.profileName,
            extraction_result: result
        });
    } catch (error) {
        console.error('Processing error:', error);

        // Update status to failed
        await req.db.query(`
            UPDATE documents
            SET status = $1, processing_error = $2
            WHERE id = $3
        `, ['failed', error.message, req.params.id]).catch(console.error);

        res.status(500).json({
            success: false,
            error: error.message || 'Processing failed'
        });
    }
});


// Error handling middleware for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files. Maximum is 10 files per upload.'
            });
        }
    }
    next(error);
});

module.exports = router;
