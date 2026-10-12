# Bunnings Service Request Hub

A Bunnings-specific frontline case and exception resolution prototype built with OpenCode and the SAP Service Request API.

## Business problem

Across the four A2 domains, the team analyses suggest a common follow-up challenge: when frontline issues require action across people or processes, ownership, progress and closure information may become fragmented.

## Proposed solution

The prototype provides a consistent and traceable workflow for frontline follow-up cases:

```text
Create case
→ Categorise and prioritise
→ Assign owner
→ Update action and status
→ Record resolution
→ Close case
```

The application complements rather than replaces Bunnings' existing operational systems.

## Core MVP

- Create a service request.
- View the service request list and details.
- Assign a responsible person.
- Update request information and resolution notes.
- Close a request only after an owner and resolution have been recorded.

## SAP API

The prototype uses the SAP S/4HANA Cloud **Service Request (A2X)** API:

- API specification: `api-spec/OP_API_SERVICE_REQUEST_SRV_0001.edmx`
- OData service: `API_SERVICE_REQUEST_SRV`
- Main entity set: `A_ServiceRequest`
- Related entities include responsible person, reason, text, defect and reference object.

The expected SAP sandbox base URL is:

```text
https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SERVICE_REQUEST_SRV
```

The endpoint must be tested before implementation because sandbox availability has not yet been confirmed for this API.

## Local configuration

Copy `.env.example` to `.env` and add your own SAP Business Accelerator Hub API key:

```env
SAP_API_BASE_URL=https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SERVICE_REQUEST_SRV
SAP_API_KEY=your_key_here
```

Never commit `.env` or expose the API key in frontend code, screenshots, documentation or presentation slides.

## Project documentation

- `docs/api-feasibility-gate.md` — sandbox tests and API decision rule
- `docs/field-mapping.md` — confirmed SAP fields and application-level fields
- `docs/solution-change-log.md` — Option 2 changes and supporting reasons

## Current status

- [x] Business problem and solution direction defined
- [x] SAP API selected from the course API pool
- [x] EDMX specification downloaded
- [x] API feasibility, field-mapping and solution-change documents migrated
- [ ] Obtain an official Service Request sandbox URL; the derived endpoint returned HTTP 403
- [ ] OpenCode application generated
- [ ] End-to-end workflow tested
