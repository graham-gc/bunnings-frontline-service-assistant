const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const casesPath = path.join(dataDir, 'cases.json');

// Serialise writes so two requests cannot corrupt the JSON file.
let writeLock = Promise.resolve();

function withWriteLock(task) {
  const run = () => Promise.resolve().then(task);
  writeLock = writeLock.then(run, run);
  return writeLock;
}

async function ensureDataDir() {
  await fs.promises.mkdir(dataDir, { recursive: true });
}

async function atomicWriteCases(cases) {
  await ensureDataDir();
  const tempPath = `${casesPath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(cases, null, 2) + '\n', 'utf8');
  await fs.promises.rename(tempPath, casesPath);
}

async function readCases() {
  await ensureDataDir();
  try {
    const text = await fs.promises.readFile(casesPath, 'utf8');
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error('Case storage must contain an array');
    }
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.promises.writeFile(casesPath, '[]\n', 'utf8');
    return [];
  }
}

async function writeCases(cases) {
  if (!Array.isArray(cases)) throw new Error('Cases must be an array');
  return withWriteLock(async () => {
    await atomicWriteCases(cases);
  });
}

async function mutate(mutator) {
  return withWriteLock(async () => {
    const cases = await readCases();
    const result = await mutator(cases);
    await atomicWriteCases(cases);
    return result;
  });
}

function nextCaseId(cases) {
  let highest = 0;
  for (const item of cases) {
    const match = /^TC-(\d+)$/.exec(String(item && item.caseId ? item.caseId : ''));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `TC-${String(highest + 1).padStart(4, '0')}`;
}

function buildCase(input) {
  const now = new Date().toISOString();
  const snapshot = input.sapSnapshot && typeof input.sapSnapshot === 'object' && !Array.isArray(input.sapSnapshot)
    ? input.sapSnapshot
    : {};

  return {
    caseId: null,
    pathway: input.pathway,
    status: 'OPEN',
    createdAt: now,
    customerId: input.customerId == null ? null : input.customerId,
    customerName: snapshot.customer && typeof snapshot.customer.name === 'string'
      ? snapshot.customer.name
      : (input.customerId == null ? null : String(input.customerId)),
    quotationId: input.quotationId == null ? null : input.quotationId,
    productId: input.productId == null ? null : input.productId,
    requestedQty: input.requestedQty == null ? null : input.requestedQty,
    retrievalReason: input.retrievalReason,
    sapSnapshot: snapshot,
    flags: Array.isArray(snapshot.flags) ? snapshot.flags : [],
    recommendation: typeof snapshot.recommendation === 'string' ? snapshot.recommendation : null,
    specialist: {
      requested: false,
      requestedAt: null,
      summary: '',
      advice: '',
      adviceAt: null
    },
    followUp: {
      owner: '',
      dueDate: null,
      customerNotified: false,
      notifiedAt: null
    },
    outcome: null,
    outcomeAt: null,
    contactDurationSec: null,
    handoverCount: 0,
    history: [{ at: now, action: 'Case created' }]
  };
}

async function createCase(input) {
  return mutate((cases) => {
    const item = buildCase(input);
    item.caseId = nextCaseId(cases);
    cases.push(item);
    return item;
  });
}

module.exports = {
  readCases,
  writeCases,
  createCase,
  mutate
};
