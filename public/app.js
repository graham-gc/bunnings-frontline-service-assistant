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

async function requestJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
}

function formatPercentage(value) {
  return `${numberOrZero(value)}%`;
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
    NON_FCR: 'Follow-up recorded'
  };
  return labels[value] || String(value || 'Unknown').replace(/_/g, ' ');
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
      <td><span class="${statusClass(item.outcome)}">${escapeHtml(statusLabel(item.outcome || 'NONE'))}</span></td>
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

  let retryHandler = null;
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

  retryHandler = load;
  retryButton.addEventListener('click', () => load());
  load();
}

App.registerPage('dashboard', initDashboard);

document.addEventListener('DOMContentLoaded', () => App.initPages());
