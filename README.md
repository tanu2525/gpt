# Authkey for Zoho CRM

Authkey for Zoho CRM is a Zoho CRM extension that connects CRM records and workflows with Authkey messaging channels.

## Main capabilities

- Organization-scoped encrypted Authkey credential storage
- Dynamic Zoho OAuth support across Zoho data centers
- Separate Sandbox and Production OAuth connections
- Manual messaging from Zoho CRM records
- Bulk message processing with controlled concurrency
- Template fetching for supported Authkey channels
- Delivery history and provider status tracking
- Automatic Zoho webhook and workflow-rule creation
- Workflow editing that recreates Zoho automation from the latest configuration
- Workflow-specific webhook secrets
- Lookup-aware recipient resolution
- Lookup-aware template variable mapping
- Support for Leads, Contacts, Accounts, Deals, and Tasks

## Architecture

```text
Zoho CRM
   |
   | CRM record / workflow event
   v
Zoho Workflow Rule
   |
   v
Zoho Webhook
   |
   | X-Workflow-Secret
   v
Node.js Backend
   |
   +--> Refresh Zoho OAuth access token
   |
   +--> Fetch CRM record and related lookup records
   |
   +--> Resolve recipient and template variables
   |
   v
Authkey API
   |
   v
Message Provider Response
   |
   v
MongoDB DeliveryLog
```

## Project structure

```text
app/
  common/                 Shared extension JavaScript
  workflow/               Workflow configuration UI
  widget/                 Manual messaging UI

server/
  controllers/            HTTP request handlers
  models/                 MongoDB schemas
  routes/                 Express routes
  Services/               Authkey and Zoho integrations
  utils/                  Encryption and validation utilities
```

## Local development

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file.
4. Configure MongoDB, Authkey, Zoho OAuth, and public webhook settings.
5. Start the extension:

```bash
npm start
```

For Zoho extension development, use the appropriate Zoho extension CLI command, such as:

```bash
zet run
```

## Important environment variables

```text
MONGODB_URI=your_mongodb_connection
ENCRYPTION_KEY=32_byte_base64_or_hex_key

ZOHO_CLIENT_ID=your_zoho_client_id
ZOHO_CLIENT_SECRET=your_zoho_client_secret
ZOHO_REDIRECT_URI=https://your-public-domain/api/workflow/zoho/oauth/callback
ZOHO_OAUTH_STATE_SECRET=a-long-random-secret
ZOHO_SCOPES=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL

WEBHOOK_BASE_URL=https://your-public-domain
AUTHKEY_WEBHOOK_SECRET=separate-callback-secret
AUTHKEY_BULK_CONCURRENCY=5
```

Never commit `.env`, private keys, certificates, refresh tokens, or Authkey credentials.

## Zoho OAuth and data centers

Do not hardcode a Zoho API domain.

Zoho returns an `api_domain` during OAuth token exchange and refresh. The application stores that domain with the organization's OAuth connection and uses it for CRM API requests.

Examples include:

```text
https://www.zohoapis.com
https://www.zohoapis.in
https://www.zohoapis.eu
https://sandbox.zohoapis.in
```

Sandbox and Production organizations can have different organization IDs and OAuth tokens. Connect each environment separately.

## Workflow flow

```text
Open Workflow Configuration
        |
        v
Connect current Zoho organization
        |
        v
Select module, trigger, channel, template and recipient
        |
        v
Map template variables
        |
        v
Save Workflow
        |
        +--> New workflow: create Zoho webhook + workflow rule
        |
        +--> Existing workflow: replace old Zoho automation with updated configuration
```

When a workflow is updated, the backend generates a new webhook secret, safely removes the previous Zoho workflow rule and webhook, and creates new resources from the latest configuration.

## Recipient and variable mapping

Recipient fields can be direct CRM fields or lookup fields when supported by the selected module.

Template variables support:

```text
Direct field:
First_Name

Lookup field:
Contact_Name.Email
Contact_Name.Mobile
Account_Name.Account_Name
```

The backend fetches the related record when a lookup mapping is used.

## Delivery statuses

An Authkey API success response means the provider accepted the request; it does not necessarily mean the message was delivered.

The application uses statuses such as:

```text
queued
accepted
sent
delivered
failed
received
```

Delivery callbacks update the message log when Authkey provides a later delivery status.

## Bulk processing

Bulk messaging uses controlled concurrency rather than sending every record simultaneously or strictly one at a time.

Configure the default concurrency with:

```text
AUTHKEY_BULK_CONCURRENCY=5
```

The application clamps concurrency to a safe range of 1–20.

## Security notes

- Authkey credentials are encrypted before storage.
- Workflow webhook secrets are stored only as SHA-256 hashes.
- Webhook secret comparisons use timing-safe comparison.
- Authkey callback authentication uses a separate callback secret.
- Zoho OAuth connections are scoped by organization ID.
- Provider responses stored in delivery logs are reduced to useful metadata instead of storing unnecessary full payloads.

## Testing checklist

### OAuth

- [ ] Connect Sandbox organization
- [ ] Connect Production organization
- [ ] Verify the API domain returned by Zoho is used dynamically
- [ ] Verify a Sandbox token is never used for Production requests

### Workflow creation

- [ ] Create workflow
- [ ] Confirm Zoho webhook is created
- [ ] Confirm Zoho workflow rule is created
- [ ] Trigger a record event
- [ ] Confirm the Authkey message request is accepted

### Workflow update

- [ ] Change the template
- [ ] Change the recipient field
- [ ] Change variable mappings
- [ ] Change the trigger
- [ ] Save again
- [ ] Confirm the old Zoho automation is replaced by the new configuration

### Delivery

- [ ] Confirm initial log status is `accepted`
- [ ] Send a provider callback
- [ ] Confirm the status changes to `sent`, `delivered`, or `failed`

### Lookup mapping

- [ ] Select a Deal or Task lookup field
- [ ] Map a related record field
- [ ] Trigger the workflow
- [ ] Confirm the related record value reaches the Authkey template

## Before Marketplace release

- Verify the exact OAuth client credentials and redirect URI required for the published extension.
- Confirm all requested OAuth scopes with Zoho.
- Test every supported channel with the Authkey production API.
- Test workflows in both Sandbox and Production.
- Review CORS and backend request authentication before public production deployment.
- Use a stable public HTTPS URL for OAuth callbacks and webhooks.
- Add automated tests for OAuth, workflow updates, recipient resolution, lookup mappings, and callback verification.
