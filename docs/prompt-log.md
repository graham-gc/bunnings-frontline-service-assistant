# Prompt log

- 2026-10-14: Preparation documentation updated to use five live SAP sandbox APIs; removed mock data and mock fallback; protected the API key in `.env`; prepared the Option 1 implementation contract.
- 2026-10-14: Built the runnable Node/Express foundation with health endpoint and home-page shell; no SAP calls or mock data; `.env` ignored; packages Express and dotenv only.
- 2026-10-14: Implemented live SAP customer search and account lookup; tests for search, USCU-CUS01, XXXXXXXX, and blank search passed against the real sandbox.
- 2026-10-14: Added live SAP product search and stock endpoints; live tests for Headlight, blank inputs, MZ-TG-A10 (63275 PC), FG226 (1010: 1000, 1710: 100, special-stock excluded), CM-FL-V00 (0 sellable), and blank material all passed.
- 2026-10-14: Added live SAP quotation list, detail, and PPR0 pricing endpoints; live tests passed for USCU-CUS01, blank input, 20000003 (expired 2018-12-31, 3 items, item 20 rejected), 99999999, and item 10 pricing (unit price USD 17.55 PC, no PCIP/cost data).
- 2026-10-14: Added live SAP sales-order-by-quotation endpoint; live tests passed for 20000004 (order 14, fully delivered, item 10 MZ-TG-A10 qty 4000 amount 70200), 99999999 (converted false, no orders), and blank quotation ID (400).
- 2026-10-14: Implemented live SAP check workflow and rules R1–R6 with npm run test:rules; A, B, C1, C2 and both invalid-input tests passed, while D failed because live quotation 20000004 actually has item 30 rejected with reason 70, producing R2 INFO plus R4 and recommendation CREATE_FOLLOW_UP.
- 2026-10-14: Corrected acceptance scenarios D and H to the verified live SAP Sandbox data (quotation 20000004 has rejected item 30 reason 70; D is CREATE_FOLLOW_UP, H becomes 20% FCR with 4 open follow-ups). Updated scripts/test-rules.js expectations accordingly; R1–R6 unchanged.
