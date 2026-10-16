const App = {
  pages: {},

  registerPage(name, initialise) {
    this.pages[name] = initialise;
  },

  initPages() {
    const page = document.body.dataset.page;
    if (page && typeof this.pages[page] === 'function') {
      this.pages[page]();
    }
  }
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    ...options
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = null;
  }
  if (!response.ok) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function formatPercentage(value) {
  const percentage = numberOrZero(value);
  const rounded = Math.round((percentage + Number.EPSILON) * 10) / 10;
  return `${rounded.toLocaleString('en-NZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })}%`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(numberOrZero(seconds)));
  if (total < 60) {
    return `${total} s`;
  }
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes < 60) {
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }
  const hours = Math.floor(minutes / 60);
  const hourMinutes = minutes % 60;
  return `${hours}:${String(hourMinutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusLabel(value) {
  const labels = {
    OPEN: 'Open',
    AWAITING_SPECIALIST: 'Awaiting specialist',
    FOLLOW_UP: 'Follow-up',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
    RESOLVE_NOW: 'Resolve now',
    REQUEST_SPECIALIST: 'Request specialist',
    CREATE_FOLLOW_UP: 'Create follow-up',
    FCR: 'First contact resolved',
    NON_FCR: 'Not resolved at first contact',
    NONE: 'No outcome yet'
  };
  return labels[value] || String(value || '').replace(/_/g, ' ') || 'Unknown';
}

function statusClass(value) {
  const normalized = String(value || '').toLowerCase().replace(/_/g, '-');
  return `chip chip--${normalized || 'unknown'}`;
}

function labelFromPathway(value) {
  const labels = {
    STANDARD_RETAIL: 'Standard Retail',
    TRADE: 'Trade',
    SPECIAL_ORDER: 'Special Order'
  };
  return labels[value] || String(value || 'Unknown').replace(/_/g, ' ');
}

function caseIdentifiers(item) {
  const values = [];
  if (item.customerId) values.push(`Customer ${item.customerId}`);
  if (item.customerName) values.push(item.customerName);
  if (item.quotationId) values.push(`Quote ${item.quotationId}`);
  if (item.productId) {
    values.push(item.requestedQty ? `Product ${item.productId} x ${item.requestedQty}` : `Product ${item.productId}`);
  }
  if (values.length === 0) values.push('No identifiers recorded');
  return values;
}

function renderKpis(kpi) {
  document.getElementById('kpi-enquiries').textContent = String(numberOrZero(kpi.enquiriesToday));
  document.getElementById('kpi-fcr').textContent = formatPercentage(kpi.fcrRate);
  document.getElementById('kpi-followups').textContent = String(numberOrZero(kpi.openFollowUps));
  document.getElementById('kpi-duration').textContent = formatDuration(kpi.avgContactDurationSec);
  document.getElementById('kpi-handover').textContent = formatPercentage(kpi.handoverRate);
}

function renderCases(cases) {
  const rows = document.getElementById('case-rows');
  const empty = document.getElementById('case-empty');
  rows.innerHTML = '';

  if (!Array.isArray(cases) || cases.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  for (const item of cases) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><span class="case-id">${escapeHtml(item.caseId)}</span></td>
      <td><span class="created-time">${escapeHtml(formatDateTime(item.createdAt))}</span></td>
      <td>${escapeHtml(labelFromPathway(item.pathway))}</td>
      <td>
        <ul class="identifier-list">
          ${caseIdentifiers(item).map((value) => `<li>${escapeHtml(value)}</li>`).join('')}
        </ul>
      </td>
      <td><span class="${statusClass(item.recommendation)}">${escapeHtml(statusLabel(item.recommendation))}</span></td>
      <td><span class="${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
      <td><span class="${statusClass(item.outcome || 'NONE')}">${escapeHtml(statusLabel(item.outcome || 'NONE'))}</span></td>
      <td><a class="view-link" href="case.html?id=${encodeURIComponent(item.caseId)}">View</a></td>
    `;
    rows.appendChild(row);
  }
}

