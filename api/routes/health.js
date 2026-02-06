const express = require('express');
const router = express.Router();
const db = require('../../core/database/connection');

router.get('/', async (req, res) => {
  try {
    const dbCheck = await db.query('SELECT NOW() as time');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      tenant: {
        id: req.tenant.id,
        name: req.tenant.name,
        vertical: req.tenant.vertical,
        features: req.tenant.features
      },
      database: {
        connected: true,
        time: dbCheck.rows[0].time
      },
      version: require('../../package.json').version
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
