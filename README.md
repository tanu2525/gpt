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

## Before Marketplace release

- Replace the locally generated TLS certificate with a public HTTPS deployment.
- Confirm Authkey's production API contract for WhatsApp, Email and RCS; enable each channel only after its tested adapter is configured. SMS is wired to `https://api.authkey.io/request` using `authkey`, `mobile`, `country_code`, `sid` and `varN` query parameters.
- Add Zoho OAuth scopes, workflow custom action registration, and a CRM custom module/related-list writer for delivery history.
- Configure Authkey delivery callbacks to `POST /api/callbacks/delivery` with `X-Authkey-Signature`.
- Rotate the hard-coded development certificates that were previously in this repository.
