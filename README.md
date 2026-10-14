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

## Verified Demo Scenarios

All scenarios run against the **live SAP sandbox**; sandbox values are external test data and may change over time.

| Scenario | Pathway | Input | Expected Result |
|----------|---------|-------|-----------------|
| **A** | Standard Retail | Product: Headlight → MZ-TG-A10, Qty 10 | Stock 63,275 PC → RESOLVE_NOW → Resolve → FCR |
| **B** | Trade | Customer: World → USCU-CUS01, Quote: 20000003 | Expired 2018-12-31, Item 20 rejected (reason 77) → R3/R4 → CREATE_FOLLOW_UP → NON_FCR |
| **C1** | Special Order | Product: Valve Assembly → D2O_XY00174197, Qty 2 | Stock 0 at 1710, no other plants → R5b SPECIAL_ORDER → CREATE_FOLLOW_UP → NON_FCR |
| **C2** | Standard Retail | Material: FG226, Qty 200 | 100 PC at 1710, 1,000 PC at 1010 → R5a TRANSFER → CREATE_FOLLOW_UP → NON_FCR |
| **D** | Trade | Customer: USCU-CUS01, Quote: 20000004 | Order 14 fully delivered (R2 INFO), Item 30 rejected (reason 70, R4) → CREATE_FOLLOW_UP → NON_FCR |

**SAP sandbox values are external test data and may eventually change.**

## Tests

```bash
# Business rules (R1–R6, scenarios A–D, invalid inputs)
npm run test:rules

# Case lifecycle & KPIs (create, list, get, PATCH, resolve, specialist, follow-up, close, KPI)
npm run test:cases
```

Local acceptance testing was completed successfully on 14 October 2026 using the SAP sandbox data available at that time. Because the sandbox is externally maintained, returned records and values may change.

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
