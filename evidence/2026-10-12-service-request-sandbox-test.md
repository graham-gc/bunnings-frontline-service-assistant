# Service Request Sandbox Connectivity Test

## Test context

- Date: 2026-10-12
- API: Service Request (A2X)
- OData service: `API_SERVICE_REQUEST_SRV`
- Authentication: SAP Business Accelerator Hub API key supplied through a local `.env` file
- Key or token included in evidence: No

## Base URL tested

```text
https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_SERVICE_REQUEST_SRV
```

This URL was derived from the service path in the EDMX and the standard SAP sandbox host. It has not been confirmed as an officially enabled sandbox URL for this API.

## Results

| Test | Request | Result |
|---|---|---|
| Metadata | `GET /$metadata` | HTTP 403, `text/html`; response title `Application Server Error`, message `Forbidden` |
| List one request | `GET /A_ServiceRequest?$top=1` | HTTP 403, `text/html`; same response size and error page |

## Interpretation

The requests reached the SAP host, but the tested endpoint did not authorise access. Because both metadata and entity requests returned the same response, the current derived sandbox URL cannot be used by the prototype.

This result does not prove that the Service Request API is unusable in every SAP environment. The next step is to obtain an officially provided sandbox URL or confirmation from the course lab. If none is available, the team should apply the feasibility decision rule and evaluate another API from the supplied pool.