function initDashboard() {
  const loading = document.getElementById('dashboard-loading');
  const errorBanner = document.getElementById('dashboard-error');
  const retryButton = document.getElementById('dashboard-retry');
  if (!loading || !errorBanner || !retryButton) return;

  async function load() {
    loading.hidden = false;
    errorBanner.hidden = true;
    try {
      const [kpi, cases] = await Promise.all([
        requestJson('/api/kpi'),
        requestJson('/api/cases')
      ]);
      renderKpis(kpi);
      renderCases(cases);
    } catch (error) {
      console.error('Dashboard load failed:', error);
      errorBanner.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  retryButton.addEventListener('click', load);
  load();
}

const NEW_ENQUIRY = {
  pathway: null,
  specialOrderMode: 'PRODUCT',
  selectedProduct: null,
  selectedCustomer: null,
  selectedQuotation: null,
  lastCheck: null,
  pendingCaseSave: false,
  dirty: false,
  isSubmitting: false,
  quotationRequestId: 0
};

function markDirty() {
  if (!NEW_ENQUIRY.lastCheck && !NEW_ENQUIRY.pendingCaseSave) return;
  NEW_ENQUIRY.lastCheck = null;
  NEW_ENQUIRY.pendingCaseSave = false;
  const status = document.getElementById('check-status');
  if (status) status.textContent = '';
  const button = document.getElementById('check-submit');
  if (button) button.textContent = 'Check in SAP';
}

function setCurrentStep(stepNumber) {
  const steps = document.querySelectorAll('.step-list .step');
  steps.forEach((step, index) => step.classList.toggle('is-current', index === stepNumber - 1));
}

function localIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToIsoDate(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function tomorrowInAuckland() {
  return addDaysToIsoDate(localIsoDate(), 1);
}

function setEnquiryBusy(isBusy) {
  const form = document.getElementById('enquiry-form');
  if (!form) return;
  form.querySelectorAll('input, select, button').forEach((control) => {
    if (control.id !== 'check-submit') control.disabled = isBusy;
  });
  document.querySelectorAll('.pathway-card').forEach((button) => {
    button.disabled = isBusy;
  });
}

function money(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency || ''}`.trim();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(value);
  } catch (error) {
    return `${value.toFixed(2)} ${currency || ''}`.trim();
  }
}

function quotationStateLabel(quotation) {
  return quotation.isExpired ? 'Expired' : 'Current';
}

function formatQuotationDate(quotation) {
  if (!quotation.date) return 'Unknown date';
  return quotation.date;
}

function quantityIsValid() {
  const input = document.getElementById('requested-qty');
  if (!input) return false;
  const value = input.value.trim();
  if (value === '') return false;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0;
}

function updateSubmitState() {
  const button = document.getElementById('check-submit');
  if (!button) return;

  let valid = false;
  if (NEW_ENQUIRY.pathway === 'STANDARD_RETAIL') {
    valid = Boolean(NEW_ENQUIRY.selectedProduct) && quantityIsValid();
  } else if (NEW_ENQUIRY.pathway === 'TRADE') {
    valid = Boolean(NEW_ENQUIRY.selectedCustomer) && Boolean(NEW_ENQUIRY.selectedQuotation);
  } else if (NEW_ENQUIRY.pathway === 'SPECIAL_ORDER') {
    valid = NEW_ENQUIRY.specialOrderMode === 'QUOTATION'
      ? Boolean(document.getElementById('optional-quotation-id')?.value.trim())
      : Boolean(NEW_ENQUIRY.selectedProduct) && quantityIsValid();
  }

  button.disabled = !valid || NEW_ENQUIRY.isSubmitting;
  button.textContent = NEW_ENQUIRY.isSubmitting
    ? (NEW_ENQUIRY.pendingCaseSave ? 'Saving case…' : 'Checking SAP…')
    : (NEW_ENQUIRY.pendingCaseSave ? 'Retry save case' : 'Check in SAP');
}

function renderSelectedProduct() {
  const container = document.getElementById('selected-product');
  const lookupControls = document.getElementById('product-lookup-controls');
  if (!container) return;
  const product = NEW_ENQUIRY.selectedProduct;
  if (!product) {
    container.hidden = true;
    container.innerHTML = '';
    if (lookupControls) lookupControls.hidden = false;
    return;
  }
  container.hidden = false;
  if (lookupControls) lookupControls.hidden = true;
  container.innerHTML = `
    <div class="selection-card">
      <div>
        <strong>Selected product</strong>
        <p>${escapeHtml(product.description)} <span class="mono">(${escapeHtml(product.id)})</span></p>
      </div>
      <button type="button" class="text-button" id="remove-product">Change product</button>
    </div>
  `;
  document.getElementById('remove-product').addEventListener('click', () => {
    NEW_ENQUIRY.selectedProduct = null;
    markDirty();
    renderSelectedProduct();
    const productResults = document.getElementById('product-results');
    if (productResults) productResults.innerHTML = '';
    const searchTerm = document.getElementById('product-search-term');
    if (searchTerm) searchTerm.value = '';
    updateSubmitState();
  });
}

function renderSelectedCustomer() {
  const container = document.getElementById('selected-customer');
  const lookupControls = document.getElementById('customer-lookup-controls');
  if (!container) return;
  const customer = NEW_ENQUIRY.selectedCustomer;
  if (!customer) {
    container.hidden = true;
    container.innerHTML = '';
    if (lookupControls) lookupControls.hidden = false;
    return;
  }
  container.hidden = false;
  if (lookupControls) lookupControls.hidden = true;
  container.innerHTML = `
    <div class="selection-card">
      <div>
        <strong>Selected customer</strong>
        <p>${escapeHtml(customer.name)} <span class="mono">(${escapeHtml(customer.id)})</span></p>
      </div>
      <button type="button" class="text-button" id="remove-customer">Change customer</button>
    </div>
  `;
  document.getElementById('remove-customer').addEventListener('click', () => {
    NEW_ENQUIRY.quotationRequestId += 1;
    NEW_ENQUIRY.selectedCustomer = null;
    NEW_ENQUIRY.selectedQuotation = null;
    const quoteList = document.getElementById('quotation-list');
    if (quoteList) quoteList.innerHTML = '';
    const quoteStatus = document.getElementById('quotation-error');
    if (quoteStatus) quoteStatus.hidden = true;
    markDirty();
    renderSelectedCustomer();
    renderSelectedQuotation();
    updateSubmitState();
  });
}

function renderSelectedQuotation() {
  const container = document.getElementById('selected-quotation');
  const selectionArea = document.getElementById('quotation-selection-area');
  if (!container) return;
  const quotation = NEW_ENQUIRY.selectedQuotation;
  if (!quotation) {
    container.hidden = true;
    container.innerHTML = '';
    if (selectionArea) selectionArea.hidden = false;
    return;
  }
  container.hidden = false;
  if (selectionArea) selectionArea.hidden = true;
  container.innerHTML = `
    <div class="selection-card">
      <div>
        <strong>Selected quotation</strong>
        <p>${escapeHtml(quotation.id)} · ${escapeHtml(formatQuotationDate(quotation))} · ${escapeHtml(quotationStateLabel(quotation))}</p>
        <p>${escapeHtml(money(quotation.totalNet, quotation.currency))} · ${escapeHtml(quotation.processStatusText || quotation.processStatus)}</p>
      </div>
      <button type="button" class="text-button" id="remove-quotation">Change quotation</button>
    </div>
  `;
  document.getElementById('remove-quotation').addEventListener('click', () => {
    NEW_ENQUIRY.selectedQuotation = null;
    markDirty();
    renderSelectedQuotation();
    updateSubmitState();
  });
}

function renderSearchResults(container, items, emptyMessage, onSelect) {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `<li class="search-empty">${escapeHtml(emptyMessage)}</li>`;
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    button.innerHTML = `
      <span class="search-result-title">${escapeHtml(item.label)}</span>
      <span class="search-result-detail">${escapeHtml(item.detail)}</span>
    `;
    button.addEventListener('click', () => {
      onSelect(item.value);
      container.innerHTML = '';
    });
    li.appendChild(button);
    container.appendChild(li);
  }
}

async function searchProducts(term, resultsElement, loadingElement, errorElement) {
  const trimmed = term.trim();
  if (!trimmed) {
    errorElement.textContent = 'Enter a product name or material ID to search.';
    errorElement.hidden = false;
    resultsElement.innerHTML = '';
    return;
  }
  loadingElement.hidden = false;
  errorElement.hidden = true;
  resultsElement.innerHTML = '';
  try {
    const data = await requestJson(`/api/products/search?name=${encodeURIComponent(trimmed)}`);
    renderSearchResults(resultsElement, (data.results || []).map((product) => ({
      label: product.description || product.productId,
      detail: product.productId,
      value: product
    })), 'No matching products found. Try a more specific name or use exact material ID.', (product) => {
      NEW_ENQUIRY.selectedProduct = { id: product.productId, description: product.description };
      markDirty();
      renderSelectedProduct();
      updateSubmitState();
    });
  } catch (error) {
    errorElement.textContent = error.message || 'Product search failed. Please try again.';
    errorElement.hidden = false;
  } finally {
    loadingElement.hidden = true;
  }
}

async function searchCustomers(term, resultsElement, loadingElement, errorElement) {
  const trimmed = term.trim();
  if (!trimmed) {
    errorElement.textContent = 'Enter a customer name or ID to search.';
    errorElement.hidden = false;
    resultsElement.innerHTML = '';
    return;
  }
  loadingElement.hidden = false;
  errorElement.hidden = true;
  resultsElement.innerHTML = '';
  try {
    const data = await requestJson(`/api/customers/search?name=${encodeURIComponent(trimmed)}`);
    renderSearchResults(resultsElement, (data.results || []).map((customer) => ({
      label: customer.name,
      detail: customer.fullName ? `${customer.id || customer.customerId} · ${customer.fullName}` : (customer.id || customer.customerId),
      value: {
        id: customer.customerId || customer.id,
        name: customer.name,
        fullName: customer.fullName
      }
    })), 'No matching customers found. Try a different name or exact customer ID.', (customer) => {
      setSelectedCustomer(customer);
    });
  } catch (error) {
    errorElement.textContent = error.message || 'Customer search failed. Please try again.';
    errorElement.hidden = false;
  } finally {
    loadingElement.hidden = true;
  }
}

async function setSelectedCustomer(customer) {
  NEW_ENQUIRY.selectedCustomer = customer;
  NEW_ENQUIRY.selectedQuotation = null;
  markDirty();
  renderSelectedCustomer();
  renderSelectedQuotation();
  await loadQuotations(customer.id);
  updateSubmitState();
}

async function loadQuotations(customerId) {
  const loading = document.getElementById('quotation-loading');
  const errorElement = document.getElementById('quotation-error');
  const list = document.getElementById('quotation-list');
  if (!loading || !errorElement || !list) return;
  loading.hidden = false;
  errorElement.hidden = true;
  list.innerHTML = '';
  const requestId = ++NEW_ENQUIRY.quotationRequestId;
  try {
    const data = await requestJson(`/api/quotations?customerId=${encodeURIComponent(customerId)}`);
    if (requestId !== NEW_ENQUIRY.quotationRequestId || NEW_ENQUIRY.selectedCustomer?.id !== customerId) return;
    const quotations = Array.isArray(data.results) ? data.results : [];
    if (quotations.length === 0) {
      list.innerHTML = '<li class="search-empty">No quotations found for this customer.</li>';
      return;
    }
    for (const quotation of quotations) {
      const card = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result quotation-choice';
      button.innerHTML = `
        <span class="search-result-title">${escapeHtml(quotation.quotationId)}</span>
        <span class="search-result-detail">
          ${escapeHtml(formatQuotationDate(quotation))} · valid to ${escapeHtml(quotation.validTo || 'unknown')} · ${escapeHtml(quotationStateLabel(quotation))}
          · ${escapeHtml(money(quotation.totalNet, quotation.currency))} · ${escapeHtml(processStatusLabel(quotation.processStatus))}
        </span>
      `;
      button.addEventListener('click', () => {
        NEW_ENQUIRY.selectedQuotation = {
          id: quotation.quotationId,
          date: quotation.date,
          validTo: quotation.validTo,
          isExpired: quotation.isExpired,
          totalNet: quotation.totalNet,
          currency: quotation.currency,
          processStatus: quotation.processStatus,
          processStatusText: processStatusLabel(quotation.processStatus)
        };
        markDirty();
        renderSelectedQuotation();
        updateSubmitState();
      });
      card.appendChild(button);
      list.appendChild(card);
    }
  } catch (err) {
    if (requestId !== NEW_ENQUIRY.quotationRequestId) return;
    errorElement.textContent = err.message || 'Quotations could not be loaded. Please try again or select the customer again.';
    errorElement.hidden = false;
  } finally {
    if (requestId === NEW_ENQUIRY.quotationRequestId) loading.hidden = true;
  }
}

async function lookupCustomer(customerId, statusElement) {
  const trimmed = customerId.trim();
  if (!trimmed) {
    statusElement.textContent = 'Enter a customer ID to look up.';
    statusElement.hidden = false;
    return;
  }
  statusElement.hidden = true;
  try {
    const customer = await requestJson(`/api/customers/${encodeURIComponent(trimmed)}`);
    await setSelectedCustomer({
      id: customer.customerId,
      name: customer.name,
      fullName: customer.fullName
    });
  } catch (error) {
    statusElement.textContent = error.message || 'Customer was not found.';
    statusElement.hidden = false;
  }
}

function clearPanels() {
  const panels = ['product-panel', 'trade-panel', 'optional-context', 'special-order-mode-panel'];
  for (const id of panels) {
    const element = document.getElementById(id);
    if (element) element.hidden = true;
  }
}

function applySpecialOrderMode() {
  if (NEW_ENQUIRY.pathway !== 'SPECIAL_ORDER') return;
  const quotationMode = NEW_ENQUIRY.specialOrderMode === 'QUOTATION';
  document.getElementById('product-panel').hidden = quotationMode;
  document.getElementById('optional-context').hidden = false;
  const help = document.getElementById('special-order-context-help');
  if (help) {
    help.textContent = quotationMode
      ? 'Quotation ID is required. Customer ID is optional and will be checked against the quotation when provided.'
      : 'Customer ID and quotation ID are optional for the product-and-quantity flow.';
  }
  const required = document.getElementById('optional-quotation-required');
  if (required) required.hidden = !quotationMode;
  updateSubmitState();
}

function setPathway(pathway) {
  NEW_ENQUIRY.quotationRequestId += 1;
  NEW_ENQUIRY.pathway = pathway;
  NEW_ENQUIRY.selectedProduct = null;
  NEW_ENQUIRY.selectedCustomer = null;
  NEW_ENQUIRY.selectedQuotation = null;
  NEW_ENQUIRY.specialOrderMode = 'PRODUCT';
  markDirty();
  renderSelectedProduct();
  renderSelectedCustomer();
  renderSelectedQuotation();

  const quoteList = document.getElementById('quotation-list');
  if (quoteList) quoteList.innerHTML = '';
  const quoteError = document.getElementById('quotation-error');
  if (quoteError) quoteError.hidden = true;

  const defaults = {
    STANDARD_RETAIL: 'Product availability',
    TRADE: 'Quote status',
    SPECIAL_ORDER: 'Product availability'
  };
  const reason = document.getElementById('retrieval-reason');
  if (reason && defaults[pathway]) reason.value = defaults[pathway];

  clearPanels();
  const detailsSection = document.getElementById('details-section');
  if (detailsSection) detailsSection.hidden = false;

  for (const id of ['product-search-error', 'customer-search-error', 'quotation-error', 'quantity-error', 'customer-lookup-status']) {
    const element = document.getElementById(id);
    if (element) {
      element.hidden = true;
      if (element.tagName !== 'UL') element.textContent = '';
    }
  }
  const productResults = document.getElementById('product-results');
  if (productResults) productResults.innerHTML = '';
  const customerResults = document.getElementById('customer-results');
  if (customerResults) customerResults.innerHTML = '';
  const quotationList = document.getElementById('quotation-list');
  if (quotationList) quotationList.innerHTML = '';

  const term = document.getElementById('product-search-term');
  if (term) term.value = '';
  const customerTerm = document.getElementById('customer-search-term');
  if (customerTerm) customerTerm.value = '';
  const exactProduct = document.getElementById('exact-product-id');
  if (exactProduct) exactProduct.value = '';
  const exactCustomer = document.getElementById('customer-exact-id');
  if (exactCustomer) exactCustomer.value = '';
  const optionalCustomer = document.getElementById('optional-customer-id');
  if (optionalCustomer) optionalCustomer.value = '';
  const optionalQuotation = document.getElementById('optional-quotation-id');
  if (optionalQuotation) optionalQuotation.value = '';
  const quantity = document.getElementById('requested-qty');
  if (quantity) quantity.value = '';

  const buttons = document.querySelectorAll('.pathway-card');
  for (const button of buttons) {
    const isSelected = button.dataset.pathway === pathway;
    button.setAttribute('aria-pressed', String(isSelected));
    button.classList.toggle('is-selected', isSelected);
    const state = button.querySelector('.pathway-choice-state');
    if (state) state.textContent = isSelected ? 'Selected' : 'Not selected';
  }

  if (pathway === 'STANDARD_RETAIL') {
    document.getElementById('product-panel').hidden = false;
  } else if (pathway === 'TRADE') {
    document.getElementById('trade-panel').hidden = false;
  } else if (pathway === 'SPECIAL_ORDER') {
    document.getElementById('special-order-mode-panel').hidden = false;
    const productMode = document.querySelector('input[name="special-order-mode"][value="PRODUCT"]');
    if (productMode) productMode.checked = true;
    applySpecialOrderMode();
  }

  const stepDetails = document.getElementById('pathway-selected-text');
  if (stepDetails) {
    stepDetails.textContent = `${labelFromPathway(pathway)} selected. Complete the details below.`;
  }
  setCurrentStep(2);
  updateSubmitState();
}

function pathwayLabel(pathway) {
  const labels = {
    STANDARD_RETAIL: 'Standard Retail',
    TRADE: 'Trade',
    SPECIAL_ORDER: 'Special Order'
  };
  return labels[pathway] || pathway;
}

function buildFormPayload() {
  const pathway = NEW_ENQUIRY.pathway;
  const quotationMode = pathway === 'SPECIAL_ORDER' && NEW_ENQUIRY.specialOrderMode === 'QUOTATION';
  const customerId = (NEW_ENQUIRY.selectedCustomer && NEW_ENQUIRY.selectedCustomer.id) || null;
  const quotationId = NEW_ENQUIRY.selectedQuotation ? NEW_ENQUIRY.selectedQuotation.id : (pathway === 'SPECIAL_ORDER' ? (document.getElementById('optional-quotation-id').value.trim() || null) : null);
  const optionalCustomerId = pathway === 'SPECIAL_ORDER' ? document.getElementById('optional-customer-id').value.trim() : '';
  const productId = !quotationMode && NEW_ENQUIRY.selectedProduct ? NEW_ENQUIRY.selectedProduct.id : null;
  const quantityInput = document.getElementById('requested-qty');
  const requestedQty = quantityInput && quantityInput.value.trim() !== '' ? Number(quantityInput.value) : null;

  return {
    pathway,
    customerId: pathway === 'TRADE' ? customerId : (optionalCustomerId || null),
    quotationId,
    productId,
    requestedQty: productId ? requestedQty : null,
    plant: '1710'
  };
}

function buildCasePayload(checkResult, form, retrievalReason) {
  return {
    pathway: form.pathway,
    customerId: form.customerId,
    quotationId: form.quotationId,
    productId: form.productId,
    requestedQty: form.requestedQty,
    retrievalReason,
    sapSnapshot: checkResult
  };
}

function clearGlobalError() {
  const globalError = document.getElementById('global-error');
  const globalErrorText = document.getElementById('global-error-text');
  if (globalError) {
    globalError.hidden = true;
    if (globalErrorText) globalErrorText.textContent = '';
  }
}

function showGlobalError(message) {
  const globalError = document.getElementById('global-error');
  const globalErrorText = document.getElementById('global-error-text');
  if (!globalError) return;
  if (globalErrorText) globalErrorText.textContent = message;
  globalError.hidden = false;
}

function initNewEnquiry() {
  const form = document.getElementById('enquiry-form');
  if (!form) return;

  const reason = document.getElementById('retrieval-reason');
  if (reason) {
    reason.addEventListener('change', markDirty);
  }

  const pathwayButtons = document.querySelectorAll('.pathway-card');
  for (const button of pathwayButtons) {
    button.addEventListener('click', () => {
      setPathway(button.dataset.pathway);
      clearGlobalError();
      markDirty();
    });
  }

  const productTerm = document.getElementById('product-search-term');
  const productSearchButton = document.getElementById('product-search-button');
  const productLoading = document.getElementById('product-search-loading');
  const productError = document.getElementById('product-search-error');
  const productResults = document.getElementById('product-results');
  const exactProductId = document.getElementById('exact-product-id');
  const useExactProduct = document.getElementById('use-exact-product');

  if (productSearchButton && productTerm) {
    const runSearch = (event) => {
      if (event) event.preventDefault();
      searchProducts(productTerm.value, productResults, productLoading, productError);
    };
    productSearchButton.addEventListener('click', runSearch);
    productTerm.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch(event);
    });
    productTerm.addEventListener('input', markDirty);
  }

  if (useExactProduct && exactProductId) {
    useExactProduct.addEventListener('click', () => {
      const value = exactProductId.value.trim();
      if (!value) {
        productError.textContent = 'Enter a material ID before using the exact entry.';
        productError.hidden = false;
        return;
      }
      productError.hidden = true;
      NEW_ENQUIRY.selectedProduct = {
        id: value,
        description: `Exact material ID: ${value}`
      };
      renderSelectedProduct();
      markDirty();
      updateSubmitState();
    });
    exactProductId.addEventListener('input', () => {
      productError.hidden = true;
      markDirty();
    });
  }

  const quantityInput = document.getElementById('requested-qty');
  if (quantityInput) {
    quantityInput.addEventListener('input', () => {
      markDirty();
      const error = document.getElementById('quantity-error');
      if (error) error.hidden = quantityInput.value.trim() === '' || quantityIsValid();
      updateSubmitState();
    });
  }

  const customerTerm = document.getElementById('customer-search-term');
  const customerSearchButton = document.getElementById('customer-search-button');
  const customerLoading = document.getElementById('customer-search-loading');
  const customerError = document.getElementById('customer-search-error');
  const customerResults = document.getElementById('customer-results');
  const customerLookupInput = document.getElementById('customer-exact-id');
  const customerLookupButton = document.getElementById('customer-exact-button');
  const customerLookupStatus = document.getElementById('customer-lookup-status');

  if (customerSearchButton && customerTerm) {
    const runSearch = (event) => {
      if (event) event.preventDefault();
      searchCustomers(customerTerm.value, customerResults, customerLoading, customerError);
    };
    customerSearchButton.addEventListener('click', runSearch);
    customerTerm.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch(event);
    });
    customerTerm.addEventListener('input', markDirty);
  }

  if (customerLookupButton && customerLookupInput) {
    customerLookupButton.addEventListener('click', async (event) => {
      event.preventDefault();
      clearGlobalError();
      await lookupCustomer(customerLookupInput.value, customerLookupStatus);
      markDirty();
      updateSubmitState();
    });
    customerLookupInput.addEventListener('input', () => {
      customerLookupStatus.hidden = true;
      markDirty();
    });
  }

  const optionalCustomer = document.getElementById('optional-customer-id');
  const optionalQuotation = document.getElementById('optional-quotation-id');
  if (optionalCustomer) optionalCustomer.addEventListener('input', markDirty);
  if (optionalQuotation) optionalQuotation.addEventListener('input', () => {
    markDirty();
    updateSubmitState();
  });

  document.querySelectorAll('input[name="special-order-mode"]').forEach((input) => {
    input.addEventListener('change', () => {
      NEW_ENQUIRY.specialOrderMode = input.value;
      NEW_ENQUIRY.selectedProduct = null;
      const quantity = document.getElementById('requested-qty');
      if (quantity) quantity.value = '';
      renderSelectedProduct();
      markDirty();
      applySpecialOrderMode();
    });
  });

  const actionButton = document.getElementById('check-submit');
  const statusArea = document.getElementById('check-status');
  if (actionButton) {
    actionButton.addEventListener('click', async (event) => {
      event.preventDefault();
      clearGlobalError();
      if (actionButton.disabled) return;

      NEW_ENQUIRY.isSubmitting = true;
      setEnquiryBusy(true);
      setCurrentStep(3);
      updateSubmitState();
      const initialLabel = actionButton.textContent;
      actionButton.textContent = NEW_ENQUIRY.pendingCaseSave ? 'Saving case…' : 'Checking SAP…';

      try {
        let checkResult = null;
        let submissionPayload = null;
        let submissionReason = null;
        if (NEW_ENQUIRY.pendingCaseSave && NEW_ENQUIRY.lastCheck) {
          checkResult = NEW_ENQUIRY.lastCheck.result;
          submissionPayload = NEW_ENQUIRY.lastCheck.payload;
          submissionReason = NEW_ENQUIRY.lastCheck.retrievalReason;
        } else {
          submissionPayload = Object.freeze({ ...buildFormPayload() });
          submissionReason = document.getElementById('retrieval-reason').value;
          const validationError = validateFormPayload(submissionPayload);
          if (validationError) {
            showGlobalError(validationError);
            return;
          }
          if (statusArea) statusArea.textContent = '';
          checkResult = await requestJson('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submissionPayload)
          });
          NEW_ENQUIRY.lastCheck = { payload: submissionPayload, retrievalReason: submissionReason, result: checkResult };
          NEW_ENQUIRY.dirty = false;
          NEW_ENQUIRY.pendingCaseSave = false;
          if (statusArea) statusArea.textContent = 'SAP check complete. Creating case…';
        }

        const casePayload = buildCasePayload(checkResult, submissionPayload, submissionReason);
        const created = await requestJson('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(casePayload)
        });

        if (!created || !created.caseId) {
          throw new Error('The case was not created.');
        }
        window.location.href = `result.html?id=${encodeURIComponent(created.caseId)}`;
      } catch (error) {
        if (NEW_ENQUIRY.lastCheck) {
          NEW_ENQUIRY.pendingCaseSave = true;
          showGlobalError(`${error.message} SAP check succeeded; you can retry saving the case without running the check again.`);
        } else {
          showGlobalError(error.message || 'Unable to check with SAP. Please try again.');
        }
      } finally {
        NEW_ENQUIRY.isSubmitting = false;
        setEnquiryBusy(false);
        if (!NEW_ENQUIRY.pendingCaseSave) setCurrentStep(2);
        updateSubmitState();
      }
    });
  }

  const quantityError = document.getElementById('quantity-error');
  if (quantityError) quantityError.hidden = true;
}

function validateFormPayload(payload) {
  if (!payload || !payload.pathway) return 'Please choose a pathway.';
  if (payload.pathway === 'STANDARD_RETAIL' || (payload.pathway === 'SPECIAL_ORDER' && NEW_ENQUIRY.specialOrderMode === 'PRODUCT')) {
    if (!payload.productId) return 'Please select a product.';
    if (!Number.isFinite(payload.requestedQty) || payload.requestedQty <= 0) {
      return 'Please enter a quantity greater than zero.';
    }
  }
  if (payload.pathway === 'TRADE' && !payload.customerId) {
    return 'Please select a customer.';
  }
  if (payload.pathway === 'TRADE' && !payload.quotationId) {
    return 'Please select a quotation.';
  }
  if (payload.pathway === 'SPECIAL_ORDER' && NEW_ENQUIRY.specialOrderMode === 'QUOTATION' && !payload.quotationId) {
    return 'Please enter a quotation ID.';
  }
  return '';
}

// ===== Result page =====

const RESULT_PAGE = {
  caseId: null,
  caseData: null,
  isSubmitting: false
};

function getCaseIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function formatDateForInput(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return localIsoDate(date);
}

function paymentTermsLabel(code) {
  const terms = {
    '0001': 'Immediate',
    '0002': '14 days',
    '0003': '30 days',
    '0004': '30 days net',
    '0005': '60 days net',
    '0006': '90 days net'
  };
  return terms[code] || code;
}

function processStatusLabel(code) {
  const statuses = {
    'A': 'Not yet processed',
    'B': 'Partially processed',
    'C': 'Completely processed'
  };
  return statuses[code] || code;
}

function deliveryStatusLabel(code) {
  const statuses = {
    'A': 'Not yet delivered',
    'B': 'Partially delivered',
    'C': 'Fully delivered'
  };
  return statuses[code] || code;
}

function blockStatusLabel(isBlocked) {
  return isBlocked ? 'Yes — account has blocks' : 'No — account is clear';
}

function deletedStatusLabel(isDeleted) {
  return isDeleted ? 'Yes — marked for deletion' : 'No';
}

function sufficientLabel(sufficient) {
  return sufficient ? 'Yes — sufficient' : 'No — insufficient';
}

function actionLabel(action) {
  const labels = {
    'TRANSFER': 'Arrange stock transfer',
    'SPECIAL_ORDER': 'Arrange special order',
    'REQUOTE': 'Create a new quotation',
    'CHECK_REJECTION': 'Check rejected item'
  };
  return labels[action] || action;
}

function renderCustomerCard(customer) {
  const card = document.getElementById('customer-card');
  if (!customer || !card) return;
  document.getElementById('customer-name').textContent = customer.name || '—';
  document.getElementById('customer-id').textContent = customer.customerId || customer.id || '—';
  document.getElementById('customer-status').textContent = customer.isBlocked ? 'Blocked' : 'Active';
  document.getElementById('customer-blocked').textContent = blockStatusLabel(customer.isBlocked);
  document.getElementById('customer-deleted').textContent = deletedStatusLabel(customer.isDeleted);
  const paymentTerms = customer.salesAreas?.[0]?.paymentTerms;
  document.getElementById('customer-payment-terms').textContent = paymentTerms ? paymentTermsLabel(paymentTerms) : '—';
  card.hidden = false;
}

function renderQuotationCard(quotation) {
  const card = document.getElementById('quotation-card');
  if (!quotation || !card) return;
  document.getElementById('quotation-id').textContent = quotation.quotationId || '—';
  document.getElementById('quotation-date').textContent = quotation.date || '—';
  document.getElementById('quotation-valid-to').textContent = quotation.validTo || '—';
  document.getElementById('quotation-status').textContent = processStatusLabel(quotation.processStatus);
  document.getElementById('quotation-payment-terms').textContent = quotation.paymentTerms ? paymentTermsLabel(quotation.paymentTerms) : '—';
  document.getElementById('quotation-total').textContent = money(quotation.totalNet, quotation.currency);
  const expiredNotice = document.getElementById('quotation-expired-notice');
  if (quotation.isExpired) {
    expiredNotice.textContent = 'Expired — this quotation is past its validity date.';
    expiredNotice.hidden = false;
  } else {
    expiredNotice.hidden = true;
  }
  card.hidden = false;
}

function renderStockTable(stock, quotation) {
  const tbody = document.getElementById('stock-rows');
  const noStockMsg = document.getElementById('no-stock-message');
  const section = document.getElementById('stock-section');
  if (!tbody || !section) return;
  tbody.innerHTML = '';

  // For Trade / quotation-based results, build rows from quotation.items
  // and match to stock by material. For Standard Retail / product-only
  // Special Order, fall back to stock array directly.
  const hasQuotationItems = quotation && Array.isArray(quotation.items) && quotation.items.length > 0;
  const itemsToRender = hasQuotationItems ? quotation.items : (Array.isArray(stock) ? stock : []);

  if (itemsToRender.length === 0) {
    noStockMsg.textContent = 'No stock items to display.';
    noStockMsg.hidden = false;
    section.hidden = false;
    return;
  }

  noStockMsg.hidden = true;

  // Build a lookup map from stock array by material for matching
  const stockByMaterial = new Map();
  if (Array.isArray(stock)) {
    for (const s of stock) {
      if (s.material) stockByMaterial.set(s.material, s);
    }
  }

  for (const item of itemsToRender) {
    const tr = document.createElement('tr');
    const material = item.material;
    const description = item.description || '—';
    const isRejected = item.isRejected === true;
    const matchedStock = material ? stockByMaterial.get(material) : null;

    let required, unit, unrestrictedQty, sufficient, otherPlantsText, stockStatusHtml;

    if (isRejected) {
      // Rejected quotation item — backend did not query stock
      required = Number(item.qty || 0);
      unit = item.unit || '—';
      unrestrictedQty = 'Not checked';
      sufficient = false;
      otherPlantsText = 'Not checked — item rejected';
      stockStatusHtml = `<span class="chip chip--follow-up">Rejected (reason ${escapeHtml(item.rejectionReason || 'unknown')})</span>`;
      tr.style.background = '#fef2f2'; // subtle red tint for rejected rows
    } else if (matchedStock) {
      // Non-rejected item with stock data
      required = Number(matchedStock.required || item.qty || 0);
      unit = matchedStock.unit || item.unit || '—';
      unrestrictedQty = Number(matchedStock.unrestrictedQty || 0);
      sufficient = matchedStock.sufficient === true;
      otherPlantsText = (Array.isArray(matchedStock.otherPlants) && matchedStock.otherPlants.length > 0)
        ? matchedStock.otherPlants.map(p => `${p.plant}: ${Number(p.unrestrictedQty).toLocaleString()} ${p.unit || unit}`).join('; ')
        : 'No other store with sufficient stock';
      stockStatusHtml = `<span class="${sufficient ? 'chip chip--resolve-now' : 'chip chip--create-follow-up'}">${escapeHtml(sufficientLabel(sufficient))}</span>`;
    } else {
      // Non-rejected item but no stock match (should not happen normally)
      required = Number(item.qty || 0);
      unit = item.unit || '—';
      unrestrictedQty = 'No data';
      sufficient = false;
      otherPlantsText = 'No stock data available';
      stockStatusHtml = `<span class="chip chip--create-follow-up">Unknown</span>`;
    }

    tr.innerHTML = `
      <td><span class="mono">${escapeHtml(material)}</span></td>
      <td>${escapeHtml(description)}</td>
      <td>${Number.isFinite(required) ? required.toLocaleString() : escapeHtml(String(required))}</td>
      <td>${Number.isFinite(unrestrictedQty) ? unrestrictedQty.toLocaleString() : escapeHtml(String(unrestrictedQty))}</td>
      <td>${escapeHtml(unit)}</td>
      <td>${stockStatusHtml}</td>
      <td>${escapeHtml(otherPlantsText)}</td>
      <td>${isRejected ? `<span class="chip chip--follow-up">Rejected (reason ${escapeHtml(item.rejectionReason || 'unknown')})</span>` : ''}</td>
    `;
    tbody.appendChild(tr);
  }
  section.hidden = false;
}

function renderOrdersCard(orders) {
  const card = document.getElementById('orders-card');
  const convertedStatus = document.getElementById('orders-converted-status');
  const list = document.getElementById('orders-list');
  if (!card || !orders) return;
  if (!orders.converted || !Array.isArray(orders.orders) || orders.orders.length === 0) {
    convertedStatus.textContent = 'This quotation has not been converted to an order.';
    list.innerHTML = '';
    card.hidden = false;
    return;
  }
  convertedStatus.textContent = `Converted — ${orders.orders.length} order(s) found.`;
  list.innerHTML = '';
  for (const order of orders.orders) {
    const div = document.createElement('div');
    div.className = 'order-item';
    div.style.marginBottom = '1rem';
    div.style.padding = '1rem';
    div.style.border = '1px solid var(--border)';
    div.style.borderRadius = '10px';
    div.style.background = 'var(--card)';
    div.innerHTML = `
      <div style="display: grid; gap: 0.5rem; margin-bottom: 0.75rem;">
        <div><strong>Order ID:</strong> <span class="mono">${escapeHtml(order.salesOrderId)}</span></div>
        <div><strong>Date:</strong> ${escapeHtml(order.orderDate)}</div>
        <div><strong>Total:</strong> ${escapeHtml(money(order.totalNet, order.currency))}</div>
        <div><strong>Process status:</strong> ${escapeHtml(processStatusLabel(order.processStatus))}</div>
        <div><strong>Delivery status:</strong> ${escapeHtml(deliveryStatusLabel(order.deliveryStatus))} ${order.fullyDelivered ? '(Fully delivered)' : '(Not fully delivered)'}</div>
      </div>
      <div class="table-wrap" style="max-height: 200px; overflow-y: auto;">
        <table class="stock-table" style="min-width: 600px;">
          <thead><tr><th>Item</th><th>Material</th><th>Description</th><th>Qty</th><th>Amount</th><th>Delivery</th></tr></thead>
          <tbody>
            ${(order.items || []).map(item => `
              <tr>
                <td>${escapeHtml(item.itemNo)}</td>
                <td><span class="mono">${escapeHtml(item.material)}</span></td>
                <td>${escapeHtml(item.description || '—')}</td>
                <td>${Number(item.qty || 0).toLocaleString()}</td>
                <td>${escapeHtml(money(item.netAmount, order.currency))}</td>
                <td>${escapeHtml(deliveryStatusLabel(item.deliveryStatus))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    list.appendChild(div);
  }
  card.hidden = false;
}

function renderFlags(flags) {
  const specialistList = document.getElementById('flags-specialist-list');
  const followupList = document.getElementById('flags-followup-list');
  const infoList = document.getElementById('flags-info-list');
  const specialistGroup = document.getElementById('flags-specialist');
  const followupGroup = document.getElementById('flags-followup');
  const infoGroup = document.getElementById('flags-info');
  const noFlagsMsg = document.getElementById('no-flags-message');
  const section = document.getElementById('flags-section');

  specialistList.innerHTML = '';
  followupList.innerHTML = '';
  infoList.innerHTML = '';

  if (!Array.isArray(flags) || flags.length === 0) {
    noFlagsMsg.hidden = false;
    specialistGroup.hidden = true;
    followupGroup.hidden = true;
    infoGroup.hidden = true;
    return;
  }

  noFlagsMsg.hidden = true;
  let hasSpecialist = false, hasFollowup = false, hasInfo = false;

  for (const flag of flags) {
    const li = document.createElement('li');
    li.style.marginBottom = '0.75rem';
    li.style.padding = '0.75rem';
    li.style.border = '1px solid var(--border)';
    li.style.borderRadius = '8px';
    li.style.background = 'var(--card)';
    const actionText = flag.action ? ` → Suggested: ${actionLabel(flag.action)}` : '';
    li.innerHTML = `
      <div style="font-weight: 600; color: var(--header);">${escapeHtml(flag.rule)} (${escapeHtml(flag.severity)})</div>
      <div style="margin-top: 0.25rem;">${escapeHtml(flag.message)}${escapeHtml(actionText)}</div>
    `;
    if (flag.severity === 'SPECIALIST') {
      specialistList.appendChild(li);
      hasSpecialist = true;
    } else if (flag.severity === 'FOLLOW_UP') {
      followupList.appendChild(li);
      hasFollowup = true;
    } else {
      infoList.appendChild(li);
      hasInfo = true;
    }
  }
  specialistGroup.hidden = !hasSpecialist;
  followupGroup.hidden = !hasFollowup;
  infoGroup.hidden = !hasInfo;
}

function renderActionPanel(caseData, flags) {
  const recommendation = caseData.recommendation;
  const resolvePanel = document.getElementById('action-resolve-now');
  const specialistPanel = document.getElementById('action-request-specialist');
  const followupPanel = document.getElementById('action-create-followup');
  const viewCasePanel = document.getElementById('action-view-case');
  const viewCaseLink = document.getElementById('action-view-case-link');
  const desc = document.getElementById('action-description');

  resolvePanel.hidden = true;
  specialistPanel.hidden = true;
  followupPanel.hidden = true;
  viewCasePanel.hidden = true;

  if (caseData.status !== 'OPEN') {
    desc.textContent = `This case is already ${statusLabel(caseData.status).toLowerCase()}. Actions are managed from Case Detail.`;
    viewCaseLink.href = `case.html?id=${encodeURIComponent(caseData.caseId)}`;
    viewCasePanel.hidden = false;
    return;
  }

  if (recommendation === 'RESOLVE_NOW') {
    resolvePanel.hidden = false;
    desc.textContent = 'All checks passed. You can resolve this enquiry now.';
  } else if (recommendation === 'REQUEST_SPECIALIST') {
    specialistPanel.hidden = false;
    desc.textContent = 'A specialist must review this enquiry before it can be resolved.';
  } else if (recommendation === 'CREATE_FOLLOW_UP') {
    followupPanel.hidden = false;
    desc.textContent = 'This enquiry requires a follow-up. Assign an owner and due date.';
    const suggested = document.getElementById('suggested-actions');
    if (Array.isArray(flags)) {
      const actions = flags
        .filter(f => f.action)
        .map(f => actionLabel(f.action));
      if (actions.length > 0) {
        suggested.textContent = 'Suggested actions from flags: ' + [...new Set(actions)].join(', ');
        suggested.hidden = false;
      } else {
        suggested.hidden = true;
      }
    }
    const dueInput = document.getElementById('followup-due-date');
    if (dueInput && !dueInput.value) {
      const tomorrow = tomorrowInAuckland();
      dueInput.min = tomorrow;
      dueInput.value = tomorrow;
    }
  }
}

async function loadCase(caseId) {
  const loading = document.getElementById('loading-state');
  const errorBanner = document.getElementById('global-error');
  const retryBtn = document.getElementById('global-error-retry');
  const content = document.getElementById('result-content');

  loading.hidden = false;
  errorBanner.hidden = true;
  content.hidden = true;

  try {
    const data = await requestJson(`/api/cases/${encodeURIComponent(caseId)}`);
    RESULT_PAGE.caseData = data;
    renderResult(data);
    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    loading.hidden = true;
    errorBanner.hidden = false;
    document.getElementById('global-error-text').textContent = error.message || 'Failed to load case. Please try again.';
    retryBtn.hidden = false;
  }
}

function renderResult(caseData) {
  document.getElementById('case-id').textContent = caseData.caseId || '—';
  document.getElementById('recommendation-chip').textContent = statusLabel(caseData.recommendation);
  document.getElementById('recommendation-chip').className = `chip ${statusClass(caseData.recommendation)}`;
  document.getElementById('pathway-chip').textContent = labelFromPathway(caseData.pathway);
  document.getElementById('pathway-chip').className = `chip chip--${caseData.pathway.toLowerCase().replace('_', '-')}`;

  const sap = caseData.sapSnapshot;
  if (sap) {
    document.getElementById('result-source').textContent = `Live SAP · Checked ${formatDateTime(sap.checkedAt)}`;
    if (sap.customer) renderCustomerCard(sap.customer);
    if (sap.quotation) renderQuotationCard(sap.quotation);
    if (sap.stock) renderStockTable(sap.stock, sap.quotation);
    if (sap.orders) renderOrdersCard(sap.orders);
    if (sap.flags) renderFlags(sap.flags);
    renderActionPanel(caseData, sap.flags);
  }
}

function showActionError(panelId, message) {
  const statusEl = document.getElementById(`${panelId}-status`);
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.style.color = 'var(--danger-text)';
  }
}

function showActionLoading(panelId, message) {
  const statusEl = document.getElementById(`${panelId}-status`);
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.style.color = 'var(--muted)';
  }
}

async function handleResolveNow(caseId) {
  const btn = document.getElementById('btn-resolve-now');
  if (!btn || RESULT_PAGE.isSubmitting) return;
  RESULT_PAGE.isSubmitting = true;
  btn.disabled = true;
  showActionLoading('resolve', 'Resolving…');
  try {
    await requestJson(`/api/cases/${encodeURIComponent(caseId)}/resolve`, { method: 'POST' });
    window.location.href = `case.html?id=${encodeURIComponent(caseId)}`;
  } catch (error) {
    showActionError('resolve', error.message || 'Failed to resolve. Please try again.');
    btn.disabled = false;
    RESULT_PAGE.isSubmitting = false;
  }
}

async function handleRequestSpecialist(caseId) {
  const btn = document.getElementById('btn-request-specialist');
  if (!btn || RESULT_PAGE.isSubmitting) return;
  RESULT_PAGE.isSubmitting = true;
  btn.disabled = true;
  showActionLoading('specialist', 'Requesting specialist…');
  try {
    await requestJson(`/api/cases/${encodeURIComponent(caseId)}/request-specialist`, { method: 'POST' });
    window.location.href = `case.html?id=${encodeURIComponent(caseId)}`;
  } catch (error) {
    showActionError('specialist', error.message || 'Failed to request specialist. Please try again.');
    btn.disabled = false;
    RESULT_PAGE.isSubmitting = false;
  }
}

async function handleCreateFollowup(caseId) {
  const form = document.getElementById('followup-form');
  const btn = document.getElementById('btn-create-followup');
  if (!form || !btn || RESULT_PAGE.isSubmitting) return;
  const owner = document.getElementById('followup-owner').value.trim();
  const dueDate = document.getElementById('followup-due-date').value;
  const customerNotified = document.getElementById('followup-customer-notified').checked;
  const ownerError = document.getElementById('followup-owner-error');
  const dueDateError = document.getElementById('followup-due-date-error');
  ownerError.hidden = !!owner;
  const dueDateValid = Boolean(dueDate) && dueDate >= tomorrowInAuckland();
  dueDateError.textContent = dueDate ? 'Choose a future due date.' : 'Due date is required.';
  dueDateError.hidden = dueDateValid;
  if (!owner || !dueDateValid) return;
  RESULT_PAGE.isSubmitting = true;
  btn.disabled = true;
  showActionLoading('followup', 'Creating follow-up…');
  try {
    await requestJson(`/api/cases/${encodeURIComponent(caseId)}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, dueDate, customerNotified })
    });
    window.location.href = `case.html?id=${encodeURIComponent(caseId)}`;
  } catch (error) {
    showActionError('followup', error.message || 'Failed to create follow-up. Please try again.');
    btn.disabled = false;
    RESULT_PAGE.isSubmitting = false;
  }
}

