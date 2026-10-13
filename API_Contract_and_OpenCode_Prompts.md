# Frontline Trade Service Assistant — API Contract & OpenCode Prompts

INFOSYS 704 A3 · Option 1 (Wanjing Xu's A2 TO-BE delivered as planned) · Due Tuesday 20 October 2026

This file is the agreement between the back end (Member B) and the front end (Member C). Both sides build against it at the same time. Do not rename URLs or fields without telling the other person.

---

## 1. Setup (both B and C, Day 1)

1. Install Node.js 18+ and OpenCode Desktop (https://opencode.ai/download).
2. One person creates a GitHub repository `frontline-trade-assistant` and invites the team.
3. Put `AGENTS.md` (provided) and this file in the repository root.
4. Create `.env` locally (never commit it):

```
SAP_API_ROOT=https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap
SAP_API_KEY=your-own-key
PORT=3000
DEFAULT_PLANT=1710
```

5. Commit `.env.example` with the same keys and empty values.
6. Open the folder in OpenCode. In OpenCode Desktop the user can submit implementation prompts directly because Build is the default agent; no visible Build label is required.
7. After each prompt: test in the browser, then `git commit`. Paste the prompt and a one-line result into `docs/prompt-log.md`.

---

## 2. Common conventions

| Item | Rule |
|---|---|
| Base URL | `http://localhost:3000` |
| Dates | ISO strings `YYYY-MM-DD` |
| Numbers | JSON numbers (convert SAP strings with `parseFloat`) |
| Data source | Every successful SAP-backed response has `"source": "live"` and `"checkedAt": "<ISO datetime>"` |
| Default plant | `1710` (sandbox store) |

### Error format (all endpoints)

```json
{ "error": { "code": "NOT_FOUND", "message": "Customer ID not found. Please check the number or search by name.", "sapCode": "/IWBEP/CM_MGW_RT/020" } }
```

| code | HTTP | When | Message shown to staff |
|---|---|---|---|
| `NOT_FOUND` | 404 | SAP 404 or `/IWBEP/CM_MGW_RT/020` | Customer: "Customer ID not found. Please check the number or search by name." · Quotation: "Quotation not found. Please check the quote number." · Product: "Product not found. Try a different name." |
| `BAD_REQUEST` | 400 | Missing or invalid input | "Please enter ___ before checking SAP." |
| `SAP_UNAVAILABLE` | 503 | Network error or SAP 5xx response | "SAP is not responding. Please try again or use the manual process." |

### How to detect NOT_FOUND (tested in the sandbox)

The sandbox returns "not found" in more than one shape. Treat ANY of these as `NOT_FOUND`:

1. HTTP status 404 (always check the status first, whatever the body looks like);
2. Body `{"error": {"code": "/IWBEP/CM_MGW_RT/020", ...}}`, e.g. `Resource not found for segment 'A_CustomerType'` or `'A_SalesQuotationType'` — this is SAP's standard not-found message, not a configuration error;
3. Body `{"status": 404, "type": "element_resource_non_existing", ...}`;
4. A collection query used for a lookup (e.g. `$filter=SalesQuotation eq '99999999'`) returning `"results": []`.

---

## 3. SAP data endpoints (Member B)

### 3.1 Search customers

`GET /api/customers/search?name=Sports`

SAP call:
`API_BUSINESS_PARTNER/A_Customer?$filter=substringof('Sports',CustomerName)&$top=20&$select=Customer,CustomerName,CustomerFullName,OrderIsBlockedForCustomer,DeliveryIsBlocked,BillingIsBlockedForCustomer,PostingIsBlocked,DeletionIndicator`

Response:
```json
{
  "results": [
    { "customerId": "USCU-CUS01", "name": "World of Sports Inc.", "fullName": "Company World of Sports Inc./10035 New York", "isBlocked": false }
  ],
  "source": "live", "checkedAt": "2026-10-15T09:00:00Z"
}
```

### 3.2 Get one customer (account check)

`GET /api/customers/USCU-CUS01`

SAP call:
`API_BUSINESS_PARTNER/A_Customer('USCU-CUS01')?$expand=to_CustomerSalesArea`
(If `$expand` fails, call `A_Customer('USCU-CUS01')/to_CustomerSalesArea` separately.)

Response:
```json
{
  "customerId": "USCU-CUS01",
  "name": "World of Sports Inc.",
  "fullName": "Company World of Sports Inc./10035 New York",
  "blocks": { "order": false, "delivery": false, "billing": false, "posting": false },
  "isBlocked": false,
  "isDeleted": false,
  "salesAreas": [
    { "salesOrg": "1710", "distributionChannel": "10", "division": "00", "paymentTerms": "0004", "currency": "USD", "supplyingPlant": "1710" }
  ],
  "source": "live", "checkedAt": "..."
}
```

Mapping: a block flag is `true` when the SAP field is non-empty (or `true` for `PostingIsBlocked`). `isBlocked` = any block is true.

### 3.3 Search products

`GET /api/products/search?name=Valve%20Assembly`

SAP call:
`API_PRODUCT_SRV/A_ProductDescription?$filter=Language eq 'EN' and substringof('Valve Assembly',ProductDescription)&$top=20`

Response:
```json
{
  "results": [ { "productId": "D2O_XY00174197", "description": "Valve Assembly" } ],
  "tooMany": false,
  "source": "live", "checkedAt": "..."
}
```

`tooMany` = true when 20 results come back (front end shows "Many matches — please type a more specific name").

### 3.4 Stock for a product

`GET /api/stock?material=MZ-TG-A10&plant=1710` (`plant` optional; without it, all plants)

SAP call:
`API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod?$filter=Material eq 'MZ-TG-A10' and Plant eq '1710'&$select=Material,Plant,StorageLocation,Batch,InventoryStockType,InventorySpecialStockType,MatlWrhsStkQtyInMatlBaseUnit,MaterialBaseUnit`

Response:
```json
{
  "material": "MZ-TG-A10",
  "plant": "1710",
  "unrestrictedQty": 63275,
  "unit": "PC",
  "lines": [ { "plant": "1710", "storageLocation": "171A", "batch": "", "stockType": "01", "specialStockType": "", "qty": 63275 } ],
  "source": "live", "checkedAt": "..."
}
```

`unrestrictedQty` = sum of `qty` where `stockType = "01"` and `specialStockType = ""`. No rows means `unrestrictedQty: 0`.

Always add up ALL rows first (a material can have several storage locations, batches and stock types). Never decide "out of stock" from a single row. Example from testing: FG226 at plant 1710 has 6 rows across storage locations 171A and 171B. Five are special stock `E` (reserved for sales orders, 20 PC in total) and are excluded; one row in 171B is type `01` with no special stock (100 PC). Sellable stock at 1710 = 100.

Use the unit SAP returns (`MaterialBaseUnit`): Headlight is `PC`, Valve Assembly is `EA`.

#### All plants (cross-store check)

`GET /api/stock?material=FG226` (no `plant`)

SAP call: same as above with `$filter=Material eq 'FG226'` and `InventorySpecialStockType`, `Batch` included in `$select`.

Response:
```json
{
  "material": "FG226",
  "plants": [
    { "plant": "1010", "unrestrictedQty": 1000, "unit": "PC" },
    { "plant": "1710", "unrestrictedQty": 100, "unit": "PC" }
  ],
  "lines": [ "...all rows as above..." ],
  "source": "live", "checkedAt": "..."
}
```

`plants` is grouped by plant, sorted by `unrestrictedQty` descending.

Only stock type `01` with an empty special stock type counts. Tested example: CM-FL-V00 (Forklift) has rows showing quantity 1 at plant 1010, but one is stock type `07` and one is special stock `E` (reserved for a sales order), so its sellable stock is 0 at every plant.

### 3.5 Quotations for a customer

`GET /api/quotations?customerId=USCU-CUS01`

SAP call:
`API_SALES_QUOTATION_SRV/A_SalesQuotation?$filter=SoldToParty eq 'USCU-CUS01'&$top=20&$select=SalesQuotation,SalesQuotationDate,BindingPeriodValidityEndDate,TotalNetAmount,TransactionCurrency,OverallSDProcessStatus`

Response:
```json
{
  "results": [
    { "quotationId": "20000003", "date": "2016-09-07", "validTo": "2018-12-31", "isExpired": true, "totalNet": 123100, "currency": "USD", "processStatus": "B" }
  ],
  "source": "live", "checkedAt": "..."
}
```

### 3.6 One quotation with items

`GET /api/quotations/20000003`

SAP call:
`API_SALES_QUOTATION_SRV/A_SalesQuotation('20000003')?$expand=to_Item`

Response:
```json
{
  "quotationId": "20000003",
  "customerId": "USCU-CUS01",
  "salesOrg": "1710",
  "date": "2016-09-07",
  "validFrom": "2016-09-07",
  "validTo": "2018-12-31",
  "isExpired": true,
  "totalNet": 123100,
  "currency": "USD",
  "paymentTerms": "0004",
  "processStatus": "B",
  "processStatusText": "Partially processed",
  "items": [
    { "itemNo": "10", "material": "MZ-TG-A10", "description": "Headlight", "qty": 5000, "unit": "PC", "netAmount": 87750, "plant": "1710", "processStatus": "A", "isRejected": false, "rejectionReason": "" },
    { "itemNo": "20", "material": "MZ-FG-E11", "description": "eBike E11", "qty": 1000, "unit": "PC", "netAmount": 24250, "plant": "1710", "processStatus": "C", "isRejected": true, "rejectionReason": "77" },
    { "itemNo": "30", "material": "MZ-FG-E12", "description": "eBike E12", "qty": 1000, "unit": "PC", "netAmount": 35350, "plant": "1710", "processStatus": "A", "isRejected": false, "rejectionReason": "" }
  ],
  "source": "live", "checkedAt": "..."
}
```

`isExpired` = `validTo` < today. `isRejected` = `SalesDocumentRjcnReason` is non-empty. Status texts: A = Not yet processed, B = Partially processed, C = Completely processed.

Not found: `A_SalesQuotation('99999999')` returns `/IWBEP/CM_MGW_RT/020` "Resource not found for segment 'A_SalesQuotationType'" → `NOT_FOUND`. If the single GET ever fails in an unexpected way, fall back to `A_SalesQuotation?$filter=SalesQuotation eq '99999999'&$top=1&$select=SalesQuotation`; an empty `results` array also means `NOT_FOUND`.

### 3.7 Item price (optional, specialist view)

`GET /api/quotations/20000003/items/10/pricing`

SAP call:
`API_SALES_QUOTATION_SRV/A_SalesQuotationItem(SalesQuotation='20000003',SalesQuotationItem='10')/to_PricingElement`

Response:
```json
{ "unitPrice": 17.55, "currency": "USD", "priceUnit": "PC", "manuallyChanged": false, "source": "live", "checkedAt": "..." }
```

`unitPrice` = `ConditionRateValue` of condition type `PPR0`. Do NOT return the cost condition (`PCIP`); cost is confidential and not shown to frontline staff.

### 3.8 Orders created from a quotation

`GET /api/orders/by-quotation/20000004`

SAP calls:
1. `API_SALES_ORDER_SRV/A_SalesOrderItem?$filter=ReferenceSDDocument eq '20000004'&$select=SalesOrder,SalesOrderItem,Material,SalesOrderItemText,RequestedQuantity,NetAmount,SDProcessStatus,DeliveryStatus`
2. For each distinct `SalesOrder`: `A_SalesOrder('14')?$select=SalesOrder,SalesOrderDate,TotalNetAmount,TransactionCurrency,OverallSDProcessStatus,OverallDeliveryStatus`

Response:
```json
{
  "quotationId": "20000004",
  "converted": true,
  "orders": [
    {
      "salesOrderId": "14", "orderDate": "2016-09-07", "totalNet": 70200, "currency": "USD",
      "processStatus": "C", "deliveryStatus": "C", "fullyDelivered": true,
      "items": [ { "itemNo": "10", "material": "MZ-TG-A10", "description": "Headlight", "qty": 4000, "netAmount": 70200, "deliveryStatus": "C" } ]
    }
  ],
  "source": "live", "checkedAt": "..."
}
```

No items found → `"converted": false, "orders": []`.

---

## 4. Check endpoint and business rules (Member B, rules defined by Wanjing)

`POST /api/check`

Request (fields depend on pathway):
```json
{
  "pathway": "TRADE",
  "customerId": "USCU-CUS01",
  "quotationId": "20000003",
  "productId": null,
  "requestedQty": null,
  "plant": "1710"
}
```

`pathway` is one of `STANDARD_RETAIL`, `TRADE`, `SPECIAL_ORDER`.

| Pathway | Required | Data the server fetches |
|---|---|---|
| STANDARD_RETAIL | productId, requestedQty | stock |
| TRADE | customerId, quotationId | customer, quotation, stock per non-rejected item, orders by quotation |
| SPECIAL_ORDER | productId + requestedQty, or quotationId | stock (+ customer, quotation, orders if given) |

For every material where the store plant does not have enough, the server makes one more stock call WITHOUT `plant` (section 3.4, all plants) and adds `otherPlants` to that stock entry.

### Rules (run in this order)

| Rule | Condition | Severity | Message example |
|---|---|---|---|
| R1 | Customer `isBlocked` or `isDeleted` | SPECIALIST | "Customer account is blocked. Refer to a Trade specialist." |
| R2 | Quotation `converted`: all orders `fullyDelivered` → INFO; otherwise FOLLOW_UP | INFO / FOLLOW_UP | "Order 14 is fully delivered." |
| R3 | Quotation NOT converted and `isExpired` | FOLLOW_UP | "Quotation expired on 2018-12-31. A new quote is required." |
| R4 | Any item `isRejected` | FOLLOW_UP | "Item 20 (eBike E11) was rejected (reason 77)." |
| R5a | Store stock < required qty, AND another plant has `unrestrictedQty` ≥ required qty | FOLLOW_UP (action `TRANSFER`) | "FG226: 100 at this store (1710), 200 needed. Plant 1010 has 1,000. Arrange a stock transfer." |
| R5b | Store stock < required qty, AND no plant has enough | FOLLOW_UP (action `SPECIAL_ORDER`) | "Valve Assembly: 0 at this store and no stock at other stores. Special order required." |
| R6 | Quotation `paymentTerms` ≠ customer sales-area `paymentTerms` (same salesOrg) | SPECIALIST | "Payment terms differ (quote 0004, account 0003). Check with a specialist." |

R2 is checked before R3: an expired quote that already became an order does not need a re-quote.

Each flag carries an optional `action`: `TRANSFER`, `SPECIAL_ORDER`, `REQUOTE` (R3), `CHECK_REJECTION` (R4). The front end pre-fills the follow-up reason with it.

### Recommendation

- Any SPECIALIST flag → `"REQUEST_SPECIALIST"`
- Else any FOLLOW_UP flag → `"CREATE_FOLLOW_UP"`
- Else → `"RESOLVE_NOW"`

Response:
```json
{
  "pathway": "TRADE",
  "customer": { "...": "as 3.2" },
  "quotation": { "...": "as 3.6" },
  "stock": [
    { "material": "MZ-TG-A10", "description": "Headlight", "plant": "1710", "required": 5000, "unrestrictedQty": 63275, "unit": "PC", "sufficient": true, "otherPlants": [] },
    { "material": "FG226", "description": "…", "plant": "1710", "required": 200, "unrestrictedQty": 100, "unit": "PC", "sufficient": false,
      "otherPlants": [ { "plant": "1010", "unrestrictedQty": 1000 } ] }
  ],
  "orders": { "...": "as 3.8" },
  "flags": [
    { "rule": "R3", "severity": "FOLLOW_UP", "action": "REQUOTE", "message": "Quotation expired on 2018-12-31. A new quote is required." },
    { "rule": "R4", "severity": "FOLLOW_UP", "action": "CHECK_REJECTION", "message": "Item 20 (eBike E11) was rejected (reason 77)." }
  ],
  "recommendation": "CREATE_FOLLOW_UP",
  "source": "live", "checkedAt": "..."
}
```

---

## 5. Case endpoints (Member C)

Stored in `data/cases.json`.

### Case object

```json
{
  "caseId": "TC-0001",
  "pathway": "TRADE",
  "status": "OPEN",
  "createdAt": "2026-10-15T09:00:00Z",
  "customerId": "USCU-CUS01",
  "customerName": "World of Sports Inc.",
  "quotationId": "20000003",
  "productId": null,
  "requestedQty": null,
  "retrievalReason": "Quote status enquiry",
  "sapSnapshot": { "...": "full /api/check response" },
  "flags": [],
  "recommendation": "CREATE_FOLLOW_UP",
  "specialist": { "requested": false, "requestedAt": null, "summary": "", "advice": "", "adviceAt": null },
  "followUp": { "owner": "", "dueDate": null, "customerNotified": false, "notifiedAt": null },
  "outcome": null,
  "outcomeAt": null,
  "contactDurationSec": null,
  "handoverCount": 0,
  "history": [ { "at": "2026-10-15T09:00:00Z", "action": "Case created" } ]
}
```

`status`: `OPEN` → `AWAITING_SPECIALIST` / `FOLLOW_UP` → `RESOLVED` → `CLOSED`
`outcome`: `FCR` | `NON_FCR`

### Endpoints

| Method | URL | Does |
|---|---|---|
| GET | `/api/cases?status=FOLLOW_UP` | List cases (newest first, optional status filter) |
| POST | `/api/cases` | Create from a check result. Body: `{ pathway, customerId, quotationId, productId, requestedQty, retrievalReason, sapSnapshot }` |
| GET | `/api/cases/:id` | One case |
| PATCH | `/api/cases/:id` | Update any of: `specialist`, `followUp`, `status`; append to `history` |
| POST | `/api/cases/:id/resolve` | FCR path: `outcome = FCR`, `status = RESOLVED`, set `outcomeAt`, `contactDurationSec` |
| POST | `/api/cases/:id/request-specialist` | `status = AWAITING_SPECIALIST`, build `specialist.summary` from flags + SAP snapshot, `handoverCount + 1` |
| POST | `/api/cases/:id/follow-up` | Body `{ owner, dueDate, customerNotified }` → `status = FOLLOW_UP`, `outcome = NON_FCR`, set `outcomeAt`, `contactDurationSec` |
| POST | `/api/cases/:id/close` | `status = CLOSED` |
| GET | `/api/kpi` | `{ enquiriesToday, fcrRate, openFollowUps, avgContactDurationSec, handoverRate }` |

KPI definitions (from A2): K1 FCR rate = FCR cases / cases with an outcome. K2 = `outcomeAt − createdAt`. K3 = cases with `handoverCount > 0` / all cases.

---

## 6. Pages (Member C)

| Page | Content |
|---|---|
| `index.html` Dashboard | KPI cards (enquiries today, FCR rate, open follow-ups, average contact duration); case table with status chips (text + colour); "New Enquiry" button |
| `new.html` New enquiry | Step 1: choose pathway (3 large buttons). Step 2: inputs — Standard retail: product search → pick → qty. Trade: customer search (name or ID) → pick → that customer's quotations → pick. Special order: product search + qty, optional customer/quote. Retrieval reason dropdown. Button "Check in SAP" → `POST /api/check`, then `POST /api/cases`, then go to `result.html?id=` |
| `result.html` SAP check result | Customer card, quotation card (expired date in red with the word "Expired"), item table (required qty, stock at this store, **stock at other stores**, rejected rows marked), order card, flags list (with the suggested action: Transfer / Special order / Re-quote), data source + time. Buttons by recommendation: "Resolve now", "Request specialist", "Create follow-up" |
| `case.html` Case detail | Summary, flags, SAP snapshot, specialist summary and advice box, follow-up owner / due date / "customer notified" tick box, history timeline, "Close case" |

Usability rules: clear labels, required fields marked *, plain-English errors, loading indicator while SAP is called, back link on every page, no colour-only status.

---

## 7. Acceptance tests (Member D runs these; all must pass by Saturday night)

| # | Pathway | Input | Expected |
|---|---|---|---|
| A | Standard retail | Search "Headlight" → MZ-TG-A10, qty 10 | Stock 63,275 → recommendation RESOLVE_NOW → resolve → outcome FCR |
| B | Trade | Search "World" → USCU-CUS01 → quote 20000003 | Flags R3 (expired) + R4 (item 20 rejected); stock sufficient; R6 passes (0004 = 0004) → CREATE_FOLLOW_UP → owner + due date → NON_FCR |
| C1 | Special order | Search "Valve Assembly" → D2O_XY00174197, qty 2 | Stock 0 at 1710 and no other plant (confirmed: only one row, 1710, type 01, qty 0, unit EA) → R5b (SPECIAL_ORDER) → CREATE_FOLLOW_UP |
| C2 | Standard retail → transfer | FG226, qty 200 | 100 sellable at 1710, plant 1010 has 1,000 (both confirmed type 01, no special stock) → R5a (TRANSFER) → CREATE_FOLLOW_UP. Product name is technical ("FIN226,MTO,PD,Batch-Fifo"), so use C2 as a functional test; showing it in the live demo is optional |
| D | Trade / order status | USCU-CUS01 → quote 20000004 | R2: order 14 fully delivered; no R3 → RESOLVE_NOW → FCR |
| E | Error | Customer ID XXXXXXXX | "Customer ID not found…" message, no crash (works for both 404 body formats) |
| F | Error | Quote 99999999 | "Quotation not found…" message (single GET 404; also via empty-array fallback) |
| H | KPI | After A, B, C1, C2, D | Dashboard: 5 enquiries, FCR rate 40% (A, D), 3 open follow-ups (B, C1, C2) |
| I | Specialist | On case B, "Request specialist" → add advice | Status AWAITING_SPECIALIST, handoverCount 1, summary lists flags |
| J | Stock total | FG226 at plant 1710 | Sellable 100: row in 171B counted; five special-stock E rows (20 PC reserved) in 171A excluded |
| K | Sellable stock only | CM-FL-V00, all plants | Sellable stock 0 everywhere, although rows show 1 (type 07 and special stock E are excluded) |

---

## 9. OpenCode prompts

Paste one prompt at a time. Submit directly in OpenCode Desktop (Build is the default agent) → test → commit → log.

### Member B — back end

**B1 · Project skeleton**
```
Read AGENTS.md and API_Contract_and_OpenCode_Prompts.md. Create the Node.js + Express project exactly as the folder structure in AGENTS.md: package.json with "npm start", server/index.js serving /public as static files on PORT from .env (use dotenv), .gitignore including .env and node_modules, .env.example, empty route files mounted under /api, and a GET /api/health route returning { ok: true }. Explain how to run it.
```

**B2 · SAP client**
```
Create server/sap.js as described in AGENTS.md "SAP sandbox rules", using the live SAP sandbox only. Export: sapGet(service, path, params) that builds the URL from process.env.SAP_API_ROOT with URLSearchParams, sends APIKey (process.env.SAP_API_KEY) and Accept headers, and returns parsed JSON (unwrap d.results or d); toIsoDate("/Date(…)/"); escapeOData(str); and error mapping to { code, message, sapCode } with NOT_FOUND for 404 or /IWBEP/CM_MGW_RT/020, SAP_UNAVAILABLE for network/5xx. There is no mock fallback: network errors and SAP 5xx responses return SAP_UNAVAILABLE, and every successful response marks source "live". Add a small test script scripts/test-sap.js that calls A_Customer('USCU-CUS01') against the live SAP sandbox and prints the name.
```

**B3 · Customer and product endpoints**
```
Implement contract sections 3.1, 3.2 and 3.3 in server/routes/customers.js and server/routes/products.js using server/sap.js. Return exactly the response shapes in the contract, including source and checkedAt. Return NOT_FOUND with the contract messages. Test with: /api/customers/search?name=Sports, /api/customers/USCU-CUS01, /api/customers/XXXXXXXX, /api/products/search?name=Valve%20Assembly.
```

**B4 · Stock, quotation and order endpoints**
```
Implement contract sections 3.4 (including the all-plants response with "plants"), 3.5, 3.6, 3.7 and 3.8 in server/routes/stock.js, quotations.js and orders.js. Follow the mapping rules in the contract (add up all stock rows before deciding, unrestrictedQty, unit from SAP, isExpired, isRejected, status texts, unitPrice from PPR0 only, never return PCIP, the four NOT_FOUND shapes in section 2). Test with: /api/stock?material=MZ-TG-A10&plant=1710, /api/stock?material=D2O_XY00174197&plant=1710, /api/stock?material=FG226, /api/stock?material=CM-FL-V00 (expect 0 everywhere), /api/stock?material=FG226&plant=1710 (expect 100), /api/quotations?customerId=USCU-CUS01, /api/quotations/20000003, /api/quotations/99999999, /api/orders/by-quotation/20000004, /api/orders/by-quotation/20000003.
```

**B5 · Rules and check endpoint**
```
Implement server/rules.js and POST /api/check (contract section 4). When the store plant does not have enough stock, call the all-plants stock query and add otherPlants. rules.js exports evaluate(data) that applies R1, R2, R3, R4, R5a/R5b and R6 in the given order, adds the action field to each flag, and returns { flags, recommendation }. Write unit tests in scripts/test-rules.js for acceptance scenarios A, B, C1, C2 and D against the live SAP sandbox, and print PASS/FAIL for each.
```

**B6 · README**
```
Check that scenarios A to D return the expected recommendations against the live SAP sandbox (no mock files are used). Then write README.md: what the app does, how to install (npm install), create .env from .env.example, run (npm start), which SAP APIs are used, and the limitations (sandbox sample data, read-only, notifications recorded not sent).
```

### Member C — front end and cases

**C1 · Case store and case API**
```
Read AGENTS.md and API_Contract_and_OpenCode_Prompts.md. Implement server/store.js (read/write data/cases.json, create the file if missing, generate caseId TC-0001, TC-0002 …) and every endpoint in contract section 5 in server/routes/cases.js, including /api/kpi with the KPI definitions given. Every change appends an entry to history. Test all endpoints with sample requests and show me the results.
```

**C2 · Layout and dashboard**
```
Create public/styles.css and public/index.html (contract section 6, Dashboard). Clean professional layout, dark green header (#0D5257), white cards, large readable text, status chips that show text and colour, responsive for tablet width. Load /api/kpi and /api/cases. Add a "New Enquiry" button. Do not use any Bunnings logo.
```

**C3 · New enquiry page**
```
Create public/new.html and the related code in public/app.js (contract section 6, New enquiry). Step 1: three large buttons for Standard retail, Trade, Special order. Step 2 shows only the inputs for that pathway, using /api/products/search, /api/customers/search and /api/quotations?customerId=. Mark required fields with *, disable "Check in SAP" until they are filled, add a retrieval-reason dropdown (Product availability, Quote status, Order status, Pricing check, Other). On submit: show a loading indicator, call POST /api/check, then POST /api/cases with the result, then open result.html?id=<caseId>. Show contract error messages in a clear banner.
```

**C4 · SAP check result page**
```
Create public/result.html (contract section 6). Load the case and render its sapSnapshot: customer card (account status in words), quotation card (validity date, the word "Expired" in red if expired, process status text), item table (required qty, stock at this store, stock at other stores from otherPlants, "Rejected" label on rejected rows), order card (delivery status in words), flags list grouped by severity with the suggested action (Transfer / Special order / Re-quote / Check rejection), data source (Live SAP) and checked time. Show buttons based on recommendation: "Resolve now" (POST resolve), "Request specialist" (POST request-specialist), "Create follow-up" (form with owner, due date, "Customer notified" tick box → POST follow-up). After each action go to case.html?id=.
```

**C5 · Case detail page and polish**
```
Create public/case.html (contract section 6): summary, flags, specialist summary and advice (PATCH specialist.advice), follow-up details, history timeline, "Close case" button. Then review all four pages against Nielsen's heuristics: visible status after every action, plain-English labels, back links, consistent buttons, error prevention, no colour-only meaning. List what you changed.
```

---

## 10. Who does what by when

| Day | Wanjing (process) | B (back end) | C (front end) | D (QA & pitch) |
|---|---|---|---|---|
| Wed 14 | Confirm Option 1 + roles; send this file | B1 | C1 | Prepare tests from section 8 |
| Thu 15 | TO-BE mapping table, rules sign-off | B2, B3 | C2, C3 | Test B3 endpoints |
| Fri 16 | Demo script; FG226 confirmed (C2) | B4, B5 | C4 | Test B4/B5, scenarios A–D via API |
| Sat 17 | Review full flow | Fix bugs, B6 | C5 | **All tests A–K pass**; start usability tests |
| Sun 18 | Design Thinking section | Support fixes | Usability fixes | Nielsen review, slides draft |
| Mon 19 | Final review | Code freeze at noon, zip without node_modules/.env | Same | Backup video, 2 rehearsals |
| Tue 20 | **Submit and present** | | | |
