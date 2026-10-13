const express = require('express');
const router = express.Router();
const {
  sapGet,
  escapeOData,
  toIsoDate
} = require('../sap');

const CUSTOMER_SERVICE = 'API_BUSINESS_PARTNER';

function checkedAt() {
  return new Date().toISOString();
}

function sendSapError(res, err, notFoundMessage) {
  if (err && err.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: notFoundMessage,
        sapCode: err.sapCode || null
      }
    });
  }

  return res.status(503).json({
    error: {
      code: 'SAP_UNAVAILABLE',
      message: 'SAP is not responding. Please try again or use the manual process.',
      sapCode: (err && err.sapCode) || null
    }
  });
}

function stringBlock(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function normalizeSalesRows(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (Array.isArray(value.results)) return value.results;
  if (value.d) {
    if (Array.isArray(value.d.results)) return value.d.results;
    if (value.d && typeof value.d === 'object') return [value.d];
  }
  if (value.SalesOrganization || value.DistributionChannel || value.Division) {
    return [value];
  }
  return [];
}

router.get('/search', async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Please enter a name before checking SAP.',
        sapCode: null
      }
    });
  }

  try {
    const rows = await sapGet(CUSTOMER_SERVICE, 'A_Customer', {
      $filter: `substringof('${escapeOData(name)}',CustomerName)`,
      $top: '20',
      $select: 'Customer,CustomerName,CustomerFullName,OrderIsBlockedForCustomer,DeliveryIsBlocked,BillingIsBlockedForCustomer,PostingIsBlocked,DeletionIndicator'
    });

    const results = (Array.isArray(rows) ? rows : (rows ? [rows] : [])).map((row) => ({
      customerId: row.Customer,
      name: row.CustomerName,
      fullName: row.CustomerFullName,
      isBlocked: stringBlock(row.OrderIsBlockedForCustomer)
        || stringBlock(row.DeliveryIsBlocked)
        || stringBlock(row.BillingIsBlockedForCustomer)
        || stringBlock(row.PostingIsBlocked)
    }));

    return res.json({
      results,
      source: 'live',
      checkedAt: checkedAt()
    });
  } catch (err) {
    return sendSapError(res, err, 'Customer ID not found. Please check the number or search by name.');
  }
});

router.get('/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Please enter a customer number before checking SAP.',
        sapCode: null
      }
    });
  }

  let customer;
  try {
    try {
      customer = await sapGet(CUSTOMER_SERVICE, `A_Customer('${escapeOData(id)}')`, {
        $expand: 'to_CustomerSalesArea'
      });
    } catch (expandError) {
      // A not-found customer must still return NOT_FOUND. Other expand
      // problems fall back to separate customer and sales-area calls.
      if (expandError && expandError.code === 'NOT_FOUND') {
        throw expandError;
      }
      customer = await sapGet(CUSTOMER_SERVICE, `A_Customer('${escapeOData(id)}')`);
    }
  } catch (err) {
    return sendSapError(res, err, 'Customer ID not found. Please check the number or search by name.');
  }

  if (!customer) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Customer ID not found. Please check the number or search by name.',
        sapCode: null
      }
    });
  }

  let salesRows = normalizeSalesRows(customer.to_CustomerSalesArea);
  if (salesRows.length === 0) {
    try {
      const nav = await sapGet(CUSTOMER_SERVICE, `A_Customer('${escapeOData(id)}')/to_CustomerSalesArea`);
      salesRows = normalizeSalesRows(nav);
    } catch (navError) {
      if (navError && navError.code === 'NOT_FOUND') {
        return sendSapError(res, navError, 'Customer ID not found. Please check the number or search by name.');
      }
      return sendSapError(res, navError, 'Customer ID not found. Please check the number or search by name.');
    }
  }

  const salesAreas = salesRows.map((row) => ({
    salesOrg: row.SalesOrganization,
    distributionChannel: row.DistributionChannel,
    division: row.Division,
    paymentTerms: row.CustomerPaymentTerms,
    currency: row.Currency || row.TransactionCurrency || null,
    supplyingPlant: row.SupplyingPlant
  }));

  const blockOrder = stringBlock(customer.OrderIsBlockedForCustomer);
  const blockDelivery = stringBlock(customer.DeliveryIsBlocked);
  const blockBilling = stringBlock(customer.BillingIsBlockedForCustomer);
  const blockPosting = stringBlock(customer.PostingIsBlocked);

  return res.json({
    customerId: customer.Customer,
    name: customer.CustomerName,
    fullName: customer.CustomerFullName,
    blocks: {
      order: blockOrder,
      delivery: blockDelivery,
      billing: blockBilling,
      posting: blockPosting
    },
    isBlocked: blockOrder || blockDelivery || blockBilling || blockPosting,
    isDeleted: stringBlock(customer.DeletionIndicator),
    salesAreas,
    source: 'live',
    checkedAt: checkedAt()
  });
});

module.exports = router;