function initResultPage() {
  const caseId = getCaseIdFromUrl();
  if (!caseId) {
    document.getElementById('loading-state').hidden = true;
    document.getElementById('global-error').hidden = false;
    document.getElementById('global-error-text').textContent = 'No case ID provided. Please return to New Enquiry and submit a check.';
    document.getElementById('global-error-retry').hidden = true;
    return;
  }
  RESULT_PAGE.caseId = caseId;
  loadCase(caseId);

  const retryBtn = document.getElementById('global-error-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadCase(caseId));
  }

  const resolveBtn = document.getElementById('btn-resolve-now');
  if (resolveBtn) resolveBtn.addEventListener('click', () => handleResolveNow(caseId));

  const specialistBtn = document.getElementById('btn-request-specialist');
  if (specialistBtn) specialistBtn.addEventListener('click', () => handleRequestSpecialist(caseId));

  const followupForm = document.getElementById('followup-form');
  if (followupForm) {
    followupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCreateFollowup(caseId);
    });
  }
}

function init() {
  initDashboard();
}

App.registerPage('dashboard', initDashboard);
App.registerPage('new-enquiry', initNewEnquiry);
App.registerPage('result', initResultPage);

// ===== Case Detail page =====

const CASE_DETAIL = {
  caseId: null,
  caseData: null,
  isSubmitting: false
};

function getCaseIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function renderCaseSummary(caseData) {
  document.getElementById('case-id').textContent = caseData.caseId || '—';
  document.getElementById('status-chip').textContent = statusLabel(caseData.status);
  document.getElementById('status-chip').className = `chip ${statusClass(caseData.status)}`;
  document.getElementById('pathway-chip').textContent = labelFromPathway(caseData.pathway);
  document.getElementById('pathway-chip').className = `chip chip--${caseData.pathway.toLowerCase().replace('_', '-')}`;
  document.getElementById('recommendation-chip').textContent = statusLabel(caseData.recommendation);
  document.getElementById('recommendation-chip').className = `chip ${statusClass(caseData.recommendation)}`;
  document.getElementById('outcome-chip').textContent = caseData.outcome ? statusLabel(caseData.outcome) : 'No outcome yet';
  document.getElementById('outcome-chip').className = caseData.outcome ? `chip ${statusClass(caseData.outcome)}` : 'chip chip--unknown';

  const sap = caseData.sapSnapshot;
  document.getElementById('case-source').textContent = sap && sap.checkedAt ? `Live SAP · Checked ${formatDateTime(sap.checkedAt)}` : '';

  document.getElementById('summary-created').textContent = formatDateTime(caseData.createdAt);
  document.getElementById('summary-reason').textContent = caseData.retrievalReason || '—';
  document.getElementById('summary-customer').textContent = caseData.customerName ? `${caseData.customerName} (${caseData.customerId})` : '—';
  document.getElementById('summary-quotation').textContent = caseData.quotationId || '—';
  document.getElementById('summary-product').textContent = caseData.productId || '—';
  document.getElementById('summary-qty').textContent = caseData.requestedQty ? Number(caseData.requestedQty).toLocaleString() : '—';
  document.getElementById('summary-sap-checked').textContent = sap && sap.checkedAt ? formatDateTime(sap.checkedAt) : '—';
  document.getElementById('summary-outcome').textContent = caseData.outcome ? statusLabel(caseData.outcome) : 'No outcome recorded';
  document.getElementById('summary-outcome-time').textContent = caseData.outcomeAt ? formatDateTime(caseData.outcomeAt) : '—';
  document.getElementById('summary-duration').textContent = caseData.contactDurationSec ? formatDuration(caseData.contactDurationSec) : '—';
  document.getElementById('summary-handovers').textContent = String(caseData.handoverCount || 0);
}

