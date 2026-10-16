const express = require('express');
const router = express.Router();
const store = require('../store');

const VALID_PATHWAYS = new Set(['STANDARD_RETAIL', 'TRADE', 'SPECIAL_ORDER']);
const VALID_STATUSES = new Set(['OPEN', 'AWAITING_SPECIALIST', 'FOLLOW_UP', 'RESOLVED', 'CLOSED']);
const PATCHABLE_FIELDS = new Set(['specialist', 'followUp']);

function nowIso() {
  return new Date().toISOString();
}

function elapsedWholeSeconds(start, end) {
  const diff = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 1000);
}

function sendError(res, status, code, message, sapCode = null) {
  return res.status(status).json({
    error: { code, message, sapCode }
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects(existing, patch) {
  return { ...(existing || {}), ...(patch || {}) };
}

function localDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function addDaysToIsoDate(value, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function tomorrowInAuckland() {
  return addDaysToIsoDate(localDate(new Date()), 1);
}

function badRequest(res, message) {
  return sendError(res, 400, 'BAD_REQUEST', message, null);
}

function notFound(res) {
  return sendError(res, 404, 'NOT_FOUND', 'Case not found. Please check the case number.', null);
}

function requireEditable(item) {
  if (item.status === 'CLOSED') {
    const error = new Error('CASE_CLOSED');
    error.code = 'CASE_CLOSED';
    throw error;
  }
}

function requireStatus(item, allowedStatuses, message) {
  requireEditable(item);
  if (!allowedStatuses.includes(item.status)) {
    const error = new Error(message || 'This action is not available for the current case status.');
    error.code = 'INVALID_STATE';
    throw error;
  }
}

function mutationError(res, error, fallbackMessage) {
  if (error && (error.code === 'NOT_FOUND' || error.message === 'NOT_FOUND')) {
    return notFound(res);
  }
  if (error && (error.code === 'CASE_CLOSED' || error.message === 'CASE_CLOSED')) {
    return sendError(res, 409, 'CASE_CLOSED', 'This case is closed and can no longer be changed.', null);
  }
  if (error && error.code === 'INVALID_STATE') {
    return sendError(res, 409, 'INVALID_STATE', error.message, null);
  }
  return sendError(res, 500, 'INTERNAL_ERROR', fallbackMessage, null);
}

router.post('/cases', async (req, res) => {
  const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};

  const pathway = String(body.pathway || '').trim().toUpperCase();
  const retrievalReason = body.retrievalReason == null ? '' : String(body.retrievalReason).trim();
  const sapSnapshot = body.sapSnapshot;

  if (!VALID_PATHWAYS.has(pathway)) {
    return badRequest(res, 'Please choose a valid enquiry pathway.');
  }
  if (!retrievalReason) {
    return badRequest(res, 'Please enter a retrieval reason before saving the case.');
  }
  if (!sapSnapshot || typeof sapSnapshot !== 'object' || Array.isArray(sapSnapshot) || sapSnapshot.source !== 'live') {
    return badRequest(res, 'A valid live SAP result is required before saving a case.');
  }

  const customerId = body.customerId == null ? null : String(body.customerId).trim() || null;
  const quotationId = body.quotationId == null ? null : String(body.quotationId).trim() || null;
  const productId = body.productId == null ? null : String(body.productId).trim() || null;

  let requestedQty = body.requestedQty;
  if (requestedQty !== null && requestedQty !== undefined) {
    if (typeof requestedQty === 'string') {
      if (requestedQty.trim() === '' || !Number.isFinite(Number(requestedQty))) {
        return badRequest(res, 'Please enter a valid requested quantity.');
      }
    } else if (typeof requestedQty !== 'number' || !Number.isFinite(requestedQty)) {
      return badRequest(res, 'Please enter a valid requested quantity.');
    }
  } else {
    requestedQty = null;
  }

  try {
    const created = await store.createCase({
      pathway,
      customerId,
      quotationId,
      productId,
      requestedQty,
      retrievalReason,
      sapSnapshot
    });
    return res.status(201).json(created);
  } catch (error) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'The case could not be saved. Please try again.', null);
  }
});

router.get('/cases', async (req, res) => {
  try {
    const status = req.query.status == null ? '' : String(req.query.status).trim();
    if (status && !VALID_STATUSES.has(status)) {
      return badRequest(res, 'Please choose a valid case status.');
    }

    const cases = await store.readCases();
    const filtered = status ? cases.filter((item) => item.status === status) : cases;
    const newestFirst = [...filtered].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    return res.json(newestFirst);
  } catch (error) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'The cases could not be loaded. Please try again.', null);
  }
});

router.get('/cases/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return badRequest(res, 'Please enter a case number.');

  try {
    const cases = await store.readCases();
    const item = cases.find((entry) => entry.caseId === id);
    if (!item) return notFound(res);
    return res.json(item);
  } catch (error) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'The case could not be loaded. Please try again.', null);
  }
});

