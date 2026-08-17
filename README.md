# Authkey for Zoho CRM - MVP

This project is the backend and embedded widgets for an Authkey Zoho CRM extension.

## What is implemented

- Encrypted, organization-scoped Authkey credential storage (AES-256-GCM)
- Template fetching for WhatsApp, SMS, Email and RCS
- Manual WhatsApp and SMS template sends from a CRM record widget
- Delivery log persistence and an HMAC-protected delivery callback endpoint
- Record/module metadata retained for future Zoho timeline or custom-module sync

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a unique `AUTHKEY_ENCRYPTION_SECRET`.
2. Run `npm install` and `npm start` from this folder.
3. Trust the local development certificate and load the app from `https://127.0.0.1:5000/app`.

## Deployment URL

Set `APP_BASE_PATH=/v6/api` in the deployed environment. The server serves every page below `/v6/api/app`, including:

- `https://stagnapi.authkey.io/v6/api/app/widget/widget.html`
- `https://stagnapi.authkey.io/v6/api/app/history/history.html`
- `https://stagnapi.authkey.io/v6/api/app/settings/settings.html`
- `https://stagnapi.authkey.io/v6/api/app/bulk/bulk.html`
- `https://stagnapi.authkey.io/v6/api/app/workflow/workflow.html`

Each page derives its API prefix from its current URL and gets the organization ID from Zoho CRM rather than a hard-coded value. Deployed API endpoints use the clean `/v6/api/...` form, while local `/app/...` pages continue to use `/api/...`.

## Automatic Zoho CRM workflows

Saving a workflow creates a protected endpoint for that specific configuration. In Zoho CRM, create a workflow rule for the same module/event and add a **Webhook** instant action. Use the URL displayed after saving the configuration and add the header `X-Workflow-Secret` with the value of `WORKFLOW_WEBHOOK_SECRET` from the deployed environment. Use a **Raw JSON** body; add `recordId` and every CRM field selected as the recipient or a variable mapping (for example, `Mobile` and `First_Name`). Insert the matching Zoho CRM merge field for each JSON value using the webhook editor's merge-field picker.

The endpoint uses the saved workflow's organization, channel, template, recipient field, and variable mappings, then sends the message and records it in delivery history. Set a long random `WORKFLOW_WEBHOOK_SECRET` in the deployed environment before enabling the Zoho rule.

## Delivery and inbound callbacks

Configure Authkey to send delivery updates to `POST /v6/api/callbacks/delivery` and inbound replies to `POST /v6/api/callbacks/inbound`. Both routes require an `X-Authkey-Signature` header containing the SHA-256 HMAC of the raw request body, calculated with `AUTHKEY_WEBHOOK_SECRET`. Delivery callbacks must include the provider message ID returned when the message was submitted. Inbound callbacks must additionally include `organizationId` and the sender (`mobile`, `email`, or `recipient`).

## Before Marketplace release

- Replace the locally generated TLS certificate with a public HTTPS deployment.
- Confirm Authkey's production API contract for WhatsApp, Email and RCS; enable each channel only after its tested adapter is configured. SMS is wired to `https://api.authkey.io/request` using `authkey`, `mobile`, `country_code`, `sid` and `varN` query parameters.
- Add Zoho OAuth scopes, workflow custom action registration, and a CRM custom module/related-list writer for delivery history.
- Configure Authkey delivery callbacks to `POST /api/callbacks/delivery` with `X-Authkey-Signature`.
- Rotate the hard-coded development certificates that were previously in this repository.
