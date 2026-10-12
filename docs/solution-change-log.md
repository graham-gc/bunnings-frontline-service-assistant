# Solution Change Log

This log records adaptations from the original common solution to the API-based A3 prototype. It supports the team's Option 2 justification.

| Date | Change | Reason | Evidence |
|---|---|---|---|
| 2026-10-07 | A mock-first project scaffold was prepared for the Frontline Follow-up and Escalation Hub. | The course API execution approach had not yet been confirmed. | Previous project scaffold |
| 2026-10-12 | The implementation approach changed from SAP Build Apps to an OpenCode-generated application consuming a SAP sandbox API. | The course replaced the unavailable SAP Build Code academic platform and instructed teams to provide an API specification, sandbox URL and API key to OpenCode. | Course guidance |
| 2026-10-12 | Service Request (A2X) was selected as the primary API. | Its entities and operations align most closely with creating, assigning, updating and resolving frontline follow-up cases. | `api-spec/OP_API_SERVICE_REQUEST_SRV_0001.edmx` |
| 2026-10-12 | SAP fields and application-managed workflow fields were separated. | The EDMX exposes service requests, responsible persons and texts, but does not directly provide the proposed five-state Bunnings workflow or a dedicated closure date. | `docs/field-mapping.md` |
| 2026-10-12 | The API decision remains conditional on a feasibility gate. | The specification confirms API capabilities, but the SAP sandbox must still be tested for reachability and write persistence. | `docs/api-feasibility-gate.md` |

