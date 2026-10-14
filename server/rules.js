function number(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return number(value).toLocaleString('en-US');
}

function hasSpecialist(flags) {
  return flags.some((flag) => flag.severity === 'SPECIALIST');
}

function hasFollowUp(flags) {
  return flags.some((flag) => flag.severity === 'FOLLOW_UP');
}

function evaluate(data) {
  const input = data || {};
  const flags = [];
  const customer = input.customer || null;
  const quotation = input.quotation || null;
  const stock = Array.isArray(input.stock) ? input.stock : [];
  const orders = input.orders || null;

  // R1: account status must be checked before quote rules.
  if (customer && (customer.isBlocked || customer.isDeleted)) {
    flags.push({
      rule: 'R1',
      severity: 'SPECIALIST',
      message: 'Customer account is blocked. Refer to a Trade specialist.'
    });
  }

  const converted = orders && orders.converted === true;
  const allOrders = Array.isArray(orders && orders.orders) ? orders.orders : [];

  // R2 runs before R3. A converted quotation does not need a re-quote.
  if (quotation && converted) {
    const allDelivered = allOrders.length > 0 && allOrders.every((order) => order.fullyDelivered === true);
    if (allDelivered) {
      const orderIds = allOrders.map((order) => order.salesOrderId).join(', ');
      flags.push({
        rule: 'R2',
        severity: 'INFO',
        message: allOrders.length === 1
          ? `Order ${orderIds} is fully delivered.`
          : `Orders ${orderIds} are fully delivered.`
      });
    } else {
      const orderIds = allOrders.map((order) => order.salesOrderId).join(', ') || 'this';
      flags.push({
        rule: 'R2',
        severity: 'FOLLOW_UP',
        message: allOrders.length === 1
          ? `Order ${orderIds} is not fully delivered.`
          : `Orders ${orderIds} are not fully delivered.`
      });
    }
  }

  // R3: expired quote only when it has not already been converted.
  if (quotation && !converted && quotation.isExpired) {
    flags.push({
      rule: 'R3',
      severity: 'FOLLOW_UP',
      action: 'REQUOTE',
      message: `Quotation expired on ${quotation.validTo}. A new quote is required.`
    });
  }

  // R4: every rejected quotation item.
  if (quotation && Array.isArray(quotation.items)) {
    for (const item of quotation.items) {
      if (item.isRejected) {
        const reason = item.rejectionReason ? ` (reason ${item.rejectionReason})` : '';
        flags.push({
          rule: 'R4',
          severity: 'FOLLOW_UP',
          action: 'CHECK_REJECTION',
          message: `Item ${item.itemNo} (${item.description}) was rejected${reason}.`
        });
      }
    }
  }

  // R5: stock shortages and transfer/special-order options.
  for (const entry of stock) {
    const required = number(entry.required);
    const storeStock = number(entry.unrestrictedQty);
    if (storeStock >= required) continue;

    const suitablePlant = Array.isArray(entry.otherPlants)
      ? entry.otherPlants.find((plant) => number(plant.unrestrictedQty) >= required)
      : undefined;

    if (suitablePlant) {
      flags.push({
        rule: 'R5a',
        severity: 'FOLLOW_UP',
        action: 'TRANSFER',
        message: `${entry.description}: ${formatNumber(storeStock)} at this store (${entry.plant}), ${formatNumber(required)} needed. Plant ${suitablePlant.plant} has ${formatNumber(suitablePlant.unrestrictedQty)}. Arrange a stock transfer.`
      });
    } else {
      flags.push({
        rule: 'R5b',
        severity: 'FOLLOW_UP',
        action: 'SPECIAL_ORDER',
        message: `${entry.description}: ${formatNumber(storeStock)} at this store and no stock at other stores. Special order required.`
      });
    }
  }

  // R6: payment terms must match the customer sales area for the same sales org.
  if (quotation && customer && quotation.paymentTerms && Array.isArray(customer.salesAreas)) {
    const sameSalesArea = customer.salesAreas.find((area) => area.salesOrg === quotation.salesOrg);
    if (sameSalesArea && sameSalesArea.paymentTerms && sameSalesArea.paymentTerms !== quotation.paymentTerms) {
      flags.push({
        rule: 'R6',
        severity: 'SPECIALIST',
        message: `Payment terms differ (quote ${quotation.paymentTerms}, account ${sameSalesArea.paymentTerms}). Check with a specialist.`
      });
    }
  }

  let recommendation = 'RESOLVE_NOW';
  if (hasSpecialist(flags)) recommendation = 'REQUEST_SPECIALIST';
  else if (hasFollowUp(flags)) recommendation = 'CREATE_FOLLOW_UP';

  return { flags, recommendation };
}

module.exports = { evaluate };
