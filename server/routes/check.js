const express = require('express');
const router = express.Router();
const {
  sapGet,
  escapeOData,
  toIsoDate
} = require('../sap');
const { evaluate } = require('../rules');

const CUSTOMER_SERVICE = 'API_BUSINESS_PARTNER';
const PRODUCT_SERVICE = 'API_PRODUCT_SRV';
const STOCK_SERVICE = 'API_MATERIAL_STOCK_SRV';
const QUOTATION_SERVICE = 'API_SALES_QUOTATION_SRV';
const ORDER_SERVICE = 'API_SALES_ORDER_SRV';
const STOCK_SELECT = 'Material,Plant,StorageLocation,Batch,InventoryStockType,InventorySpecialStockType,MatlWrhsStkQtyInMatlBaseUnit,MaterialBaseUnit';

function checkedAt() {
  return new Date().toISOString();
}

function sendSapError(res, err, notFoundMessage) {
  const message = (err && err.notFoundMessage) || notFoundMessage;
  if (err && err.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message, sapCode: err.sapCode || null }
    });
  }
  return res.status(503).json({
    error: { code: 'SAP_UNAVAILABLE', message: 'SAP is not responding. Please try again or use the manual process.', sapCode: (err && err.sapCode) || null }
  });
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : (rows ? [rows] : []);
}

