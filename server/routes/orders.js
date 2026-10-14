const express = require('express');
const router = express.Router();
const { sapGet, escapeOData, toIsoDate } = require('../sap');

const ORDER_SERVICE = 'API_SALES_ORDER_SRV';

function checkedAt() {
  return new Date().toISOString();
}

function sendSapError(res, err) {
  if (err && err.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Quotation not found. Please check the quote number.', sapCode: err.sapCode || null }
    });
  }
  return res.status(503).json({
    error: { code: 'SAP_UNAVAILABLE', message: 'SAP is not responding. Please try again or use the manual process.', sapCode: (err && err.sapCode) || null }
  });
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : (rows ? [rows] : []);
}

router.get('/by-quotation/:quotationId?', async (req, res) => {
  const quotationId = String(req.params.quotationId || '').trim();
  if (!quotationId) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Please enter a quotation number before checking SAP.', sapCode: null }
    });
  }

  try {
    const itemRows = normalizeRows(await sapGet(ORDER_SERVICE, 'A_SalesOrderItem', {
      $filter: `ReferenceSDDocument eq '${escapeOData(quotationId)}'`,
      $select: 'SalesOrder,SalesOrderItem,Material,SalesOrderItemText,RequestedQuantity,NetAmount,SDProcessStatus,DeliveryStatus'
    }));

    if (itemRows.length === 0) {
      return res.json({
        quotationId,
        converted: false,
        orders: [],
        source: 'live',
        checkedAt: checkedAt()
      });
    }

    // Query each distinct order header only once, then sort for stable output.
    const orderIds = [...new Set(itemRows.map((row) => String(row.SalesOrder)))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    const headers = await Promise.all(orderIds.map((orderId) =>
      sapGet(ORDER_SERVICE, `A_SalesOrder('${escapeOData(orderId)}')`, {
        $select: 'SalesOrder,SalesOrderDate,TotalNetAmount,TransactionCurrency,OverallSDProcessStatus,OverallDeliveryStatus'
      })
    ));

    const headerMap = new Map(headers.map((header) => [String(header.SalesOrder), header]));
    const orderItems = new Map();

    for (const item of itemRows) {
      const orderId = String(item.SalesOrder);
      if (!orderItems.has(orderId)) orderItems.set(orderId, []);
      orderItems.get(orderId).push({
        itemNo: item.SalesOrderItem,
        material: item.Material,
        description: item.SalesOrderItemText,
        qty: parseFloat(item.RequestedQuantity),
        netAmount: parseFloat(item.NetAmount),
        deliveryStatus: item.DeliveryStatus
      });
    }

    const orders = orderIds.map((orderId) => {
      const header = headerMap.get(orderId);
      const status = header ? header.OverallDeliveryStatus : '';
      return {
        salesOrderId: orderId,
        orderDate: header ? toIsoDate(header.SalesOrderDate) : null,
        totalNet: header ? parseFloat(header.TotalNetAmount) : null,
        currency: header ? header.TransactionCurrency : null,
        processStatus: header ? header.OverallSDProcessStatus : null,
        deliveryStatus: status,
        fullyDelivered: status === 'C',
        items: orderItems.get(orderId) || []
      };
    });

    return res.json({
      quotationId,
      converted: true,
      orders,
      source: 'live',
      checkedAt: checkedAt()
    });
  } catch (err) {
    return sendSapError(res, err);
  }
});

module.exports = router;
