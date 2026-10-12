# UI-to-SAP Field Mapping

This mapping is based on `OP_API_SERVICE_REQUEST_SRV_0001.edmx`. It separates fields confirmed in the SAP specification from workflow fields that may need to remain in the application layer.

## Confirmed SAP fields

| App purpose | SAP entity/property | Mapping notes |
|---|---|---|
| Case ID | `A_ServiceRequest.ServiceRequest` | SAP-generated transaction ID and entity key |
| Request type | `A_ServiceRequest.ServiceRequestType` | Requires valid SAP transaction-type codes |
| Short title | `A_ServiceRequest.ServiceRequestDescription` | Maximum length: 40 characters |
| Priority | `A_ServiceRequest.ServiceDocumentPriority` | Requires valid SAP priority codes |
| General category | `A_ServiceRequest.ServiceDocumentCategory` | Requires valid SAP category codes |
| Problem category | `A_ServiceRequest.ServiceRequestProblemCategory` | Requires valid SAP problem-category codes |
| Reporter | `A_ServiceRequest.ServiceRequestReporter` | SAP contact-person/business-partner identifier |
| Requested start | `A_ServiceRequest.RequestedServiceStartDateTime` | Optional workflow timing field |
| Requested end | `A_ServiceRequest.RequestedServiceEndDateTime` | Optional workflow timing field |
| Due date | `A_ServiceRequest.ServiceDueByDateTime` | Can support follow-up prioritisation |
| Completion indicator | `A_ServiceRequest.ServiceRequestIsCompleted` | Update behaviour must be tested |
| Cancellation indicator | `A_ServiceRequest.ServiceRequestIsCanceled` | Not used as the normal closure action |
| Responsible person | `A_ServiceRequestPersonResp.PersonResponsible` | Related through `to_PersonResponsible` |
| Long description | `A_ServiceRequestText.LongText` | Related through `to_Text`; requires a valid `LongTextID` and language |
| Defect classification | `A_ServiceRequestDefect` | Available through `to_Defect`; valid code values must be confirmed |
| Reason | `A_ServiceRequestReason` | Available through `to_Reason`; valid category values must be confirmed |
| Reference object | `A_ServiceRequestRefObject` | Equipment or functional-location reference, if applicable |

## Application-level fields

These fields are required by the proposed Bunnings workflow but do not have a direct, confirmed equivalent in the EDMX.

| App field | Proposed handling | Reason |
|---|---|---|
| Bunnings case type | Application category with optional mapping to SAP category codes | Bunnings labels are not SAP master-data codes |
| Store/location | Application field until a valid Bunnings-to-SAP organisational mapping exists | No direct store field is confirmed |
| Workflow status | Application values: `New`, `Assigned`, `In Progress`, `Resolved`, `Closed` | The API exposes completion/cancellation indicators, not this five-state workflow |
| Action taken | Store as service-request text if permitted; otherwise application data | A dedicated action property is not exposed |
| Resolution | Store as service-request text if permitted; otherwise application data | Requires a tested `LongTextID` convention |
| Closure date | Application-generated timestamp | No dedicated closure-date property is confirmed |
| Verification | Stretch feature stored in the application layer | No direct verification entity is exposed |

## Controlled closure rule

The status dropdown must not contain `Closed`. The user must select **Close Case**, and closure is allowed only when:

1. a responsible owner has been recorded; and
2. a resolution has been recorded.

Whether the final action also updates `ServiceRequestIsCompleted` depends on the sandbox feasibility result.

