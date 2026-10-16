const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_DIR, 'data');
const CASES_FILE = path.join(DATA_DIR, 'cases.json');
const BACKUP_FILE = path.join(DATA_DIR, 'cases.json.test-backup');
const PORT = process.env.CASE_TEST_PORT || '3011';
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let originalCases = null;
let hadOriginal = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function futureDate(days = 1) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch (error) {
      // Server is still starting.
    }
    await wait(200);
  }
  throw new Error('Test server did not become ready');
}

async function request(pathname, options = {}) {
  const response = await fetch(`${BASE}${pathname}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checkScenarios = {
  A: {
    pathway: 'STANDARD_RETAIL',
    customerId: null,
    quotationId: null,
    productId: 'MZ-TG-A10',
    requestedQty: 10,
    plant: '1710',
    retrievalReason: 'Product availability'
  },
  B: {
    pathway: 'TRADE',
    customerId: 'USCU-CUS01',
    quotationId: '20000003',
    productId: null,
    requestedQty: null,
    plant: '1710',
    retrievalReason: 'Quote status'
  },
  C1: {
    pathway: 'SPECIAL_ORDER',
    customerId: null,
    quotationId: null,
    productId: 'D2O_XY00174197',
    requestedQty: 2,
    plant: '1710',
    retrievalReason: 'Product availability'
  },
  C2: {
    pathway: 'STANDARD_RETAIL',
    customerId: null,
    quotationId: null,
    productId: 'FG226',
    requestedQty: 200,
    plant: '1710',
    retrievalReason: 'Product availability'
  },
  D: {
    pathway: 'TRADE',
    customerId: 'USCU-CUS01',
    quotationId: '20000004',
    productId: null,
    requestedQty: null,
    plant: '1710',
    retrievalReason: 'Order status'
  }
};

async function createCase(scenarioKey) {
  const scenario = checkScenarios[scenarioKey];
  const checkResponse = await request('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pathway: scenario.pathway,
      customerId: scenario.customerId,
      quotationId: scenario.quotationId,
      productId: scenario.productId,
      requestedQty: scenario.requestedQty,
      plant: scenario.plant
    })
  });
  assert(checkResponse.status === 200, `${scenarioKey} check failed: ${JSON.stringify(checkResponse.data)}`);

  const response = await request('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pathway: scenario.pathway,
      customerId: scenario.customerId,
      quotationId: scenario.quotationId,
      productId: scenario.productId,
      requestedQty: scenario.requestedQty,
      retrievalReason: scenario.retrievalReason,
      sapSnapshot: checkResponse.data
    })
  });
  assert(response.status === 201, `${scenarioKey} case creation failed: ${JSON.stringify(response.data)}`);
  return response.data;
}

async function runTests() {
  console.log('Case lifecycle and KPI tests');

  const health = await request('/api/health');
  assert(health.status === 200, 'Health endpoint is not available');

  // Start with an empty, isolated case store.
  try {
    originalCases = await fs.promises.readFile(CASES_FILE, 'utf8');
    hadOriginal = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    hadOriginal = false;
  }
  if (hadOriginal) await fs.promises.writeFile(BACKUP_FILE, originalCases, 'utf8');
  await fs.promises.writeFile(CASES_FILE, '[]\n', 'utf8');

  let failures = 0;
  function pass(name, detail = '') {
    console.log(`PASS - ${name}${detail ? `: ${detail}` : ''}`);
  }
  function fail(name, error) {
    failures += 1;
    console.log(`FAIL - ${name}: ${error.message}`);
  }

  // 1. Invalid create requests.
  try {
    const missingPathway = await request('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        retrievalReason: 'Testing',
        sapSnapshot: { source: 'live', recommendation: 'RESOLVE_NOW', flags: [] }
      })
    });
    assert(missingPathway.status === 400 && missingPathway.data.error.code === 'BAD_REQUEST', 'Missing pathway was not rejected');
    pass('Create rejects missing pathway');
  } catch (error) {
    fail('Create rejects missing pathway', error);
  }

  try {
    const missingSnapshot = await request('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pathway: 'STANDARD_RETAIL',
        retrievalReason: 'Testing',
        sapSnapshot: null
      })
    });
    assert(missingSnapshot.status === 400 && missingSnapshot.data.error.code === 'BAD_REQUEST', 'Missing snapshot was not rejected');
    pass('Create rejects missing snapshot');
  } catch (error) {
    fail('Create rejects missing snapshot', error);
  }

  try {
    const nonLiveSnapshot = await request('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pathway: 'STANDARD_RETAIL',
        retrievalReason: 'Testing',
        sapSnapshot: { source: 'mock', recommendation: 'RESOLVE_NOW', flags: [] }
      })
    });
    assert(nonLiveSnapshot.status === 400 && nonLiveSnapshot.data.error.code === 'BAD_REQUEST', 'Non-live snapshot was not rejected');
    pass('Create rejects non-live snapshot');
  } catch (error) {
    fail('Create rejects non-live snapshot', error);
  }

  // 2. Create and read case.
  let caseA;
  try {
    caseA = await createCase('A');
    assert(caseA.caseId === 'TC-0001', 'First case ID is not TC-0001');
    assert(caseA.status === 'OPEN', 'New case is not OPEN');
    assert(caseA.outcome === null, 'New case has an outcome');
    assert(Array.isArray(caseA.history) && caseA.history.length === 1 && caseA.history[0].action === 'Case created', 'Case created history is wrong');
    pass('Create case', caseA.caseId);
  } catch (error) {
    fail('Create case', error);
  }

  try {
    const list = await request('/api/cases');
    assert(list.status === 200 && Array.isArray(list.data) && list.data.length === 1, 'Case list failed');
    pass('List cases', `count=${list.data.length}`);
  } catch (error) {
    fail('List cases', error);
  }

  try {
    const filtered = await request('/api/cases?status=OPEN');
    assert(filtered.status === 200 && Array.isArray(filtered.data) && filtered.data.length === 1, 'Filtered case list failed');
    pass('Filtered case list');
  } catch (error) {
    fail('Filtered case list', error);
  }

  try {
    const unknown = await request('/api/cases/TC-9999');
    assert(unknown.status === 404 && unknown.data.error.code === 'NOT_FOUND', 'Unknown case did not return 404');
    pass('Unknown case returns 404');
  } catch (error) {
    fail('Unknown case returns 404', error);
  }

  try {
    const one = await request(`/api/cases/${caseA.caseId}`);
    assert(one.status === 200 && one.data.caseId === caseA.caseId, 'Get one case failed');
    pass('Get one case');
  } catch (error) {
    fail('Get one case', error);
  }

  // 3. PATCH forbidden and allowed fields.
  try {
    const forbidden = await request(`/api/cases/${caseA.caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'FCR' })
    });
    assert(forbidden.status === 400 && forbidden.data.error.code === 'BAD_REQUEST', 'Forbidden PATCH field was accepted');
    pass('PATCH rejects forbidden fields');
  } catch (error) {
    fail('PATCH rejects forbidden fields', error);
  }

  try {
    const beforeRequest = await request(`/api/cases/${caseA.caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialist: { advice: 'Check stock transfer options.' } })
    });
    assert(beforeRequest.status === 409 && beforeRequest.data.error.code === 'INVALID_STATE', 'Advice was accepted before specialist request');
    pass('Specialist advice requires an active specialist review');
  } catch (error) {
    fail('Specialist advice state guard', error);
  }

  // 4. Specialist request.
  try {
    const requested = await request(`/api/cases/${caseA.caseId}/request-specialist`, { method: 'POST' });
    assert(requested.status === 200, 'Request specialist failed');
    assert(requested.data.status === 'AWAITING_SPECIALIST', 'Request specialist did not change status');
    assert(requested.data.specialist.requested === true, 'Specialist requested flag was not set');
    assert(requested.data.specialist.requestedAt !== null, 'Specialist requestedAt was not set');
    assert(typeof requested.data.specialist.summary === 'string' && requested.data.specialist.summary.includes(caseA.caseId), 'Specialist summary is invalid');
    assert(!requested.data.specialist.summary.includes('SAP_API_KEY'), 'Specialist summary leaked a credential');
    assert(requested.data.handoverCount === 1, 'Handover count was not incremented');
    assert(requested.data.outcome === 'NON_FCR', 'Specialist handover did not record NON_FCR');
    assert(requested.data.outcomeAt !== null, 'Specialist handover did not record outcome time');
    assert(typeof requested.data.contactDurationSec === 'number', 'Specialist handover did not record contact duration');
    pass('Request specialist', `handoverCount=${requested.data.handoverCount}`);

    const repeated = await request(`/api/cases/${caseA.caseId}/request-specialist`, { method: 'POST' });
    assert(repeated.status === 409 && repeated.data.error.code === 'INVALID_STATE', 'Repeated specialist request was accepted');
    const unchanged = await request(`/api/cases/${caseA.caseId}`);
    assert(unchanged.data.handoverCount === 1, 'Repeated specialist request changed handover count');
    pass('Repeated specialist request is rejected');
  } catch (error) {
    fail('Request specialist', error);
  }

  try {
    const allowed = await request(`/api/cases/${caseA.caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialist: { advice: 'Check stock transfer options.' } })
    });
    assert(allowed.status === 200, 'Specialist advice PATCH failed');
    assert(allowed.data.specialist.advice === 'Check stock transfer options.', 'Specialist advice was not saved');
    assert(allowed.data.specialist.adviceAt !== null, 'Specialist advice timestamp was not set');
    pass('Specialist advice saved during review');

    const specialistFollowUp = await request(`/api/cases/${caseA.caseId}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'Specialist team', dueDate: futureDate(2), customerNotified: false })
    });
    assert(specialistFollowUp.status === 200 && specialistFollowUp.data.status === 'FOLLOW_UP', 'Specialist follow-up failed');
    assert(specialistFollowUp.data.outcome === 'NON_FCR', 'Specialist follow-up changed NON_FCR outcome');
    pass('Specialist advice can continue to follow-up');
  } catch (error) {
    fail('Specialist advice and follow-up', error);
  }

  // 5. Resolve, follow-up, close using a second case.
  let caseB;
  try {
    caseB = await createCase('B');
    assert(caseB.caseId === 'TC-0002', 'Second case ID is not TC-0002');
    pass('Create follow-up case', caseB.caseId);
  } catch (error) {
    fail('Create follow-up case', error);
  }

  try {
    const invalidFollowUp = await request(`/api/cases/${caseB.caseId}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: '', dueDate: 'not-a-date', customerNotified: true })
    });
    assert(invalidFollowUp.status === 400 && invalidFollowUp.data.error.code === 'BAD_REQUEST', 'Invalid follow-up was accepted');
    pass('Follow-up validates owner and due date');
  } catch (error) {
    fail('Follow-up validates owner and due date', error);
  }

  try {
    const followUp = await request(`/api/cases/${caseB.caseId}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'Alex', dueDate: futureDate(2), customerNotified: true })
    });
    assert(followUp.status === 200, 'Follow-up creation failed');
    assert(followUp.data.status === 'FOLLOW_UP', 'Follow-up status was not set');
    assert(followUp.data.outcome === 'NON_FCR', 'Follow-up outcome was not NON_FCR');
    assert(followUp.data.followUp.owner === 'Alex', 'Follow-up owner was not saved');
    assert(followUp.data.followUp.customerNotified === true, 'Customer notified flag was not saved');
    assert(followUp.data.followUp.notifiedAt !== null, 'Notification timestamp was not recorded');
    assert(typeof followUp.data.contactDurationSec === 'number', 'Contact duration was not recorded');
    pass('Create follow-up records notification without sending');
  } catch (error) {
    fail('Create follow-up records notification without sending', error);
  }

  try {
    const pastDue = await request(`/api/cases/${caseB.caseId}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'Alex', dueDate: '2000-01-01', customerNotified: false })
    });
    assert(pastDue.status === 400 && pastDue.data.error.code === 'BAD_REQUEST', 'Past due date was accepted');
    pass('Follow-up rejects a past due date');
  } catch (error) {
    fail('Follow-up past-date validation', error);
  }

  try {
    const closed = await request(`/api/cases/${caseB.caseId}/close`, { method: 'POST' });
    assert(closed.status === 200 && closed.data.status === 'CLOSED', 'Close case failed');
    pass('Close case');

    const closedHistoryLength = closed.data.history.length;
    const blockedMutations = [
      {
        name: 'PATCH',
        path: `/api/cases/${caseB.caseId}`,
        options: {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specialist: { advice: 'This must not be saved.' } })
        }
      },
      {
        name: 'resolve',
        path: `/api/cases/${caseB.caseId}/resolve`,
        options: { method: 'POST' }
      },
      {
        name: 'request specialist',
        path: `/api/cases/${caseB.caseId}/request-specialist`,
        options: { method: 'POST' }
      },
      {
        name: 'follow-up',
        path: `/api/cases/${caseB.caseId}/follow-up`,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: 'Alex', dueDate: futureDate(3), customerNotified: false })
        }
      },
      {
        name: 'close again',
        path: `/api/cases/${caseB.caseId}/close`,
        options: { method: 'POST' }
      }
    ];

    for (const mutation of blockedMutations) {
      const response = await request(mutation.path, mutation.options);
      assert(
        response.status === 409 && response.data.error.code === 'CASE_CLOSED',
        `Closed case accepted ${mutation.name}`
      );
    }

    const unchanged = await request(`/api/cases/${caseB.caseId}`);
    assert(unchanged.status === 200 && unchanged.data.status === 'CLOSED', 'Closed case status changed');
    assert(unchanged.data.history.length === closedHistoryLength, 'Rejected closed-case operations changed history');
    pass('Closed case rejects all further mutations');
  } catch (error) {
    fail('Close case and enforce immutability', error);
  }

  let caseC;
  try {
    caseC = await createCase('A');
    assert(caseC.caseId === 'TC-0003', 'Third case ID is not TC-0003');
    const resolved = await request(`/api/cases/${caseC.caseId}/resolve`, { method: 'POST' });
    assert(resolved.status === 200, 'Resolve case failed');
    assert(resolved.data.status === 'RESOLVED', 'Resolve did not set status');
    assert(resolved.data.outcome === 'FCR', 'Resolve did not set FCR outcome');
    assert(resolved.data.outcomeAt !== null, 'Resolve did not set outcomeAt');
    assert(typeof resolved.data.contactDurationSec === 'number', 'Resolve did not set contact duration');
    pass('Resolve case');
  } catch (error) {
    fail('Resolve case', error);
  }

  // Reset to an empty store for deterministic KPI data.
  await fs.promises.writeFile(CASES_FILE, '[]\n', 'utf8');

  const kpiScenarios = ['A', 'B', 'C1', 'C2', 'D'];
  const kpiCases = [];
  for (const scenarioKey of kpiScenarios) {
    const created = await createCase(scenarioKey);
    kpiCases.push({ key: scenarioKey, caseId: created.caseId });
  }

  // Apply corrected scenario outcomes: A resolves as FCR; B, C1, C2 and D are follow-ups.
  const resolveA = await request(`/api/cases/${kpiCases[0].caseId}/resolve`, { method: 'POST' });
  assert(resolveA.status === 200 && resolveA.data.outcome === 'FCR', 'KPI scenario A did not resolve as FCR');

  for (const item of kpiCases.slice(1)) {
    const followUp = await request(`/api/cases/${item.caseId}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'Alex', dueDate: futureDate(2), customerNotified: false })
    });
    assert(followUp.status === 200 && followUp.data.status === 'FOLLOW_UP' && followUp.data.outcome === 'NON_FCR', `KPI scenario ${item.key} follow-up failed`);
  }

  try {
    const kpi = await request('/api/kpi');
    assert(kpi.status === 200, 'KPI endpoint failed');
    assert(kpi.data.enquiriesToday === 5, `KPI enquiriesToday was ${kpi.data.enquiriesToday}, expected 5`);
    assert(kpi.data.fcrRate === 20, `KPI fcrRate was ${kpi.data.fcrRate}, expected 20`);
    assert(kpi.data.openFollowUps === 4, `KPI openFollowUps was ${kpi.data.openFollowUps}, expected 4`);
    assert(kpi.data.handoverRate === 0, `KPI handoverRate was ${kpi.data.handoverRate}, expected 0`);
    assert(typeof kpi.data.avgContactDurationSec === 'number', 'KPI average duration is not numeric');
    pass('KPI', `enquiries=${kpi.data.enquiriesToday}, fcrRate=${kpi.data.fcrRate}, openFollowUps=${kpi.data.openFollowUps}, handoverRate=${kpi.data.handoverRate}`);
  } catch (error) {
    fail('KPI', error);
  }

  return failures;
}

async function main() {
  serverProcess = spawn('node', ['server/index.js'], {
    cwd: PROJECT_DIR,
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', () => {});
  serverProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  let failures = 1;
  try {
    await waitForHealth(10000);
    failures = await runTests();
  } catch (error) {
    console.log(`FAIL - Test runner crashed: ${error.message}`);
    failures = 1;
  } finally {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await new Promise((resolve) => {
        serverProcess.once('close', resolve);
        setTimeout(resolve, 2000);
      });
    }

    try {
      if (hadOriginal) {
        await fs.promises.writeFile(CASES_FILE, originalCases, 'utf8');
      } else {
        await fs.promises.rm(CASES_FILE, { force: true });
      }
      await fs.promises.rm(BACKUP_FILE, { force: true });
    } catch (error) {
      console.log(`FAIL - Restore cases.json: ${error.message}`);
      failures = 1;
    }

    const finalCases = await fs.promises.readFile(CASES_FILE, 'utf8').catch(() => '[]');
    const parsed = JSON.parse(finalCases);
    if (!Array.isArray(parsed) || parsed.length !== (hadOriginal ? JSON.parse(originalCases).length : 0)) {
      console.log('FAIL - cases.json was not restored correctly');
      failures = 1;
    } else {
      console.log('cases.json restored successfully');
    }
  }

  process.exitCode = failures === 0 ? 0 : 1;
  console.log(failures === 0 ? 'All case tests passed.' : `${failures} case test(s) failed.`);
}

main().catch((error) => {
  console.error('FAIL - Test runner crashed:', error.message);
  process.exit(1);
});
