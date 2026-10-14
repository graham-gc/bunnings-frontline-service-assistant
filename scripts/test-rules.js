const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function apiCheck(body) {
  const response = await fetch(`${BASE}/api/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

let failures = 0;
function report(name, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'} - ${name}${detail ? `: ${detail}` : ''}`);
  if (!passed) failures += 1;
}

function ruleSet(data) {
  return Array.isArray(data && data.flags) ? data.flags.map((flag) => flag.rule).sort() : [];
}

async function run() {
  console.log('Bunnings rules acceptance tests');

  // A - Standard Retail
  {
    const { status, data } = await apiCheck({
      pathway: 'STANDARD_RETAIL',
      productId: 'MZ-TG-A10',
      requestedQty: 10,
      plant: '1710'
    });
    const passed = status === 200
      && data && data.recommendation === 'RESOLVE_NOW'
      && Array.isArray(data.stock) && data.stock[0] && data.stock[0].unrestrictedQty === 63275
      && ruleSet(data).length === 0;
    report('A Standard Retail', passed, passed ? '63275 PC, no rules, RESOLVE_NOW' : JSON.stringify(data));
  }

  // B - Trade
  {
    const { status, data } = await apiCheck({
      pathway: 'TRADE',
      customerId: 'USCU-CUS01',
      quotationId: '20000003',
      plant: '1710'
    });
    const rules = ruleSet(data);
    const passed = status === 200
      && data && data.recommendation === 'CREATE_FOLLOW_UP'
      && rules.includes('R3') && rules.includes('R4')
      && !rules.includes('R6') && !rules.includes('R1');
    report('B Trade', passed, passed ? `rules ${rules.join(', ')}, CREATE_FOLLOW_UP` : JSON.stringify(data));
  }

  // C1 - Special Order
  {
    const { status, data } = await apiCheck({
      pathway: 'SPECIAL_ORDER',
      productId: 'D2O_XY00174197',
      requestedQty: 2,
      plant: '1710'
    });
    const rules = ruleSet(data);
    const passed = status === 200
      && data && data.recommendation === 'CREATE_FOLLOW_UP'
      && rules.includes('R5b')
      && Array.isArray(data.stock) && data.stock[0]
      && data.stock[0].unrestrictedQty === 0
      && (!data.stock[0].otherPlants || data.stock[0].otherPlants.every((plant) => plant.unrestrictedQty < 2));
    report('C1 Special Order', passed, passed ? '0 PC, R5b SPECIAL_ORDER, CREATE_FOLLOW_UP' : JSON.stringify(data));
  }

  // C2 - Cross-store transfer
  {
    const { status, data } = await apiCheck({
      pathway: 'STANDARD_RETAIL',
      productId: 'FG226',
      requestedQty: 200,
      plant: '1710'
    });
    const rules = ruleSet(data);
    const suitable = (data && data.stock && data.stock[0] && Array.isArray(data.stock[0].otherPlants))
      ? data.stock[0].otherPlants.find((plant) => plant.plant === '1010')
      : undefined;
    const passed = status === 200
      && data && data.recommendation === 'CREATE_FOLLOW_UP'
      && rules.includes('R5a')
      && data.stock[0].unrestrictedQty === 100
      && suitable && suitable.unrestrictedQty === 1000;
    report('C2 Transfer', passed, passed ? '100 PC store, 1000 PC at 1010, R5a TRANSFER, CREATE_FOLLOW_UP' : JSON.stringify(data));
  }

  // D - Trade / order status (corrected to live SAP Sandbox data)
  {
    const { status, data } = await apiCheck({
      pathway: 'TRADE',
      customerId: 'USCU-CUS01',
      quotationId: '20000004',
      plant: '1710'
    });
    const rules = ruleSet(data);
    const hasInfo = (data && data.flags || []).some((flag) => flag.rule === 'R2' && flag.severity === 'INFO');
    const hasR4Item30 = (data && data.flags || []).some((flag) =>
      flag.rule === 'R4'
      && flag.action === 'CHECK_REJECTION'
      && /Item 30/.test(String(flag.message))
      && String(flag.message).includes('(reason 70)')
    );
    const passed = status === 200
      && data && data.recommendation === 'CREATE_FOLLOW_UP'
      && hasInfo
      && hasR4Item30
      && !rules.includes('R3')
      && !rules.includes('R1')
      && !rules.includes('R5a')
      && !rules.includes('R5b')
      && !rules.includes('R6');
    report('D Trade / order status', passed, passed ? 'R2 INFO + R4 item 30 reason 70, no R3, CREATE_FOLLOW_UP' : JSON.stringify(data));
  }

  // Invalid pathway
  {
    const { status, data } = await apiCheck({ pathway: 'NOT_A_PATHWAY' });
    const passed = status === 400 && data && data.error && data.error.code === 'BAD_REQUEST';
    report('Invalid pathway', passed, passed ? 'HTTP 400 BAD_REQUEST' : JSON.stringify(data));
  }

  // Missing required input
  {
    const { status, data } = await apiCheck({ pathway: 'STANDARD_RETAIL' });
    const passed = status === 400 && data && data.error && data.error.code === 'BAD_REQUEST';
    report('Missing required input', passed, passed ? 'HTTP 400 BAD_REQUEST' : JSON.stringify(data));
  }

  console.log(failures === 0 ? 'All rules tests passed.' : `${failures} rules test(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

run().catch((error) => {
  console.error('FAIL - Test runner crashed:', error.message);
  process.exit(1);
});
