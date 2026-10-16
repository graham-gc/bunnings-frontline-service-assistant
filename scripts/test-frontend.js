const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const elements = {
  'quotation-loading': { hidden: true },
  'quotation-error': { hidden: true, textContent: '' },
  'quotation-list': { innerHTML: '' }
};

const context = {
  console,
  Intl,
  Date,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  window: { location: { search: '', href: '' } },
  document: {
    body: { dataset: {} },
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement() { return { appendChild() {}, addEventListener() {}, classList: { add() {} } }; }
  },
  fetch: async () => ({
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ error: { message: 'SAP is not responding.' } })
  })
};

vm.createContext(context);
vm.runInContext(source, context);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const checkedInput = {
    pathway: 'STANDARD_RETAIL',
    customerId: null,
    quotationId: null,
    productId: 'P1',
    requestedQty: 1,
    plant: '1710'
  };
  const snapshot = { source: 'live', recommendation: 'RESOLVE_NOW', flags: [] };
  const casePayload = context.buildCasePayload(snapshot, checkedInput, 'Product availability');
  checkedInput.productId = 'P2';
  assert(casePayload.productId === 'P1' && casePayload.requestedQty === 1, 'Case payload did not preserve the checked input snapshot');
  console.log('PASS - Case save uses the same immutable input as the SAP check');

  assert(context.processStatusLabel('A') === 'Not yet processed', 'Quotation status A was not translated');
  assert(context.processStatusLabel('B') === 'Partially processed', 'Quotation status B was not translated');
  assert(context.processStatusLabel('C') === 'Completely processed', 'Quotation status C was not translated');
  console.log('PASS - Quotation process status uses plain English');

  const tomorrow = context.tomorrowInAuckland();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(tomorrow) && tomorrow > context.localIsoDate(), 'Auckland tomorrow date is invalid');
  console.log('PASS - Follow-up default is tomorrow in Pacific/Auckland');

  await context.loadQuotations('USCU-CUS01');
  assert(elements['quotation-loading'].hidden === true, 'Quotation loading state did not finish');
  assert(elements['quotation-error'].hidden === false, 'Quotation error was not shown');
  assert(elements['quotation-error'].textContent === 'SAP is not responding.', 'Quotation error message was not preserved');
  console.log('PASS - Quotation load failures are visible');
}

run().catch((error) => {
  console.error(`FAIL - ${error.message}`);
  process.exitCode = 1;
});
