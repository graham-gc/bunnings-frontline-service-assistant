# SAP API Feasibility Gate

Complete this gate before freezing the MVP workflow or asking OpenCode to generate the final application.

## Current inputs

- API: Service Request (A2X)
- Artifact ID: `OP_API_SERVICE_REQUEST_SRV_0001`
- OData service: `API_SERVICE_REQUEST_SRV`
- Specification: `../api-spec/OP_API_SERVICE_REQUEST_SRV_0001.edmx`
- Expected sandbox base URL: `https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SERVICE_REQUEST_SRV`
- Authentication header: `APIKey`

The base URL was derived from the SAP sandbox convention. Tests on 2026-10-12 returned HTTP 403 for both metadata and entity requests, so it is not currently usable. The API key must remain in a local `.env` file and must not be recorded in test evidence.

## Minimum tests

1. Request `$metadata` and confirm the service is reachable.
2. Retrieve up to five service requests from `A_ServiceRequest`.
3. Retrieve one service request by its key.
4. Create a minimal service request.
5. Retrieve the created request to determine whether the sandbox persists writes.
6. Create or update a responsible-person record through `A_ServiceRequestPersonResp` or `to_PersonResponsible`.
7. Create or update action or resolution text through `A_ServiceRequestText` or `to_Text`.
8. Patch a supported service-request header field.
9. Test whether `ServiceRequestIsCompleted` can be updated or whether controlled closure must remain an application-level rule.
10. Record validation errors, unsupported operations and authentication errors.

For every test, retain the endpoint, HTTP method, non-sensitive request, response body, HTTP status code, date, result and evidence filename. Remove credentials and personal identifiers from shared evidence.

## Decision rule

- **Full fit:** read, create and update operations work. Implement the SAP-backed workflow as planned.
- **Partial fit:** read works but one or more write operations are unavailable. Retain SAP data access and implement the unsupported workflow state in the application layer, documenting the change under Option 2.
- **No fit:** the sandbox cannot return usable service-request data. Reassess another API from the supplied pool before building the final application.

## Results

| # | Test | Endpoint | Method | HTTP status | Result | Evidence file |
|---|---|---|---|---|---|---|
| 1 | Metadata reachable | `/$metadata` | GET | 403 | Failed — forbidden at derived sandbox URL | `evidence/2026-10-12-service-request-sandbox-test.md` |
| 2 | List requests | `/A_ServiceRequest?$top=1` | GET | 403 | Failed — same forbidden response | `evidence/2026-10-12-service-request-sandbox-test.md` |
| 3 | Read by key |  | GET |  | Not tested |  |
| 4 | Create request |  | POST |  | Not tested |  |
| 5 | Confirm persistence |  | GET |  | Not tested |  |
| 6 | Assign owner |  | POST/PATCH |  | Not tested |  |
| 7 | Record text |  | POST/PATCH |  | Not tested |  |
| 8 | Update header |  | PATCH |  | Not tested |  |
| 9 | Complete/close |  | PATCH |  | Not tested |  |

## Current gate status

**Blocked pending an official Service Request sandbox URL or course-environment endpoint.** Do not start the final API integration against the derived URL.