router.patch('/cases/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return badRequest(res, 'Please enter a case number.');

  const body = req.body;
  if (!isPlainObject(body) || Object.keys(body).length === 0) {
    return badRequest(res, 'Please provide specialist or follow-up details to update.');
  }

  const unknownFields = Object.keys(body).filter((field) => !PATCHABLE_FIELDS.has(field));
  if (unknownFields.length > 0) {
    return badRequest(res, 'Only specialist and follow-up details can be updated. Use the case action buttons to change status.');
  }

  if (body.specialist !== undefined && !isPlainObject(body.specialist)) {
    return badRequest(res, 'Specialist details must be provided as an object.');
  }
  if (body.followUp !== undefined && !isPlainObject(body.followUp)) {
    return badRequest(res, 'Follow-up details must be provided as an object.');
  }
  if (body.specialist) {
    const unknownSpecialistFields = Object.keys(body.specialist).filter((field) => field !== 'advice');
    if (unknownSpecialistFields.length > 0 || !String(body.specialist.advice || '').trim()) {
      return badRequest(res, 'Please provide non-blank specialist advice only.');
    }
  }
  if (body.followUp) {
    const unknownFollowUpFields = Object.keys(body.followUp).filter((field) => field !== 'customerNotified');
    if (unknownFollowUpFields.length > 0 || body.followUp.customerNotified !== true) {
      return badRequest(res, 'This update can only mark the customer as notified.');
    }
  }

  try {
    const updated = await store.mutate((cases) => {
      const item = cases.find((entry) => entry.caseId === id);
      if (!item) throw new Error('NOT_FOUND');
      requireEditable(item);

      const now = nowIso();
      const historyEntries = [];

      if (body.specialist) {
        requireStatus(item, ['AWAITING_SPECIALIST'], 'Specialist advice can only be updated while specialist review is in progress.');
        const merged = mergeObjects(item.specialist, body.specialist);
        if (body.specialist.advice !== undefined && String(body.specialist.advice || '').trim() !== '' && body.specialist.adviceAt === undefined) {
          merged.adviceAt = now;
        }
        item.specialist = merged;
        historyEntries.push('Specialist details updated');
      }

      if (body.followUp) {
        requireStatus(item, ['FOLLOW_UP'], 'Follow-up details can only be updated after a follow-up has been created.');
        const merged = mergeObjects(item.followUp, body.followUp);
        if (body.followUp.customerNotified === true && body.followUp.notifiedAt === undefined) {
          merged.notifiedAt = now;
        }
        item.followUp = merged;
        historyEntries.push('Follow-up details updated');
      }

      item.history = Array.isArray(item.history) ? item.history : [];
      for (const action of historyEntries) {
        item.history.push({ at: now, action });
      }
      if (historyEntries.length === 0) {
        item.history.push({ at: now, action: 'Case updated' });
      }

      return item;
    });

    if (!updated) return notFound(res);
    return res.json(updated);
  } catch (error) {
    return mutationError(res, error, 'The case could not be updated. Please try again.');
  }
});

router.post('/cases/:id/resolve', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return badRequest(res, 'Please enter a case number.');

  try {
    const updated = await store.mutate((cases) => {
      const item = cases.find((entry) => entry.caseId === id);
      if (!item) throw new Error('NOT_FOUND');
      requireStatus(item, ['OPEN'], 'Only an open case can be resolved at first contact.');

      const now = nowIso();
      item.outcome = 'FCR';
      item.status = 'RESOLVED';
      item.outcomeAt = now;
      item.contactDurationSec = elapsedWholeSeconds(item.createdAt, now);
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({ at: now, action: 'Case resolved as FCR' });
      return item;
    });

    if (!updated) return notFound(res);
    return res.json(updated);
  } catch (error) {
    return mutationError(res, error, 'The case could not be resolved. Please try again.');
  }
});

router.post('/cases/:id/request-specialist', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return badRequest(res, 'Please enter a case number.');

  try {
    const updated = await store.mutate((cases) => {
      const item = cases.find((entry) => entry.caseId === id);
      if (!item) throw new Error('NOT_FOUND');
      requireStatus(item, ['OPEN'], 'A specialist can only be requested once for an open case.');

      const now = nowIso();
      const issues = Array.isArray(item.flags)
        ? item.flags.map((flag) => (flag && flag.message ? String(flag.message) : '')).filter(Boolean)
        : [];

      const parts = [`Case ${item.caseId} requires specialist review for pathway ${item.pathway}.`];
      if (item.customerName) parts.push(`Customer: ${item.customerName}.`);
      if (item.quotationId) parts.push(`Quotation: ${item.quotationId}.`);
      if (item.productId) parts.push(`Product: ${item.productId}.`);
      if (issues.length > 0) parts.push(`Issues: ${issues.join(' ')}`);

      item.status = 'AWAITING_SPECIALIST';
      item.outcome = 'NON_FCR';
      item.outcomeAt = now;
      item.contactDurationSec = elapsedWholeSeconds(item.createdAt, now);
      item.specialist = mergeObjects(item.specialist, {
        requested: true,
        requestedAt: now,
        summary: parts.join(' ').trim()
      });
      item.handoverCount = (Number.isInteger(item.handoverCount) ? item.handoverCount : 0) + 1;
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({ at: now, action: 'Specialist requested' });
      return item;
    });

    if (!updated) return notFound(res);
    return res.json(updated);
  } catch (error) {
    return mutationError(res, error, 'The specialist request could not be created. Please try again.');
  }
});