function renderCaseFlags(flags) {
  const specialistList = document.getElementById('flags-specialist-list');
  const followupList = document.getElementById('flags-followup-list');
  const infoList = document.getElementById('flags-info-list');
  const specialistGroup = document.getElementById('flags-specialist');
  const followupGroup = document.getElementById('flags-followup');
  const infoGroup = document.getElementById('flags-info');
  const noFlagsMsg = document.getElementById('no-flags-message');

  specialistList.innerHTML = '';
  followupList.innerHTML = '';
  infoList.innerHTML = '';

  if (!Array.isArray(flags) || flags.length === 0) {
    noFlagsMsg.hidden = false;
    specialistGroup.hidden = true;
    followupGroup.hidden = true;
    infoGroup.hidden = true;
    return;
  }

  noFlagsMsg.hidden = true;
  let hasSpecialist = false, hasFollowup = false, hasInfo = false;

  for (const flag of flags) {
    const li = document.createElement('li');
    li.style.marginBottom = '0.75rem';
    li.style.padding = '0.75rem';
    li.style.border = '1px solid var(--border)';
    li.style.borderRadius = '8px';
    li.style.background = 'var(--card)';
    const actionText = flag.action ? ` → Suggested: ${actionLabel(flag.action)}` : '';
    li.innerHTML = `
      <div style="font-weight: 600; color: var(--header);">${escapeHtml(flag.rule)} (${escapeHtml(flag.severity)})</div>
      <div style="margin-top: 0.25rem;">${escapeHtml(flag.message)}${escapeHtml(actionText)}</div>
    `;
    if (flag.severity === 'SPECIALIST') {
      specialistList.appendChild(li);
      hasSpecialist = true;
    } else if (flag.severity === 'FOLLOW_UP') {
      followupList.appendChild(li);
      hasFollowup = true;
    } else {
      infoList.appendChild(li);
      hasInfo = true;
    }
  }
  specialistGroup.hidden = !hasSpecialist;
  followupGroup.hidden = !hasFollowup;
  infoGroup.hidden = !hasInfo;
}

