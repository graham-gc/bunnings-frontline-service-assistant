# Bunnings Frontline Service Assistant

University prototype for INFOSYS 704 A3. Not an official Bunnings product.

Option 1 prototype implementing the full A2 TO-BE frontline customer service model (Wanjing Xu).

## Pathways

- Standard Retail
- Trade
- Special Order

## SAP APIs (from `api-spec/`)

- `API_BUSINESS_PARTNER`
- `API_PRODUCT_SRV`
- `API_MATERIAL_STOCK_SRV`
- `API_SALES_QUOTATION_SRV`
- `API_SALES_ORDER_SRV`

Live SAP Business Accelerator Hub sandbox only. No mock data or mock fallback.

## Configuration

Copy `.env.example` to `.env` and set `SAP_API_KEY` locally. The API key is stored only in local `.env` and never committed or exposed to the browser.

## Current status

Specifications and implementation contract prepared; application code not generated yet.