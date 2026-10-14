const SAP_API_ROOT = (process.env.SAP_API_ROOT || '').replace(/\/+$/, '');
const SAP_API_KEY = process.env.SAP_API_KEY;

// Turn SAP date strings such as /Date(1546214400000)/ into ISO dates.
function toIsoDate(sapDate) {
  if (sapDate === null || sapDate === undefined) return null;
  const text = String(sapDate).trim();
  if (!text) return null;

  // SAP OData v2 dates look like /Date(1546214400000)/.
  const match = text.match(/\/Date\((-?\d+)\)\//);
  if (match) {
    const date = new Date(Number(match[1]));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  // Allow dates that are already ISO-like strings, such as 2018-12-31.
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  return null;
}

// OData string literals use doubled single quotes.
function escapeOData(value) {
  return String(value).replace(/'/g, "''");
}

function sapRoot() {
  return SAP_API_ROOT;
}

function buildUrl(service, path, params) {
  const cleanPath = String(path).replace(/^\/+/, '');
  let url = `${sapRoot()}/${service}/${cleanPath}`;
  const query = new URLSearchParams(params || {});
  const queryString = query.toString();
  if (queryString) url += `?${queryString}`;
  return url;
}

function sapErrorCodeFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  // Shape: { "error": { "code": "..." } }
  if (body.error && body.error.code) return String(body.error.code);
  // Shape: { "d": { ... } } has no SAP error code.
  return null;
}

function normalizedSapError(kind, sapCode) {
  const err = new Error(kind);
  err.code = kind;
  err.sapCode = sapCode || null;
  return err;
}

function hasCertificateVerificationError(error) {
  let current = error;
  while (current) {
    if (current.code === 'UNKNOWN_CERTIFICATE_VERIFICATION_ERROR') return true;
    current = current.cause;
  }
  const text = String(error && error.message ? error.message : error);
  return text.includes('UNKNOWN_CERTIFICATE_VERIFICATION_ERROR');
}

// Perform one GET request against the SAP sandbox.
async function sapGet(service, path, params) {
  const url = buildUrl(service, path, params);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        APIKey: SAP_API_KEY,
        Accept: 'application/json'
      }
    });
  } catch (error) {
    // Network failure or TLS verification failure. Do not weaken TLS.
    if (hasCertificateVerificationError(error)) {
      const certError = normalizedSapError('SAP_UNAVAILABLE', 'UNKNOWN_CERTIFICATE_VERIFICATION_ERROR');
      certError.certificateVerificationError = true;
      throw certError;
    }
    throw normalizedSapError('SAP_UNAVAILABLE', null);
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      body = null;
    }
  }

  const sapCode = sapErrorCodeFromBody(body);

  // SAP not-found cases: HTTP 404, SAP's standard not-found code, or a 404 status body.
  const sapNotFoundCode = '/IWBEP/CM_MGW_RT/020';
  const notFoundShape = sapCode === sapNotFoundCode
    || response.status === 404
    || (body && body.status === 404)
    || (body && body.type === 'element_resource_non_existing');

  if (notFoundShape) {
    throw normalizedSapError('NOT_FOUND', sapCode);
  }

  if (response.status >= 500) {
    throw normalizedSapError('SAP_UNAVAILABLE', sapCode);
  }

  if (!response.ok) {
    // Keep unknown client errors from leaking SAP details to the browser.
    throw normalizedSapError('SAP_UNAVAILABLE', sapCode);
  }

  // OData v2 wrapper: { "d": { "results": [...] } } or { "d": { ...entity... } }.
  if (body && Object.prototype.hasOwnProperty.call(body, 'd')) {
    if (body.d && Object.prototype.hasOwnProperty.call(body.d, 'results')) {
      return body.d.results;
    }
    return body.d;
  }

  // Some sandbox responses can use the OData v4 "value" shape.
  if (body && Array.isArray(body.value)) {
    return body.value;
  }

  return body;
}

module.exports = {
  SAP_API_ROOT: sapRoot(),
  toIsoDate,
  escapeOData,
  sapGet
};