function parseNumber(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function stringBlock(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function mapCustomer(raw) {
  let salesRows = [];
  const relation = raw.to_CustomerSalesArea;
  if (Array.isArray(relation)) salesRows = relation;
  else if (relation && Array.isArray(relation.results)) salesRows = relation.results;
  else if (relation && relation.d && Array.isArray(relation.d.results)) salesRows = relation.d.results;

  const blockOrder = stringBlock(raw.OrderIsBlockedForCustomer);
  const blockDelivery = stringBlock(raw.DeliveryIsBlocked);
  const blockBilling = stringBlock(raw.BillingIsBlockedForCustomer);
  const blockPosting = stringBlock(raw.PostingIsBlocked);

  return {
    customerId: raw.Customer,
    name: raw.CustomerName,
    fullName: raw.CustomerFullName,
    blocks: {
      order: blockOrder,
      delivery: blockDelivery,
      billing: blockBilling,
      posting: blockPosting
    },
    isBlocked: blockOrder || blockDelivery || blockBilling || blockPosting,
    isDeleted: stringBlock(raw.DeletionIndicator),
    salesAreas: salesRows.map((row) => ({
      salesOrg: row.SalesOrganization,
      distributionChannel: row.DistributionChannel,
      division: row.Division,
      paymentTerms: row.CustomerPaymentTerms,
      currency: row.Currency || row.TransactionCurrency || null,
      supplyingPlant: row.SupplyingPlant
    }))
  };
}

async function fetchCustomer(customerId) {
  if (!customerId) return null;
  try {
    const raw = await sapGet(CUSTOMER_SERVICE, `A_Customer('${escapeOData(customerId)}')`, {
      $expand: 'to_CustomerSalesArea'
    });
    return mapCustomer(raw);
  } catch (err) {
    err.notFoundMessage = 'Customer ID not found. Please check the number or search by name.';
    throw err;
  }
}

async function productDescription(productId) {
  try {
    const rows = await sapGet(PRODUCT_SERVICE, 'A_ProductDescription', {
      $filter: `Language eq 'EN' and Product eq '${escapeOData(productId)}'`,
      $top: '1',
      $select: 'Product,ProductDescription'
    });
    const row = normalizeRows(rows)[0];
    if (row && row.ProductDescription) return row.ProductDescription;
  } catch (err) {
    // Keep the product identifier if SAP does not return a description.
  }
  return productId;
}

async function fetchStockEntry(material, description, plant, required) {
  const storeRows = normalizeRows(await sapGet(STOCK_SERVICE, 'A_MatlStkInAcctMod', {
    $filter: `Material eq '${escapeOData(material)}' and Plant eq '${escapeOData(plant)}'`,
    $select: STOCK_SELECT
  }));

  const storeLines = storeRows.map((row) => ({
    plant: row.Plant,
    storageLocation: row.StorageLocation,
    batch: row.Batch != null ? String(row.Batch) : '',
    stockType: row.InventoryStockType != null ? String(row.InventoryStockType) : '',
    specialStockType: row.InventorySpecialStockType != null ? String(row.InventorySpecialStockType) : '',
    qty: parseNumber(row.MatlWrhsStkQtyInMatlBaseUnit)
  }));
  const unrestrictedQty = storeLines
    .filter((line) => line.stockType === '01' && line.specialStockType === '')
    .reduce((total, line) => total + line.qty, 0);

  let unit = storeRows.length ? (storeRows[0].MaterialBaseUnit || null) : null;
  let otherPlants = [];

  if (unrestrictedQty < required) {
    const allRows = normalizeRows(await sapGet(STOCK_SERVICE, 'A_MatlStkInAcctMod', {
      $filter: `Material eq '${escapeOData(material)}'`,
      $select: STOCK_SELECT
    }));
    const byPlant = new Map();
    for (const row of allRows) {
      if (String(row.Plant) === String(plant)) continue;
      const qty = parseNumber(row.MatlWrhsStkQtyInMatlBaseUnit);
      const stockType = row.InventoryStockType != null ? String(row.InventoryStockType) : '';
      const specialStockType = row.InventorySpecialStockType != null ? String(row.InventorySpecialStockType) : '';
      if (!byPlant.has(row.Plant)) {
        byPlant.set(row.Plant, { unrestrictedQty: 0, unit: row.MaterialBaseUnit || null });
      }
      const entry = byPlant.get(row.Plant);
      if (!entry.unit && row.MaterialBaseUnit) entry.unit = row.MaterialBaseUnit;
      if (stockType === '01' && specialStockType === '') entry.unrestrictedQty += qty;
    }
    otherPlants = Array.from(byPlant.entries())
      .map(([plantName, entry]) => ({
        plant: plantName,
        unrestrictedQty: entry.unrestrictedQty,
        unit: entry.unit
      }))
      .sort((a, b) => b.unrestrictedQty - a.unrestrictedQty);

    if (!unit && allRows.length) unit = allRows[0].MaterialBaseUnit || null;
  }

  return {
    material,
    description: description || material,
    plant,
    required,
    unrestrictedQty,
    unit,
    sufficient: unrestrictedQty >= required,
    otherPlants
  };
}

async function fetchQuotation(quotationId) {
  const key = escapeOData(quotationId);
  try {
    return await sapGet(QUOTATION_SERVICE, `A_SalesQuotation('${key}')`, {
      $expand: 'to_Item'
    });
  } catch (primaryError) {
    let fallbackRows = [];
    try {
      fallbackRows = await sapGet(QUOTATION_SERVICE, 'A_SalesQuotation', {
        $filter: `SalesQuotation eq '${key}'`,
        $top: '1',
        $select: 'SalesQuotation'
      });
    } catch (fallbackError) {
      primaryError.notFoundMessage = 'Quotation not found. Please check the quote number.';
      throw primaryError;
    }
    if (!Array.isArray(fallbackRows) || fallbackRows.length === 0) {
      const notFound = new Error('NOT_FOUND');
      notFound.code = 'NOT_FOUND';
      notFound.sapCode = primaryError.sapCode || null;
      notFound.notFoundMessage = 'Quotation not found. Please check the quote number.';
      throw notFound;
    }
    return sapGet(QUOTATION_SERVICE, `A_SalesQuotation('${key}')`, {
      $expand: 'to_Item'
    });
  }
}

function mapQuotation(raw) {
  const validTo = toIsoDate(raw.BindingPeriodValidityEndDate);
  const validFrom = toIsoDate(raw.BindingPeriodValidityStartDate);
  const itemRows = normalizeRows(raw.to_Item && raw.to_Item.results ? raw.to_Item.results : (Array.isArray(raw.to_Item) ? raw.to_Item : []));

  const items = itemRows.map((item) => ({
    itemNo: item.SalesQuotationItem,
    material: item.Material,
    description: item.SalesQuotationItemText,
    qty: parseNumber(item.RequestedQuantity),
    unit: item.RequestedQuantityUnit,
    netAmount: parseNumber(item.NetAmount),
    plant: item.Plant,
    processStatus: item.SDProcessStatus,
    isRejected: String(item.SalesDocumentRjcnReason || '').trim() !== '',
    rejectionReason: item.SalesDocumentRjcnReason == null ? '' : String(item.SalesDocumentRjcnReason)
  }));

  return {
    quotationId: raw.SalesQuotation,
    customerId: raw.SoldToParty,
    salesOrg: raw.SalesOrganization,
    date: toIsoDate(raw.SalesQuotationDate),
    validFrom,
    validTo,
    isExpired: validTo ? validTo < new Date().toISOString().slice(0, 10) : false,
    totalNet: parseNumber(raw.TotalNetAmount),
    currency: raw.TransactionCurrency,
    paymentTerms: raw.CustomerPaymentTerms,
    processStatus: raw.OverallSDProcessStatus,
    processStatusText: raw.OverallSDProcessStatus === 'A' ? 'Not yet processed' : (raw.OverallSDProcessStatus === 'B' ? 'Partially processed' : (raw.OverallSDProcessStatus === 'C' ? 'Completely processed' : 'Unknown')),
    items
  };
}

async function getOrdersByQuotation(quotationId) {
  const key = escapeOData(quotationId);
  const itemRows = normalizeRows(await sapGet(ORDER_SERVICE, 'A_SalesOrderItem', {
    $filter: `ReferenceSDDocument eq '${key}'`,
    $select: 'SalesOrder,SalesOrderItem,Material,SalesOrderItemText,RequestedQuantity,NetAmount,SDProcessStatus,DeliveryStatus'
  }));

  if (itemRows.length === 0) {
    return { converted: false, orders: [] };
  }

  const orderIds = [...new Set(itemRows.map((row) => String(row.SalesOrder)))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const headers = await Promise.all(orderIds.map((orderId) =>
    sapGet(ORDER_SERVICE, `A_SalesOrder('${escapeOData(orderId)}')`, {
      $select: 'SalesOrder,SalesOrderDate,TotalNetAmount,TransactionCurrency,OverallSDProcessStatus,OverallDeliveryStatus'
    })
  ));
  const headerMap = new Map(headers.map((header) => [String(header.SalesOrder), header]));
  const groupedItems = new Map();

  for (const item of itemRows) {
    const orderId = String(item.SalesOrder);
    if (!groupedItems.has(orderId)) groupedItems.set(orderId, []);
    groupedItems.get(orderId).push({
      itemNo: item.SalesOrderItem,
      material: item.Material,
      description: item.SalesOrderItemText,
      qty: parseNumber(item.RequestedQuantity),
      netAmount: parseNumber(item.NetAmount),
      deliveryStatus: item.DeliveryStatus
    });
  }

  const orders = orderIds.map((orderId) => {
    const header = headerMap.get(orderId);
    const deliveryStatus = header ? header.OverallDeliveryStatus : '';
    return {
      salesOrderId: orderId,
      orderDate: header ? toIsoDate(header.SalesOrderDate) : null,
      totalNet: header ? parseNumber(header.TotalNetAmount) : null,
      currency: header ? header.TransactionCurrency : null,
      processStatus: header ? header.OverallSDProcessStatus : null,
      deliveryStatus,
      fullyDelivered: deliveryStatus === 'C',
      items: groupedItems.get(orderId) || []
    };
  });

  return { converted: true, orders };
}

function normalizePathway(value) {
  return String(value || '').trim().toUpperCase();
}

function hasPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

router.post('/', async (req, res) => {
  const pathway = normalizePathway(req.body && req.body.pathway);
  const defaultPlant = String(process.env.DEFAULT_PLANT || '1710').trim() || '1710';
  const plant = String((req.body && req.body.plant) || defaultPlant).trim() || defaultPlant;

  if (!['STANDARD_RETAIL', 'TRADE', 'SPECIAL_ORDER'].includes(pathway)) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Please choose a valid enquiry pathway.', sapCode: null }
    });
  }

  const productId = req.body && req.body.productId != null ? String(req.body.productId).trim() : '';
  const requestedQty = req.body ? req.body.requestedQty : null;
  const customerId = req.body && req.body.customerId != null ? String(req.body.customerId).trim() : '';
  const quotationId = req.body && req.body.quotationId != null ? String(req.body.quotationId).trim() : '';

  try {
    if (pathway === 'STANDARD_RETAIL') {
      if (!productId || !hasPositiveNumber(requestedQty)) {
        return res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'Please enter a product and quantity before checking SAP.', sapCode: null }
        });
      }
      const qty = Number(requestedQty);
      const description = await productDescription(productId);
      const stock = [await fetchStockEntry(productId, description, plant, qty)];
      const result = evaluate({ pathway, customer: null, quotation: null, stock, orders: null });
      return res.json({
        pathway,
        customer: null,
        quotation: null,
        stock,
        orders: null,
        flags: result.flags,
        recommendation: result.recommendation,
        source: 'live',
        checkedAt: checkedAt()
      });
    }

    if (pathway === 'TRADE') {
      if (!customerId || !quotationId) {
        return res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'Please enter a customer and quotation before checking SAP.', sapCode: null }
        });
      }
      const customer = await fetchCustomer(customerId);
      const quotation = mapQuotation(await fetchQuotation(quotationId));

      if (quotation.customerId && quotation.customerId !== customer.customerId) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'This quotation belongs to a different customer. Please select a quotation for the chosen customer.',
            sapCode: null
          }
        });
      }

      const orders = await getOrdersByQuotation(quotationId);
      const stock = [];

      for (const item of quotation.items.filter((entry) => !entry.isRejected)) {
        const itemQty = hasPositiveNumber(item.qty) ? Number(item.qty) : 0;
        if (itemQty <= 0) continue;
        stock.push(await fetchStockEntry(item.material, item.description, plant, itemQty));
      }

      const result = evaluate({ pathway, customer, quotation, stock, orders });
      return res.json({
        pathway,
        customer,
        quotation,
        stock,
        orders,
        flags: result.flags,
        recommendation: result.recommendation,
        source: 'live',
        checkedAt: checkedAt()
      });
    }

    // SPECIAL_ORDER
    const hasProduct = Boolean(productId && hasPositiveNumber(requestedQty));
    const hasQuotation = Boolean(quotationId);
    if (!hasProduct && !hasQuotation) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Please enter a product and quantity, or a quotation, before checking SAP.', sapCode: null }
      });
    }

    let customer = null;
    let quotation = null;
    let orders = null;
    const stock = [];

    if (customerId) {
      customer = await fetchCustomer(customerId);
    }

    if (hasProduct) {
      const description = await productDescription(productId);
      stock.push(await fetchStockEntry(productId, description, plant, Number(requestedQty)));
    }

    if (hasQuotation) {
      quotation = mapQuotation(await fetchQuotation(quotationId));

      if (customer && quotation.customerId && quotation.customerId !== customer.customerId) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'This quotation belongs to a different customer. Please select a quotation for the chosen customer.',
            sapCode: null
          }
        });
      }

      orders = await getOrdersByQuotation(quotationId);
      if (!customer && quotation.customerId) {
        try {
          customer = await fetchCustomer(quotation.customerId);
        } catch (err) {
          customer = null;
        }
      }
      for (const item of quotation.items.filter((entry) => !entry.isRejected)) {
        const itemQty = hasPositiveNumber(item.qty) ? Number(item.qty) : 0;
        if (itemQty <= 0) continue;
        stock.push(await fetchStockEntry(item.material, item.description, plant, itemQty));
      }
    }

    const result = evaluate({ pathway, customer, quotation, stock, orders });
    return res.json({
      pathway,
      customer,
      quotation,
      stock,
      orders,
      flags: result.flags,
      recommendation: result.recommendation,
      source: 'live',
      checkedAt: checkedAt()
    });
  } catch (err) {
    if (quotationId && err && err.code === 'NOT_FOUND' && !err.notFoundMessage) {
      err.notFoundMessage = 'Quotation not found. Please check the quote number.';
    }
    if (customerId && err && err.code === 'NOT_FOUND' && !err.notFoundMessage) {
      err.notFoundMessage = 'Customer ID not found. Please check the number or search by name.';
    }
    return sendSapError(res, err, 'SAP is not responding. Please try again or use the manual process.');
  }
});

module.exports = router;
