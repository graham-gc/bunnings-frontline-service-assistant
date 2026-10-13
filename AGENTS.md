# Bunnings Frontline Trade Service Assistant

University prototype for INFOSYS 704 A3. Not an official Bunnings product.
The app implements Wanjing Xu's A2 TO-BE model (frontline customer service) and reads live data from the SAP Business Accelerator Hub sandbox.

## What the app does

A frontline team member receives a customer enquiry, classifies it (Standard retail, Trade, Special order), looks up SAP data, and either resolves it in the first contact (FCR) or creates a tracked follow-up with an owner and due time. The app records KPIs K1 (FCR), K2 (contact duration) and K3 (handover / re-entry).

## Stack (keep it simple)

- Node.js 18+ with Express. Use the built-in `fetch`; do not add axios.
- Front end: plain HTML, CSS and JavaScript in `/public`. No React, no build step.
- Case storage: a JSON file at `data/cases.json`, read and written through `server/store.js`.
- Configuration in `.env` (see `.env.example`). `.env` must be listed in `.gitignore`.

## Folder structure

```
server/
  index.js          Express app, static files, route mounting
  sap.js            SAP sandbox client, date conversion, error mapping, mock fallback
  rules.js          Business rules R1–R6 and recommendation
  store.js          Read/write data/cases.json
  routes/
    customers.js    /api/customers/...
    products.js     /api/products/...
    stock.js        /api/stock
    quotations.js   /api/quotations/...
    orders.js       /api/orders/...
    check.js        /api/check
    cases.js        /api/cases/... and /api/kpi
public/
  index.html  new.html  result.html  case.html  styles.css  app.js
mock/                SAP JSON responses saved from Try Out (fallback data)
data/cases.json      Case records
docs/prompt-log.md   Every OpenCode prompt and what it produced
```

## SAP sandbox rules

- Base host: `https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/`
- Services: `API_BUSINESS_PARTNER`, `API_PRODUCT_SRV`, `API_MATERIAL_STOCK_SRV`, `API_SALES_QUOTATION_SRV`, `API_SALES_ORDER_SRV`
- Headers on every call: `APIKey: <process.env.SAP_API_KEY>`, `Accept: application/json`
- SAP is called ONLY from the server. The browser never sees the API key.
- Only GET requests. Never POST, PATCH or DELETE to SAP.
- Build query strings with `URLSearchParams`. Inside OData string literals, escape a single quote by doubling it.
- Convert SAP dates `/Date(1546214400000)/` to ISO `2018-12-31` in `sap.js`.
- Parse quantities and amounts with `parseFloat` (SAP returns strings such as `"63275"` or `"0.000"`).
- A 404 or SAP error code `/IWBEP/CM_MGW_RT/020` means NOT_FOUND.
- If `USE_MOCK=true`, or the sandbox call fails with a network or 5xx error, return the matching file from `/mock` and set `"source": "mock"`. Live responses set `"source": "live"`.

## Coding rules

- Follow the API contract in `API_Contract_and_OpenCode_Prompts.md` exactly: same URLs, field names and error format.
- All API responses are JSON. Errors use `{ "error": { "code": "...", "message": "...", "sapCode": "..." } }`.
- Show plain-English messages to staff; never show raw SAP errors in the UI.
- Status and warnings must use text plus colour, never colour alone.
- Keep code short and commented so every team member can explain it.
- Do not add login, email/SMS sending, payment, or features not listed in the contract.
