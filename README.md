# Bunnings Frontline Service Assistant

University prototype for INFOSYS 704 A3. **Not an official Bunnings product.**

Option 1 implementation of the full A2 TO-BE frontline customer service model (Wanjing Xu). Operational support for Standard Retail, Trade and Special Order enquiries.

## Implemented Functionality

- **Operational KPI Dashboard** — enquiries today, FCR rate, open follow-ups, average contact duration, handover rate; case table with status chips, identifiers, and view links.
- **Standard Retail Workflow** — product search by name or exact material ID, quantity entry, live stock check at plant 1710 with cross-store fallback, R5a/R5b evaluation, Resolve now → FCR.
- **Trade Workflow** — customer search by name or exact ID, quotation selection with expired/Rejected status, item-level stock per non-rejected quotation item, order conversion and delivery status, R2–R4/R6 evaluation, follow-up or specialist recommendation.
- **Special Order Workflow** — product search with quantity, optional customer/quotation context, stock check with cross-store assessment, R5a/R5b evaluation.
- **R1–R6 Rule Evaluation** — customer blocked/deleted (R1), order conversion/delivery (R2), quotation expiry (R3), item rejection (R4), cross-store stock transfer (R5a), special order (R5b), payment terms mismatch (R6); actions TRANSFER, SPECIAL_ORDER, REQUOTE, CHECK_REJECTION.
- **Recommendation Engine** — SPECIALIST flag → Request specialist; FOLLOW_UP flag → Create follow-up; else → Resolve now.
- **Persistent Local Case Records** — JSON-backed storage (`data/cases.json`), auto-increment case IDs (TC-0001…), full audit history.
- **Specialist Advice** — PATCH specialist advice on open cases; history refreshed immediately.
- **Follow-up Management** — owner, due date, customer-notified flag with timestamp recording; notification action on open cases.
- **History Timeline** — chronological action log; auto-refreshes after advice, notification, close.
- **FCR / Follow-up / Handover KPIs** — FCR rate = FCR cases / cases with outcome; contact duration = outcomeAt − createdAt; handover rate = cases with handoverCount > 0 / all cases.
- **Responsive Interface** — desktop two-column New Enquiry; tablet/mobile single-column; tables scroll internally; visible keyboard focus; text-plus-colour status chips.

**Not supported**: sending real emails/SMS, production SAP access, multi-user authentication, automatic customer notifications.

## Live SAP APIs

Five API specifications (from `api-spec/`):

- `API_BUSINESS_PARTNER`
- `API_PRODUCT_SRV`
- `API_MATERIAL_STOCK_SRV`
- `API_SALES_QUOTATION_SRV`
- `API_SALES_ORDER_SRV`

**Live SAP Business Accelerator Hub sandbox only.** No mock data, no mock fallback. All SAP requests are server-side; the browser calls only local `/api` routes.

## Requirements

- Node.js 18 or later
- npm
- SAP Business Accelerator Hub API key (free tier)
- Internet connection for live sandbox calls

## Installation and Startup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Add your own API key locally
# Edit .env and set SAP_API_KEY

# 4. Start the application
npm start

# 5. Open http://localhost:3000
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SAP_API_ROOT` | SAP sandbox base URL | `https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap` |
| `SAP_API_KEY` | Your personal API key (never commit) | *required* |
| `PORT` | HTTP port | `3000` |
| `DEFAULT_PLANT` | Default plant/store code | `1710` |

## Main Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | KPI cards, case table, New Enquiry button |
| `/new.html` | New Enquiry | Pathway selection → inputs → Check in SAP → creates case |
| `/result.html?id=<caseId>` | SAP Check Result | Live SAP snapshot, flags, recommendation action buttons |
| `/case.html?id=<caseId>` | Case Detail | Summary, flags, SAP snapshot, specialist advice, follow-up, history, close |

## Manual Acceptance Test Guide

The following five scenarios were verified against the **live SAP sandbox on 16 October 2026**. This manual dataset is separate from the fixed records used by `scripts/test-rules.js`. SAP maintains the sandbox, so records and quantities may change later.

Start with an empty `data/cases.json` containing `[]`. For every follow-up scenario, enter any owner name and a future due date, then select **Create follow-up**.

### Test 1 — Standard Retail: resolve at first contact

1. Select **New Enquiry** → **Standard Retail**.
2. Enter exact material ID `MZ-FG-E11` and select **Use exact material ID**.
3. Enter requested quantity `10` and retrieval reason **Product availability**.
4. Select **Check in SAP**.

Expected result:

- Product description: `eBike E11`.
- Plant `1710` unrestricted stock: `82,010 PC`.
- No rule flag; recommendation: **Resolve now**.
- Selecting **Resolve now** records outcome **First contact resolved (FCR)**.

### Test 2 — Trade: expired quotation and rejected item

1. Select **New Enquiry** → **Trade**.
2. Search customer name `World`, then select `USCU-CUS01` — World of Sports Inc.
3. Select quotation `20000002` and retrieval reason **Quote status**.
4. Select **Check in SAP**.

Expected result:

- Quotation valid-to date: `2018-12-31`; quotation is expired.
- Item `10` (`MZ-TG-A10`, Headlight) is rejected with reason `70`.
- No converted sales order.
- Flags: **R3 / REQUOTE** and **R4 / CHECK_REJECTION**.
- Recommendation: **Create follow-up**; outcome after assignment: **Follow-up recorded**.

### Test 3 — Special Order: no sellable stock

1. Select **New Enquiry** → **Special Order**.
2. Enter exact material ID `MZ-TG-A19` and select **Use exact material ID**.
3. Enter requested quantity `2` and retrieval reason **Product availability**.
4. Leave the optional customer and quotation context blank, then select **Check in SAP**.

Expected result:

- Product description: `Headlight`.
- Plant `1710` unrestricted stock: `0 PC`; no other plant has sufficient sellable stock.
- Flag: **R5b / SPECIAL_ORDER**.
- Suggested action: **Arrange special order**.
- Recommendation: **Create follow-up**.

### Test 4 — Standard Retail: cross-store transfer

1. Select **New Enquiry** → **Standard Retail**.
2. Enter exact material ID `MZ-FG-E300` and select **Use exact material ID**.
3. Enter requested quantity `50` and retrieval reason **Product availability**.
4. Select **Check in SAP**.

Expected result:

- Product description: `Headlight`.
- Plant `1710` has `20 PC`, which is insufficient for the requested quantity.
- Plants `US20` and `US10` each have `100 PC`.
- Flag: **R5a / TRANSFER**.
- Suggested action: **Arrange stock transfer**.
- Recommendation: **Create follow-up**.

### Test 5 — Trade: completed order with rejected quotation items

1. Select **New Enquiry** → **Trade**.
2. Search customer name `World`, then select `USCU-CUS01` — World of Sports Inc.
3. Select quotation `20000005` and retrieval reason **Order status**.
4. Select **Check in SAP**.

Expected result:

- The quotation has been converted to sales order `15`.
- Order `15` is fully delivered, producing **R2 / INFO**.
- Quotation items `10`, `20`, and `30` are rejected with reason `70`, producing **R4 / CHECK_REJECTION** flags.
- **R3 is not raised** because the quotation has already been converted to an order.
- Recommendation: **Create follow-up**.

After all five cases are completed, the Dashboard should show:

- **Enquiries Today:** 5
- **FCR Rate:** 20% (1 of 5 outcomes)
- **Open Follow-ups:** 4
- **Specialist handover rate:** 0%
- **Average Contact Duration:** a numeric value that depends on testing speed

## Tests

```bash
# Business rules (R1–R6, scenarios A–D, invalid inputs)
npm run test:rules

