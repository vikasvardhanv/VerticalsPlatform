/**
 * Exports API Routes
 * Handles downloading exported files (Excel, CSV, etc.)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

/**
 * GET /api/v1/exports/:tenant_id/:filename
 * Download an exported file
 */
router.get('/:tenant_id/:filename', async (req, res) => {
    try {
        const { tenant_id, filename } = req.params;
        const requestTenantId = req.tenantId;

        // Security: Verify tenant matches
        if (tenant_id !== requestTenantId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied: Tenant mismatch'
            });
        }

        // Sanitize filename to prevent directory traversal
        const safeFilename = path.basename(filename);
        const filePath = path.join(__dirname, '../../exports', tenant_id, safeFilename);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Export file not found'
            });
        }

        // Set appropriate headers for download
        const ext = path.extname(safeFilename).toLowerCase();
        const contentType = getContentType(ext);

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Export download error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to download export file'
        });
    }
});

/**
 * GET /api/v1/exports/:tenant_id
 * List all exports for a tenant
 */
router.get('/:tenant_id', async (req, res) => {
    try {
        const { tenant_id } = req.params;
        const requestTenantId = req.tenantId;

        // Security: Verify tenant matches
        if (tenant_id !== requestTenantId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied: Tenant mismatch'
            });
        }

        const exportsDir = path.join(__dirname, '../../exports', tenant_id);

        // Create directory if it doesn't exist
        if (!fs.existsSync(exportsDir)) {
            return res.json({
                success: true,
                exports: [],
                total: 0
            });
        }

        // List all files
        const files = fs.readdirSync(exportsDir);
        const exports = files.map(filename => {
            const filePath = path.join(exportsDir, filename);
            const stats = fs.statSync(filePath);

            return {
                filename,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                download_url: `/api/v1/exports/${tenant_id}/${filename}`
            };
        });

        // Sort by modified date (newest first)
        exports.sort((a, b) => b.modified - a.modified);

        res.json({
            success: true,
            exports,
            total: exports.length
        });

    } catch (error) {
        console.error('List exports error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list exports'
        });
    }
});

/**
 * DELETE /api/v1/exports/:tenant_id/:filename
 * Delete an exported file
 */
router.delete('/:tenant_id/:filename', async (req, res) => {
    try {
        const { tenant_id, filename } = req.params;
        const requestTenantId = req.tenantId;

        // Security: Verify tenant matches
        if (tenant_id !== requestTenantId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied: Tenant mismatch'
            });
        }

        // Sanitize filename
        const safeFilename = path.basename(filename);
        const filePath = path.join(__dirname, '../../exports', tenant_id, safeFilename);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Export file not found'
            });
        }

        // Delete file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: 'Export deleted successfully'
        });

    } catch (error) {
        console.error('Delete export error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete export file'
        });
    }
});

/**
 * Helper: Get content type based on file extension
 */
function getContentType(ext) {
    const types = {
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.txt': 'text/plain'
    };

    return types[ext] || 'application/octet-stream';
}

module.exports = router;
