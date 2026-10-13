const express = require('express');
const router = express.Router();
const { sapGet, escapeOData } = require('../sap');

const STOCK_SERVICE = 'API_MATERIAL_STOCK_SRV';
const STOCK_SELECT = 'Material,Plant,StorageLocation,Batch,InventoryStockType,InventorySpecialStockType,MatlWrhsStkQtyInMatlBaseUnit,MaterialBaseUnit';

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

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : (rows ? [rows] : []);
}

function mappedLine(row) {
  return {
    plant: row.Plant,
    storageLocation: row.StorageLocation,
    batch: row.Batch != null ? String(row.Batch) : '',
    stockType: row.InventoryStockType != null ? String(row.InventoryStockType) : '',
    specialStockType: row.InventorySpecialStockType != null ? String(row.InventorySpecialStockType) : '',
    qty: parseFloat(row.MatlWrhsStkQtyInMatlBaseUnit)
  };
}

function isSellable(line) {
  return line.stockType === '01' && line.specialStockType === '';
}

router.get('/', async (req, res) => {
  const material = String(req.query.material || '').trim();
  if (!material) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Please enter a material before checking SAP.', sapCode: null }
    });
  }

  const plant = String(req.query.plant || '').trim();
  try {
    const filter = plant
      ? `Material eq '${escapeOData(material)}' and Plant eq '${escapeOData(plant)}'`
      : `Material eq '${escapeOData(material)}'`;

    const params = { $filter: filter, $select: STOCK_SELECT };
    const rawRows = await sapGet(STOCK_SERVICE, 'A_MatlStkInAcctMod', params);
    const rows = normalizeRows(rawRows);
    const lines = rows.map(mappedLine);

    if (plant) {
      const unrestrictedQty = lines
        .filter(isSellable)
        .reduce((total, line) => total + (Number.isFinite(line.qty) ? line.qty : 0), 0);
      const unit = rawRows.length ? (rawRows[0].MaterialBaseUnit || null) : null;

      return res.json({
        material,
        plant,
        unrestrictedQty,
        unit,
        lines,
        source: 'live',
        checkedAt: checkedAt()
      });
    }

    const byPlant = new Map();
    for (let i = 0; i < rows.length; i += 1) {
      const line = lines[i];
      const unit = rawRows[i].MaterialBaseUnit || null;
      if (!byPlant.has(line.plant)) {
        byPlant.set(line.plant, { unrestrictedQty: 0, unit });
      }
      const entry = byPlant.get(line.plant);
      if (!entry.unit && unit) entry.unit = unit;
      if (isSellable(line) && Number.isFinite(line.qty)) {
        entry.unrestrictedQty += line.qty;
      }
    }

    const plants = Array.from(byPlant.entries())
      .map(([plantName, entry]) => ({
        plant: plantName,
        unrestrictedQty: entry.unrestrictedQty,
        unit: entry.unit
      }))
      .sort((a, b) => b.unrestrictedQty - a.unrestrictedQty);

    return res.json({
      material,
      plants,
      lines,
      source: 'live',
      checkedAt: checkedAt()
    });
  } catch (err) {
    return sendSapError(res, err);
  }
});

module.exports = router;
