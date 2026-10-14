const express = require('express');
const router = express.Router();
const {
  sapGet,
  escapeOData,
  toIsoDate
} = require('../sap');

const QUOTATION_SERVICE = 'API_SALES_QUOTATION_SRV';

function checkedAt() {
  return new Date().toISOString();
}

function sendSapError(res, err, notFoundMessage) {
  if (err && err.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: notFoundMessage, sapCode: err.sapCode || null }
    });
  }
  return res.status(503).json({
    error: { code: 'SAP_UNAVAILABLE', message: 'SAP is not responding. Please try again or use the manual process.', sapCode: (err && err.sapCode) || null }
  });
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : (rows ? [rows] : []);
}

function statusText(status) {
  if (status === 'A') return 'Not yet processed';
  if (status === 'B') return 'Partially processed';
  if (status === 'C') return 'Completely processed';
  return 'Unknown';
}

function isExpired(validTo) {
  if (!validTo) return false;
  const today = new Date().toISOString().slice(0, 10);
  return validTo < today;
}

router.get('/', async (req, res) => {
  const customerId = String(req.query.customerId || '').trim();
  if (!customerId) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Please enter a customer ID before checking SAP.', sapCode: null }
    });
  }

  try {
    const rows = await sapGet(QUOTATION_SERVICE, 'A_SalesQuotation', {
      $filter: `SoldToParty eq '${escapeOData(customerId)}'`,
      $top: '20',
      $select: 'SalesQuotation,SalesQuotationDate,BindingPeriodValidityEndDate,TotalNetAmount,TransactionCurrency,OverallSDProcessStatus'
    });

    const results = normalizeRows(rows).map((row) => ({
      quotationId: row.SalesQuotation,
      date: toIsoDate(row.SalesQuotationDate),
      validTo: toIsoDate(row.BindingPeriodValidityEndDate),
      isExpired: isExpired(toIsoDate(row.BindingPeriodValidityEndDate)),
      totalNet: parseFloat(row.TotalNetAmount),
      currency: row.TransactionCurrency,
      processStatus: row.OverallSDProcessStatus
    }));

    return res.json({ results, source: 'live', checkedAt: checkedAt() });
  } catch (err) {
    return sendSapError(res, err, 'Quotation not found. Please check the quote number.');
  }
});

async function fetchQuotation(id) {
  const key = escapeOData(id);
  try {
    return await sapGet(QUOTATION_SERVICE, `A_SalesQuotation('${key}')`, {
      $expand: 'to_Item'
    });
  } catch (primaryError) {
    // Contract fallback: if the direct request behaves unexpectedly, check
    // whether the quotation exists through a filtered collection request.
    let fallbackRows = [];
    try {
      fallbackRows = await sapGet(QUOTATION_SERVICE, 'A_SalesQuotation', {
        $filter: `SalesQuotation eq '${key}'`,
        $top: '1',
        $select: 'SalesQuotation'
      });
    } catch (fallbackError) {
      throw primaryError;
    }

    if (!Array.isArray(fallbackRows) || fallbackRows.length === 0) {
      const notFound = new Error('NOT_FOUND');
      notFound.code = 'NOT_FOUND';
      notFound.sapCode = primaryError.sapCode || null;
      throw notFound;
    }

    // The fallback only confirms existence. Retry the expanded request once.
    return sapGet(QUOTATION_SERVICE, `A_SalesQuotation('${key}')`, {
      $expand: 'to_Item'
    });
  }
}

router.get('/:id/items/:itemNo/pricing', async (req, res) => {
  const id = String(req.params.id || '').trim();
  const itemNo = String(req.params.itemNo || '').trim();
  if (!id || !itemNo) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Please enter the quotation number before checking SAP.', sapCode: null }
    });
  }

  try {
    const rows = await sapGet(QUOTATION_SERVICE, `A_SalesQuotationItem(SalesQuotation='${escapeOData(id)}',SalesQuotationItem='${escapeOData(itemNo)}')/to_PricingElement`);
    const elements = normalizeRows(rows);
    const price = elements.find((element) => element.ConditionType === 'PPR0');

    if (!price) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Pricing was not found for this quotation item.', sapCode: null }
      });
    }

    return res.json({
      unitPrice: parseFloat(price.ConditionRateValue),
      currency: price.ConditionCurrency,
      priceUnit: price.ConditionQuantityUnit,
      manuallyChanged: price.ConditionIsManuallyChanged === true,
      source: 'live',
      checkedAt: checkedAt()
    });
  } catch (err) {
    return sendSapError(res, err, 'Quotation not found. Please check the quote number.');
  }
});

router.get('/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Please enter the quotation number before checking SAP.', sapCode: null }
    });
  }

  try {
    const quote = await fetchQuotation(id);

    const validFrom = toIsoDate(quote.BindingPeriodValidityStartDate);
    const validTo = toIsoDate(quote.BindingPeriodValidityEndDate);
    const itemRows = normalizeRows(quote.to_Item && quote.to_Item.results ? quote.to_Item.results : (Array.isArray(quote.to_Item) ? quote.to_Item : []));

    const items = itemRows.map((item) => ({
      itemNo: item.SalesQuotationItem,
      material: item.Material,
      description: item.SalesQuotationItemText,
      qty: parseFloat(item.RequestedQuantity),
      unit: item.RequestedQuantityUnit,
      netAmount: parseFloat(item.NetAmount),
      plant: item.Plant,
      processStatus: item.SDProcessStatus,
      isRejected: String(item.SalesDocumentRjcnReason || '').trim() !== '',
      rejectionReason: item.SalesDocumentRjcnReason == null ? '' : String(item.SalesDocumentRjcnReason)
    }));

    return res.json({
      quotationId: quote.SalesQuotation,
      customerId: quote.SoldToParty,
      salesOrg: quote.SalesOrganization,
      date: toIsoDate(quote.SalesQuotationDate),
      validFrom,
      validTo,
      isExpired: isExpired(validTo),
      totalNet: parseFloat(quote.TotalNetAmount),
      currency: quote.TransactionCurrency,
      paymentTerms: quote.CustomerPaymentTerms,
      processStatus: quote.OverallSDProcessStatus,
      processStatusText: statusText(quote.OverallSDProcessStatus),
      items,
      source: 'live',
      checkedAt: checkedAt()
    });
  } catch (err) {
    return sendSapError(res, err, 'Quotation not found. Please check the quote number.');
  }
});

module.exports = router;
