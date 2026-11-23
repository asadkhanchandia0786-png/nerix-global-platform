# Nerix Global business software — 0.3.1

## Product decision

Keep this in the existing Nerix application and brand. Use one identity, organization, company and location model, with a separate service area and independent software subscription. Duplicating the application or login would duplicate customers, staff, billing and access management without making the software easier to customize.

A company has its own configurable modules. Records belong to a module, company and location. Organizations can contain several differently configured companies. Existing campaign configuration and voice handling are preserved. A company can use software without enabling voice or chat. Each company now has its own negotiated software price, invoices and access period; other companies in the organization can have different plans.

## What administrators can create

The module builder stores versioned definitions for fields, status lists and task rules. Types include text, long text, email, phone, number, currency, date, checkbox, choice and a record link. Record links stay inside the same company and location. Module definitions can be configured before the client's plan activates by the Nerix platform owner. Customer software administrators need active software access and company-wide scope to change a definition.

Every module uses the same record editor, search, list, status board, due-date calendar, report, CSV import/export, notes, record history and follow-up engine. Templates are ordinary editable definitions. Adding another supported section or field does not require a new database migration or a separate deployment.

The builder is intentionally bounded. It does not execute administrator-supplied JavaScript or SQL. Task rules run on creation or status entry, within the record transaction, using unique rule/version keys. They create in-app tasks; they do not imply external email/SMS delivery or calendar bookings. New external actions and specialized engines require reviewed code.

## Access model

- Existing authentication and organization membership remain the source of identity and scope.
- Existing users retain voice/chat behavior by default; ordinary staff receive no new software access automatically.
- Software grants: none, read/export, edit records/tasks, configure modules. Viewer membership always reduces software to read-only. The workspace owner manages all services that the organization has enabled. The platform owner can administer customers.
- Service switches apply on the server. Hiding the menu is only a convenience. Direct HTTP calls still require the service grant, membership and relevant company/location scope.
- Chat eligibility, presence and public widget access use the chat service switch and member grant. The Nerix public website's own chat remains separate.
- No field-level, per-module or multiple-disjoint-company grants are implemented. Existing membership has one company/location restriction or whole-organization access. Only grant company-wide software access when all modules in that company should be visible to the employee.
- Scoped metadata now filters the locations table by its `id`; the old code tried to use a nonexistent `location_id` column for a location-restricted user. This is the only unrelated bug fix, required for restricted dashboards.

## Monthly software billing

The platform owner manually configures the agreed plan name, monthly amount and currency for each company. No universal or industry-based selling price is imposed. The customer organization keeps one login and can contain security, insurance, courier or other company accounts with different negotiated software prices.

Company subscriptions and company invoices are separate tables. They never spend, reserve or credit the voice wallet. An invoice snapshots its company, plan name, amount, currency and one-month period. One open unpaid invoice is allowed per company, so several companies can have open invoices at once. Creation retries return the existing invoice. Price changes affect future invoices. Recording a verified payment reference is idempotent, and duplicate references within an organization are rejected, including references in older software billing history.

Each company has its own trial, payment period and expiry. The object being written determines which company's plan is checked: records, notes, tasks, imports, templates and schema configuration cannot borrow another company's paid access. Platform administrators can configure a company before activation; normal editing needs an active plan. Cancellation affects only the selected company's access and unpaid invoices. Expired/cancelled records remain readable and exportable. Internal companies retain the existing exemption.

Voice/chat switches are saved separately at organization level. Team grants still apply alongside company/location restrictions. Renewal invoices and verified payments are manual; automatic card or bank collection is not connected.

Migration 005 retains the original organization subscriptions/invoices for history and creates independent company billing tables. Existing companies inherit the original paid/trial access dates and status, with their renewal price left unset. This avoids multiplying a combined price into new charges. Saving a company's negotiated price preserves its existing access period. New companies are not automatically activated. Earlier unpaid organization invoices remain in history for separate review and are not converted into company invoices.

## Data integrity and portability

Migration 004 is additive. It adds service flags to organizations/memberships/invitations and six new software tables. It does not change rates, wallets, lead rows, agents, campaign execution, call charging or integrations. All new tables are included in backups. Old 0.1.0–0.3.0 backups still restore into an empty upgraded database with compatible defaults. Restoring a 0.3.0 backup also preserves its original software access in the new company plans without duplicating its price.

Record writes and schema writes use revision numbers. A stale update returns a conflict instead of overwriting another person's work. Fields containing stored data cannot be silently removed or retyped; archive them or add a replacement field. Existing choice values and statuses used by records are retained. Archives remain in exports and backups.

Imports validate all rows in a transaction; a bad row commits nothing. Stable IDs make retries of the same prepared batch safe. Reuploading a file starts a new batch and creates new records; no automatic fuzzy deduplication is claimed. CSV cells that could be interpreted as spreadsheet formulas are escaped. Scoped lists, exports, reports, record links and tasks apply the same company/location restrictions.

## Research informing the design

Reviewed on 13 October 2026. These are design references, not bundled frameworks or claims that Nerix includes their full feature sets.

- [Odoo Studio: models, modules and apps](https://www.odoo.com/documentation/17.0/applications/studio/models_modules_apps.html) — configurable models and views informed the shared module/record architecture.
- [Frappe: users and permissions](https://docs.frappe.io/framework/user/en/basics/users-and-permissions) — distinguishes user roles, document permissions and visibility. Nerix implements service grants plus the existing company/location restriction; it does not claim all Frappe controls.
- [OWASP: authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — server-side validation on every request, least privilege, object-scope checks and authorization tests informed the access controls.

## Verification

Release verification includes company pricing, currency, independent invoice creation, payment isolation, per-company expiry/cancellation, old billing migration and backup compatibility, plus the existing API/UI and voice/chat tests. The complete `npm run verify` gate passed: TypeScript, 81 tests, and the production build. Installation and rollback were also exercised against isolated copies of 0.2.5 and 0.3.0. Existing data fields and original paid software access/history were preserved, repeat installation required no changes, and conflicting local edits were rejected before overwriting files.

The delivered source includes API tests for independent billing, verified activation, renewal references, expiry, service revocation, cross-company/location isolation, templates, module versioning, typed fields, record conflicts, transactional imports, workflow deduplication, export escaping, calendar filtering, chat grants and backups. UI integration tests exercise actual React screens against the Express API. Existing voice, wallet, chat, internal-company and general UI tests are retained.

The release was type-checked, built and tested locally using Node 24 and PGlite. This does not establish live carrier, live card-processing, external-CRM or production-hosting readiness. The existing PostgreSQL adapter uses the same parameterized queries; a deployed PostgreSQL instance was not available for this test run. Browser layout screenshots were not captured; UI behavior was tested with JSDOM. Review the update in your Replit preview before publishing.
