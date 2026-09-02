# Authkey for Zoho CRM - MVP

This project is the backend and embedded widgets for an Authkey Zoho CRM extension.

## What is implemented

- Encrypted, organization-scoped Authkey credential storage
- Template fetching for supported Authkey channels
- Manual messaging from Zoho CRM records
- Delivery history persistence
- Authkey workflow configuration
- Automatic Zoho webhook and workflow-rule creation
- Workflow-specific webhook secrets
- Support for Leads, Contacts, Accounts, Deals, and Tasks
- Environment-aware Zoho OAuth handling for Production and Sandbox

## Run locally

1. Create a `.env` file and configure the required MongoDB, Authkey, Zoho OAuth, and webhook values.
2. Run `npm install`.
3. Run `npm start`.

## Required workflow environment variables

```text
ZOHO_CLIENT_ID=your_zoho_client_id
ZOHO_CLIENT_SECRET=your_zoho_client_secret
ZOHO_REDIRECT_URI=https://your-domain.com/api/workflow/zoho/oauth/callback
ZOHO_OAUTH_STATE_SECRET=a_long_random_secret
WEBHOOK_BASE_URL=https://your-domain.com
ZOHO_SCOPES=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL
```

Use the actual Zoho OAuth scopes required by your extension and deployment. `ZohoCRM.modules.ALL` allows CRM record access and `ZohoCRM.settings.ALL` is required for the automation/settings APIs used to create workflow automation. Review the scopes against the Zoho account permissions before production release.

## Zoho Sandbox and Production

The extension is tested in Zoho Sandbox. Sandbox and Production can have different organization IDs, and Zoho OAuth tokens are environment-specific. A Sandbox refresh token cannot be used against Production APIs, and a Production token cannot be used against Sandbox APIs.

The workflow system therefore stores the Zoho connection by the current organization ID and saves the API domain returned by Zoho OAuth. For example:

```text
Sandbox organization
  → sandbox organization ID
  → sandbox OAuth token
  → sandbox.zohoapis.* API domain

Production organization
  → production organization ID
  → production OAuth token
  → www.zohoapis.* API domain
```

When moving from Sandbox to Production, open the extension in the Production organization and connect Zoho again for that Production organization.

## Automatic Zoho CRM workflows

The intended client flow is:

```text
Open Authkey Workflow page
        ↓
Configure workflow
        ↓
Connect Zoho CRM once for the current organization/environment
        ↓
Save Workflow
        ↓
Backend generates a unique workflow secret
        ↓
Backend creates the Zoho webhook automatically
        ↓
Backend adds X-Workflow-Secret automatically
        ↓
Backend creates the Zoho workflow rule automatically
```

The client does not need to manually copy a webhook secret or create the webhook after the automatic setup is working with the required Zoho OAuth permissions.

Each workflow has its own randomly generated secret. The backend stores only a SHA-256 hash of that secret and verifies the `X-Workflow-Secret` header when Zoho triggers the workflow.

## Supported workflow modules

- Leads
- Contacts
- Accounts
- Deals
- Tasks

Supported triggers currently are:

- Create
- Update (`edit` in the Zoho automation API)

## Delivery and inbound callbacks

Configure Authkey delivery updates and inbound replies according to the deployed callback routes. Callback authentication should use a separate Authkey callback secret and must not reuse workflow webhook secrets.

## Before Marketplace release

- Test the full workflow flow separately in Sandbox and Production.
- Verify all requested Zoho OAuth scopes and permissions with the actual extension configuration.
- Confirm automatic webhook and workflow-rule creation for each supported module.
- Test recipient resolution for Deals and Tasks because these modules may use related CRM records rather than a direct phone field.
- Confirm Authkey's production API contract for every enabled channel.
- Use a public HTTPS deployment for all production webhooks and OAuth redirects.