function renderSapSnapshot(sap) {
  if (!sap) return;

  if (sap.customer) {
    document.getElementById('sap-customer').hidden = false;
    document.getElementById('sap-cust-name').textContent = sap.customer.name || '—';
    document.getElementById('sap-cust-id').textContent = sap.customer.customerId || sap.customer.id || '—';
    document.getElementById('sap-cust-status').textContent = sap.customer.isBlocked ? 'Blocked' : 'Active';
    document.getElementById('sap-cust-blocked').textContent = blockStatusLabel(sap.customer.isBlocked);
    document.getElementById('sap-cust-deleted').textContent = deletedStatusLabel(sap.customer.isDeleted);
    const paymentTerms = sap.customer.salesAreas?.[0]?.paymentTerms;
    document.getElementById('sap-cust-payment-terms').textContent = paymentTerms ? paymentTermsLabel(paymentTerms) : '—';
  }

  if (sap.quotation) {
    document.getElementById('sap-quotation').hidden = false;
    document.getElementById('sap-quote-id').textContent = sap.quotation.quotationId || '—';
    document.getElementById('sap-quote-date').textContent = sap.quotation.date || '—';
    document.getElementById('sap-quote-valid-to').textContent = sap.quotation.validTo || '—';
    document.getElementById('sap-quote-status').textContent = processStatusLabel(sap.quotation.processStatus);
    document.getElementById('sap-quote-payment-terms').textContent = sap.quotation.paymentTerms ? paymentTermsLabel(sap.quotation.paymentTerms) : '—';
    document.getElementById('sap-quote-total').textContent = money(sap.quotation.totalNet, sap.quotation.currency);
    const expiredNotice = document.getElementById('sap-quote-expired');
    if (sap.quotation.isExpired) {
      expiredNotice.textContent = 'Expired — this quotation is past its validity date.';
      expiredNotice.hidden = false;
    } else {
      expiredNotice.hidden = true;
    }
  }

  if (sap.stock) {
    document.getElementById('sap-stock').hidden = false;
    const tbody = document.getElementById('sap-stock-rows');
    const noStockMsg = document.getElementById('sap-no-stock');
    tbody.innerHTML = '';

    const hasQuotationItems = sap.quotation && Array.isArray(sap.quotation.items) && sap.quotation.items.length > 0;
    const itemsToRender = hasQuotationItems ? sap.quotation.items : (Array.isArray(sap.stock) ? sap.stock : []);

    if (itemsToRender.length === 0) {
      noStockMsg.textContent = 'No stock items to display.';
      noStockMsg.hidden = false;
      return;
    }
    noStockMsg.hidden = true;

    const stockByMaterial = new Map();
    if (Array.isArray(sap.stock)) {
      for (const s of sap.stock) {
        if (s.material) stockByMaterial.set(s.material, s);
      }
    }

    for (const item of itemsToRender) {
      const tr = document.createElement('tr');
      const material = item.material;
      const description = item.description || '—';
      const isRejected = item.isRejected === true;
      const matchedStock = material ? stockByMaterial.get(material) : null;

      let required, unit, unrestrictedQty, sufficient, otherPlantsText, stockStatusHtml;

      if (isRejected) {
        required = Number(item.qty || 0);
        unit = item.unit || '—';
        unrestrictedQty = 'Not checked';
        sufficient = false;
        otherPlantsText = 'Not checked — item rejected';
        stockStatusHtml = `<span class="chip chip--follow-up">Rejected (reason ${escapeHtml(item.rejectionReason || 'unknown')})</span>`;
        tr.style.background = '#fef2f2';
      } else if (matchedStock) {
        required = Number(matchedStock.required || item.qty || 0);
        unit = matchedStock.unit || item.unit || '—';
        unrestrictedQty = Number(matchedStock.unrestrictedQty || 0);
        sufficient = matchedStock.sufficient === true;
        otherPlantsText = (Array.isArray(matchedStock.otherPlants) && matchedStock.otherPlants.length > 0)
          ? matchedStock.otherPlants.map(p => `${p.plant}: ${Number(p.unrestrictedQty).toLocaleString()} ${p.unit || unit}`).join('; ')
          : 'No other store with sufficient stock';
        stockStatusHtml = `<span class="${sufficient ? 'chip chip--resolve-now' : 'chip chip--create-follow-up'}">${escapeHtml(sufficientLabel(sufficient))}</span>`;
      } else {
        required = Number(item.qty || 0);
        unit = item.unit || '—';
        unrestrictedQty = 'No data';
        sufficient = false;
        otherPlantsText = 'No stock data available';
        stockStatusHtml = `<span class="chip chip--create-follow-up">Unknown</span>`;
      }

      tr.innerHTML = `
        <td><span class="mono">${escapeHtml(material)}</span></td>
        <td>${escapeHtml(description)}</td>
        <td>${Number.isFinite(required) ? required.toLocaleString() : escapeHtml(String(required))}</td>
        <td>${Number.isFinite(unrestrictedQty) ? unrestrictedQty.toLocaleString() : escapeHtml(String(unrestrictedQty))}</td>
        <td>${escapeHtml(unit)}</td>
        <td>${stockStatusHtml}</td>
        <td>${escapeHtml(otherPlantsText)}</td>
        <td>${isRejected ? `<span class="chip chip--follow-up">Rejected (reason ${escapeHtml(item.rejectionReason || 'unknown')})</span>` : ''}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  if (sap.orders) {
    document.getElementById('sap-orders').hidden = false;
    const convertedStatus = document.getElementById('sap-orders-converted');
    const list = document.getElementById('sap-orders-list');
    if (!sap.orders.converted || !Array.isArray(sap.orders.orders) || sap.orders.orders.length === 0) {
      convertedStatus.textContent = 'This quotation has not been converted to an order.';
      list.innerHTML = '';
      return;
    }
    convertedStatus.textContent = `Converted — ${sap.orders.orders.length} order(s) found.`;
    list.innerHTML = '';
    for (const order of sap.orders.orders) {
      const div = document.createElement('div');
      div.className = 'order-item';
      div.style.marginBottom = '1rem';
      div.style.padding = '1rem';
      div.style.border = '1px solid var(--border)';
      div.style.borderRadius = '10px';
      div.style.background = 'var(--card)';
      div.innerHTML = `
        <div style="display: grid; gap: 0.5rem; margin-bottom: 0.75rem;">
          <div><strong>Order ID:</strong> <span class="mono">${escapeHtml(order.salesOrderId)}</span></div>
          <div><strong>Date:</strong> ${escapeHtml(order.orderDate)}</div>
          <div><strong>Total:</strong> ${escapeHtml(money(order.totalNet, order.currency))}</div>
          <div><strong>Process status:</strong> ${escapeHtml(processStatusLabel(order.processStatus))}</div>
          <div><strong>Delivery status:</strong> ${escapeHtml(deliveryStatusLabel(order.deliveryStatus))} ${order.fullyDelivered ? '(Fully delivered)' : '(Not fully delivered)'}</div>
        </div>
        <div class="table-wrap" style="max-height: 200px; overflow-y: auto;">
          <table class="stock-table" style="min-width: 600px;">
            <thead><tr><th>Item</th><th>Material</th><th>Description</th><th>Qty</th><th>Amount</th><th>Delivery</th></tr></thead>
            <tbody>
              ${(order.items || []).map(item => `
                <tr>
                  <td>${escapeHtml(item.itemNo)}</td>
                  <td><span class="mono">${escapeHtml(item.material)}</span></td>
                  <td>${escapeHtml(item.description || '—')}</td>
                  <td>${Number(item.qty || 0).toLocaleString()}</td>
                  <td>${escapeHtml(money(item.netAmount, order.currency))}</td>
                  <td>${escapeHtml(deliveryStatusLabel(item.deliveryStatus))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      list.appendChild(div);
    }
  }
}

function renderSpecialistSection(specialist, caseStatus) {
  if (!specialist) return;
  document.getElementById('spec-requested').textContent = specialist.requested ? 'Yes' : 'No';
  document.getElementById('spec-requested-at').textContent = specialist.requestedAt ? formatDateTime(specialist.requestedAt) : '—';
  // Use the actual top-level handover count from caseData
  const handoverCount = CASE_DETAIL.caseData ? (CASE_DETAIL.caseData.handoverCount || 0) : 0;
  document.getElementById('spec-handover-count').textContent = String(handoverCount);

  if (specialist.summary) {
    document.getElementById('spec-summary').hidden = false;
    document.getElementById('spec-summary-text').textContent = specialist.summary;
  }

  const adviceText = document.getElementById('spec-advice-text');
  const adviceAt = document.getElementById('spec-advice-at');
  const adviceForm = document.getElementById('spec-advice-form');
  const adviceSection = document.getElementById('spec-advice-section');

  // Advice is relevant only after a specialist handover has been requested.
  adviceSection.hidden = !specialist.requested;
  if (!specialist.requested) {
    adviceForm.hidden = true;
    return;
  }

  if (specialist.advice) {
    adviceText.textContent = specialist.advice;
    adviceText.hidden = false;
  } else {
    adviceText.textContent = 'No advice recorded yet.';
    adviceText.hidden = false;
  }

  if (specialist.adviceAt) {
    adviceAt.textContent = `Last updated: ${formatDateTime(specialist.adviceAt)}`;
    adviceAt.hidden = false;
  } else {
    adviceAt.hidden = true;
  }

  // Explicitly set advice form visibility based on case status
  adviceForm.hidden = (caseStatus !== 'AWAITING_SPECIALIST');
}

function renderFollowupSection(followUp, caseStatus, specialist) {
  const empty = document.getElementById('followup-empty');
  const details = document.getElementById('followup-details');
  const notifyAction = document.getElementById('followup-notify-action');
  const specialistForm = document.getElementById('specialist-followup-form');
  const canCreateAfterSpecialist = caseStatus === 'AWAITING_SPECIALIST' && Boolean(String(specialist && specialist.advice || '').trim());
  specialistForm.hidden = !canCreateAfterSpecialist;

  if (canCreateAfterSpecialist) {
    const dueDate = document.getElementById('case-followup-due-date');
    const tomorrow = tomorrowInAuckland();
    dueDate.min = tomorrow;
    if (!dueDate.value) dueDate.value = tomorrow;
  }

  if (!followUp || !followUp.owner) {
    empty.hidden = canCreateAfterSpecialist;
    details.hidden = true;
    notifyAction.hidden = true;
    return;
  }

  empty.hidden = true;
  details.hidden = false;
  document.getElementById('followup-owner').textContent = followUp.owner;
  document.getElementById('followup-due-date').textContent = followUp.dueDate || '—';
  document.getElementById('followup-notified').textContent = followUp.customerNotified ? 'Yes' : 'No';
  document.getElementById('followup-notified-at').textContent = followUp.notifiedAt ? formatDateTime(followUp.notifiedAt) : '—';

  // Show notification action if not yet notified and case not closed
  notifyAction.hidden = followUp.customerNotified || (caseStatus === 'CLOSED');
}

function renderHistory(history) {
  const list = document.getElementById('history-list');
  const noHistory = document.getElementById('no-history-message');
  list.innerHTML = '';

  if (!Array.isArray(history) || history.length === 0) {
    noHistory.hidden = false;
    return;
  }

  noHistory.hidden = true;
  for (const entry of history) {
    const li = document.createElement('li');
    li.style.marginBottom = '0.75rem';
    li.style.padding = '0.75rem';
    li.style.border = '1px solid var(--border)';
    li.style.borderRadius = '8px';
    li.style.background = 'var(--card)';
    li.innerHTML = `
      <div style="font-weight: 600; color: var(--header);">${escapeHtml(formatDateTime(entry.at))}</div>
      <div style="margin-top: 0.25rem;">${escapeHtml(entry.action)}</div>
    `;
    list.appendChild(li);
  }
}

function renderCloseSection(caseData) {
  const closeAction = document.getElementById('close-action');
  const alreadyClosed = document.getElementById('already-closed-message');
  const unavailable = document.getElementById('close-unavailable-message');
  const specialistReady = caseData.status === 'AWAITING_SPECIALIST'
    && Boolean(String(caseData.specialist && caseData.specialist.advice || '').trim());
  const canClose = ['RESOLVED', 'FOLLOW_UP'].includes(caseData.status) || specialistReady;

  if (caseData.status === 'CLOSED') {
    closeAction.hidden = true;
    alreadyClosed.hidden = false;
    unavailable.hidden = true;
  } else {
    closeAction.hidden = !canClose;
    alreadyClosed.hidden = true;
    unavailable.hidden = canClose;
  }
}

function showCaseError(message) {
  const errorBanner = document.getElementById('global-error');
  const errorText = document.getElementById('global-error-text');
  const retryBtn = document.getElementById('global-error-retry');
  const loading = document.getElementById('loading-state');
  const content = document.getElementById('case-content');

  loading.hidden = true;
  content.hidden = true;
  errorBanner.hidden = false;
  errorText.textContent = message;
  retryBtn.hidden = false;
}

function showCaseLoading() {
  document.getElementById('loading-state').hidden = false;
  document.getElementById('global-error').hidden = true;
  document.getElementById('case-content').hidden = true;
}

function showCaseContent() {
  document.getElementById('loading-state').hidden = true;
  document.getElementById('global-error').hidden = true;
  document.getElementById('case-content').hidden = false;
}

async function loadCaseDetail(caseId) {
  showCaseLoading();
  try {
    const data = await requestJson(`/api/cases/${encodeURIComponent(caseId)}`);
    CASE_DETAIL.caseData = data;
    renderCaseDetail(data);
    showCaseContent();
  } catch (error) {
    showCaseError(error.message || 'Failed to load case. Please try again.');
  }
}

function renderCaseDetail(caseData) {
  renderCaseSummary(caseData);
  const flags = caseData.flags && caseData.flags.length > 0 ? caseData.flags : (caseData.sapSnapshot && caseData.sapSnapshot.flags ? caseData.sapSnapshot.flags : []);
  renderCaseFlags(flags);
  if (caseData.sapSnapshot) renderSapSnapshot(caseData.sapSnapshot);
  renderSpecialistSection(caseData.specialist, caseData.status);
  renderFollowupSection(caseData.followUp, caseData.status, caseData.specialist);
  renderHistory(caseData.history);
  renderCloseSection(caseData);

  // Update Result page links
  const caseId = caseData.caseId;
  const resultHref = `result.html?id=${encodeURIComponent(caseId)}`;
  const headerLink = document.getElementById('result-link');
  if (headerLink) {
    headerLink.href = resultHref;
    headerLink.hidden = false;
  }
  const breadcrumbLink = document.getElementById('breadcrumb-result-link');
  if (breadcrumbLink) {
    breadcrumbLink.href = resultHref;
    breadcrumbLink.hidden = false;
  }
}

async function handleSaveAdvice(caseId) {
  const textarea = document.getElementById('spec-advice-input');
  const btn = document.getElementById('btn-save-advice');
  const status = document.getElementById('spec-advice-status');
  if (!textarea || !btn || CASE_DETAIL.isSubmitting) return;

  const advice = textarea.value.trim();
  if (!advice) {
    status.textContent = 'Advice cannot be blank.';
    status.style.color = 'var(--danger-text)';
    return;
  }

  CASE_DETAIL.isSubmitting = true;
  btn.disabled = true;
  status.textContent = 'Saving…';
  status.style.color = 'var(--muted)';

  try {
    const updated = await requestJson(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialist: { advice } })
    });
    CASE_DETAIL.caseData = updated;
    status.textContent = 'Advice saved.';
    status.style.color = 'var(--success-text)';
    // Refresh specialist section and history
    renderSpecialistSection(updated.specialist, updated.status);
    renderFollowupSection(updated.followUp, updated.status, updated.specialist);
    renderCloseSection(updated);
    renderHistory(updated.history);
  } catch (error) {
    status.textContent = error.message || 'Failed to save advice. Please try again.';
    status.style.color = 'var(--danger-text)';
  } finally {
    CASE_DETAIL.isSubmitting = false;
    btn.disabled = false;
  }
}

async function handleMarkNotified(caseId) {
  const btn = document.getElementById('btn-mark-notified');
  const status = document.getElementById('followup-notify-status');
  if (!btn || CASE_DETAIL.isSubmitting) return;

  CASE_DETAIL.isSubmitting = true;
  btn.disabled = true;
  status.textContent = 'Recording notification…';
  status.style.color = 'var(--muted)';

  try {
    const updated = await requestJson(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followUp: { customerNotified: true } })
    });
    CASE_DETAIL.caseData = updated;
    status.textContent = 'Customer marked as notified.';
    status.style.color = 'var(--success-text)';
    // Refresh follow-up section and history
    renderFollowupSection(updated.followUp, updated.status, updated.specialist);
    renderHistory(updated.history);
  } catch (error) {
    status.textContent = error.message || 'Failed to record notification. Please try again.';
    status.style.color = 'var(--danger-text)';
  } finally {
    CASE_DETAIL.isSubmitting = false;
    btn.disabled = false;
  }
}

async function handleSpecialistFollowup(caseId) {
  const form = document.getElementById('specialist-followup-form');
  const btn = document.getElementById('btn-specialist-followup');
  const status = document.getElementById('specialist-followup-status');
  if (!form || !btn || CASE_DETAIL.isSubmitting) return;

  const owner = document.getElementById('case-followup-owner').value.trim();
  const dueDate = document.getElementById('case-followup-due-date').value;
  const customerNotified = document.getElementById('case-followup-customer-notified').checked;
  if (!owner || !dueDate || dueDate < tomorrowInAuckland()) {
    status.textContent = !owner ? 'Enter a follow-up owner.' : 'Choose a future due date.';
    status.style.color = 'var(--danger-text)';
    return;
  }

  CASE_DETAIL.isSubmitting = true;
  btn.disabled = true;
  status.textContent = 'Creating follow-up…';
  status.style.color = 'var(--muted)';
  try {
    const updated = await requestJson(`/api/cases/${encodeURIComponent(caseId)}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, dueDate, customerNotified })
    });
    CASE_DETAIL.caseData = updated;
    renderCaseDetail(updated);
  } catch (error) {
    status.textContent = error.message || 'Failed to create follow-up. Please try again.';
    status.style.color = 'var(--danger-text)';
  } finally {
    CASE_DETAIL.isSubmitting = false;
    btn.disabled = false;
  }
}

