const express = require('express');
const router = express.Router();
const { sapGet, escapeOData } = require('../sap');

const PRODUCT_SERVICE = 'API_PRODUCT_SRV';

function checkedAt() {
  return new Date().toISOString();
}

function sendSapError(res, err) {
  if (err && err.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Product not found. Try a different name.', sapCode: err.sapCode || null }
    });
  }
  return res.status(503).json({
    error: { code: 'SAP_UNAVAILABLE', message: 'SAP is not responding. Please try again or use the manual process.', sapCode: (err && err.sapCode) || null }
  });
}

router.get('/search', async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Please enter a product name before checking SAP.', sapCode: null }
    });
  }

  try {
    const rows = await sapGet(PRODUCT_SERVICE, 'A_ProductDescription', {
      $filter: `Language eq 'EN' and substringof('${escapeOData(name)}',ProductDescription)`,
      $top: '20',
      $select: 'Product,ProductDescription'
    });

    const results = (Array.isArray(rows) ? rows : (rows ? [rows] : [])).map((row) => ({
      productId: row.Product,
      description: row.ProductDescription
    }));

    return res.json({
      results,
      tooMany: results.length === 20,
      source: 'live',
      checkedAt: checkedAt()
    });
  } catch (err) {
    return sendSapError(res, err);
  }
});

module.exports = router;