# Case lifecycle & KPIs (create, list, get, PATCH, resolve, specialist, follow-up, close, KPI)
npm run test:cases
```

Local acceptance testing was completed successfully on 16 October 2026 using the SAP sandbox data available at that time. Because the sandbox is externally maintained, returned records and values may change.

**Clean KPI Checkpoint (before specialist request)**:
- 5 enquiries today
- 20% FCR rate (1 FCR / 5 outcomes)
- 4 open follow-ups
- 0% handover rate
- Average contact duration numeric

## Data Storage

Cases are stored locally in `data/cases.json` (JSON array). This is suitable for a university prototype, not production. The repository ships with an empty case array (`[]`); locally created demonstration cases are not committed. The automated tests restore the file content that existed before each test run.

## Security

- `.env` is listed in `.gitignore` and must never be committed.
- API keys are never placed in frontend code, HTML, responses, browser logs, or tracked files.
- `.env.example` contains configuration defaults and an empty `SAP_API_KEY` placeholder. It contains no real credential.
- Only PPR0 selling-price data is returned where required; confidential PCIP/cost data is excluded.
- The browser calls only local `/api` routes; SAP API key never leaves the server.

## Known Prototype Limitations

- SAP sandbox contains sample data that is **not real Bunnings data**.
- Historical sandbox dates may appear (e.g., 2016–2018).
- Local JSON storage is single-instance prototype storage.
- No authentication/role management.
- "Customer notified" records an operational action but does **not** send a real message.
- Live operation depends on SAP sandbox/network availability; `SAP_UNAVAILABLE` error is surfaced to staff if the sandbox is unreachable.

## Project Structure

```
├── api-spec/              # Five SAP OData YAML specifications
├── data/
│   └── cases.json         # Local case records (empty on clone)
├── docs/
│   └── prompt-log.md      # Development log
├── public/
│   ├── index.html         # Dashboard
│   ├── new.html           # New Enquiry
│   ├── result.html        # SAP Check Result
│   ├── case.html          # Case Detail
│   ├── styles.css         # Shared responsive styles
│   └── app.js             # Front-end logic
├── scripts/
│   ├── test-rules.js      # R1–R6 acceptance tests
│   └── test-cases.js      # Case lifecycle & KPI tests
├── server/
│   ├── index.js           # Express app, static files, route mounting
│   ├── sap.js             # SAP sandbox client, date conversion, error mapping
│   ├── rules.js           # R1–R6 evaluation
│   ├── store.js           # JSON case store (atomic write)
│   └── routes/            # /api endpoints (customers, products, stock, quotations, orders, check, cases)
├── .env.example           # Environment template (no secrets)
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Submission Packaging

**Exclude from ZIP**:
- `.env`
- `node_modules/`
- `.git/`
- `.DS_Store`
- `*.log`

**Include in ZIP**:
- Source files (`public/`, `server/`, `scripts/`, `api-spec/`, `docs/`)
- `package.json` and `package-lock.json`
- `.env.example`
- Five API specifications in `api-spec/`
- `README.md`, `AGENTS.md`, and `API_Contract_and_OpenCode_Prompts.md`
- Empty `data/cases.json`