router.post('/cases/:id/follow-up', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return badRequest(res, 'Please enter a case number.');

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const owner = body.owner == null ? '' : String(body.owner).trim();
  const dueDateRaw = body.dueDate == null ? '' : String(body.dueDate).trim();
  const customerNotified = body.customerNotified === true;

  if (!owner) {
    return badRequest(res, 'Please enter a follow-up owner before saving.');
  }
  if (!dueDateRaw || Number.isNaN(Date.parse(dueDateRaw))) {
    return badRequest(res, 'Please enter a valid follow-up due date.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) || dueDateRaw < tomorrowInAuckland()) {
    return badRequest(res, 'Please choose a future follow-up due date.');
  }

  try {
    const updated = await store.mutate((cases) => {
      const item = cases.find((entry) => entry.caseId === id);
      if (!item) throw new Error('NOT_FOUND');
      requireStatus(item, ['OPEN', 'AWAITING_SPECIALIST'], 'A follow-up can only be created for an open case or a case under specialist review.');
      if (item.status === 'AWAITING_SPECIALIST' && !String(item.specialist && item.specialist.advice || '').trim()) {
        const error = new Error('Record specialist advice before creating the follow-up.');
        error.code = 'INVALID_STATE';
        throw error;
      }

      const now = nowIso();
      item.status = 'FOLLOW_UP';
      item.outcome = 'NON_FCR';
      if (!item.outcomeAt) item.outcomeAt = now;
      if (item.contactDurationSec === null || item.contactDurationSec === undefined) {
        item.contactDurationSec = elapsedWholeSeconds(item.createdAt, now);
      }
      item.followUp = mergeObjects(item.followUp, {
        owner,
        dueDate: dueDateRaw,
        customerNotified,
        notifiedAt: customerNotified ? now : (item.followUp && item.followUp.notifiedAt ? item.followUp.notifiedAt : null)
      });
      if (!customerNotified) item.followUp.notifiedAt = null;
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({
        at: now,
        action: `Follow-up created with owner ${owner} and due date ${dueDateRaw}${customerNotified ? ' (customer notified)' : ''}`
      });
      return item;
    });

    if (!updated) return notFound(res);
    return res.json(updated);
  } catch (error) {
    return mutationError(res, error, 'The follow-up could not be saved. Please try again.');
  }
});

router.post('/cases/:id/close', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return badRequest(res, 'Please enter a case number.');

  try {
    const updated = await store.mutate((cases) => {
      const item = cases.find((entry) => entry.caseId === id);
      if (!item) throw new Error('NOT_FOUND');
      requireStatus(item, ['RESOLVED', 'FOLLOW_UP', 'AWAITING_SPECIALIST'], 'Complete the current case action before closing the case.');
      if (item.status === 'AWAITING_SPECIALIST' && !String(item.specialist && item.specialist.advice || '').trim()) {
        const error = new Error('Record specialist advice before closing the case.');
        error.code = 'INVALID_STATE';
        throw error;
      }

      const now = nowIso();
      item.status = 'CLOSED';
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({ at: now, action: 'Case closed' });
      return item;
    });

    if (!updated) return notFound(res);
    return res.json(updated);
  } catch (error) {
    return mutationError(res, error, 'The case could not be closed. Please try again.');
  }
});

router.get('/kpi', async (req, res) => {
  try {
    const cases = await store.readCases();
    const today = localDate(new Date());

    const enquiriesToday = cases.filter((item) => item.createdAt && localDate(item.createdAt) === today).length;

    const casesWithOutcome = cases.filter((item) => item.outcome !== null && item.outcome !== undefined);
    const fcrCases = casesWithOutcome.filter((item) => item.outcome === 'FCR').length;
    const fcrRate = casesWithOutcome.length > 0
      ? (fcrCases / casesWithOutcome.length) * 100
      : 0;

    const openFollowUps = cases.filter((item) => item.status === 'FOLLOW_UP').length;

    const durations = cases
      .map((item) => item.contactDurationSec)
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const avgContactDurationSec = durations.length > 0
      ? durations.reduce((total, value) => total + value, 0) / durations.length
      : 0;

    const handoverRate = cases.length > 0
      ? (cases.filter((item) => Number(item.handoverCount) > 0).length / cases.length) * 100
      : 0;

    return res.json({
      enquiriesToday,
      fcrRate,
      openFollowUps,
      avgContactDurationSec,
      handoverRate
    });
  } catch (error) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'The KPI summary could not be loaded. Please try again.', null);
  }
});

module.exports = router;