async function handleCloseCase(caseId) {
  const btn = document.getElementById('btn-close-case');
  const status = document.getElementById('close-status');
  if (!btn || CASE_DETAIL.isSubmitting) return;

  if (!confirm('Are you sure you want to close this case? This action cannot be undone.')) {
    return;
  }

  CASE_DETAIL.isSubmitting = true;
  btn.disabled = true;
  status.textContent = 'Closing case…';
  status.style.color = 'var(--muted)';

  try {
    const updated = await requestJson(`/api/cases/${encodeURIComponent(caseId)}/close`, { method: 'POST' });
    CASE_DETAIL.caseData = updated;
    status.textContent = 'Case closed.';
    status.style.color = 'var(--success-text)';
    // Refresh entire page content
    renderCaseDetail(updated);
  } catch (error) {
    status.textContent = error.message || 'Failed to close case. Please try again.';
    status.style.color = 'var(--danger-text)';
    btn.disabled = false;
    CASE_DETAIL.isSubmitting = false;
  }
}

function initCaseDetailPage() {
  const caseId = getCaseIdFromUrl();
  if (!caseId) {
    document.getElementById('loading-state').hidden = true;
    document.getElementById('global-error').hidden = false;
    document.getElementById('global-error-text').textContent = 'No case ID provided. Please return to Dashboard or New Enquiry.';
    document.getElementById('global-error-retry').hidden = true;
    return;
  }
  CASE_DETAIL.caseId = caseId;
  loadCaseDetail(caseId);

  const retryBtn = document.getElementById('global-error-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadCaseDetail(caseId));
  }

  const saveAdviceBtn = document.getElementById('btn-save-advice');
  if (saveAdviceBtn) {
    saveAdviceBtn.addEventListener('click', () => handleSaveAdvice(caseId));
  }

  const markNotifiedBtn = document.getElementById('btn-mark-notified');
  if (markNotifiedBtn) {
    markNotifiedBtn.addEventListener('click', () => handleMarkNotified(caseId));
  }

  const specialistFollowupForm = document.getElementById('specialist-followup-form');
  if (specialistFollowupForm) {
    specialistFollowupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleSpecialistFollowup(caseId);
    });
  }

  const closeCaseBtn = document.getElementById('btn-close-case');
  if (closeCaseBtn) {
    closeCaseBtn.addEventListener('click', () => handleCloseCase(caseId));
  }
}

App.registerPage('case-detail', initCaseDetailPage);

document.addEventListener('DOMContentLoaded', () => App.initPages());
