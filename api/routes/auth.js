/**
 * Authentication API Routes
 * Handles user authentication with JWT
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// In-memory user store (use database in production)
const userStore = new Map();
const refreshTokenStore = new Map();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, company } = req.body;
        const tenantId = req.tenantId;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }

        // Check if user exists
        const userKey = `${tenantId}:${email.toLowerCase()}`;
        if (userStore.has(userKey)) {
            return res.status(409).json({
                success: false,
                error: 'User already exists'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const userId = 'user_' + crypto.randomUUID();
        const user = {
            id: userId,
            email: email.toLowerCase(),
            passwordHash,
            name: name || email.split('@')[0],
            company: company || null,
            tenantId,
            role: 'user',
            createdAt: new Date().toISOString(),
            lastLogin: null
        };

        userStore.set(userKey, user);

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        res.status(201).json({
            success: true,
            user: sanitizeUser(user),
            accessToken,
            refreshToken
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

/**
 * POST /api/v1/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const tenantId = req.tenantId;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Find user
        const userKey = `${tenantId}:${email.toLowerCase()}`;
        const user = userStore.get(userKey);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Update last login
        user.lastLogin = new Date().toISOString();
        userStore.set(userKey, user);

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        res.json({
            success: true,
            user: sanitizeUser(user),
            accessToken,
            refreshToken
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh', (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token is required'
            });
        }

        // Verify refresh token exists
        const tokenData = refreshTokenStore.get(refreshToken);
        if (!tokenData) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token'
            });
        }

        // Check expiry
        if (Date.now() > tokenData.expiresAt) {
            refreshTokenStore.delete(refreshToken);
            return res.status(401).json({
                success: false,
                error: 'Refresh token expired'
            });
        }

        // Find user
        const userKey = `${tokenData.tenantId}:${tokenData.email}`;
        const user = userStore.get(userKey);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        // Generate new access token
        const accessToken = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                tenantId: user.tenantId,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        res.json({
            success: true,
            accessToken
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Token refresh failed'
        });
    }
});

/**
 * POST /api/v1/auth/logout
 * Logout and invalidate refresh token
 */
router.post('/logout', (req, res) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
        refreshTokenStore.delete(refreshToken);
    }

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * GET /api/v1/auth/me
 * Get current user info (requires auth)
 */
router.get('/me', authenticateToken, (req, res) => {
    const userKey = `${req.user.tenantId}:${req.user.email}`;
    const user = userStore.get(userKey);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'User not found'
        });
    }

    res.json({
        success: true,
        user: sanitizeUser(user)
    });
});

/**
 * Authentication middleware
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.userId = decoded.userId;
        req.tenantId = decoded.tenantId;
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
}

/**
 * Generate access and refresh tokens
 */
function generateTokens(user) {
    const accessToken = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            tenantId: user.tenantId,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');

    // Store refresh token
    refreshTokenStore.set(refreshToken, {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        expiresAt: Date.now() + REFRESH_TOKEN_EXPIRY
    });

    return { accessToken, refreshToken };
}

/**
 * Remove sensitive data from user object
 */
function sanitizeUser(user) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
}

// Export middleware for use in other routes
module.exports = router;
module.exports.authenticateToken = authenticateToken;
