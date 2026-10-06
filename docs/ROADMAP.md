# Roadmap

## Initial scope

A shared local browser toolbox containing TrueScrub, JSON, Base64, link cleaning,
text utilities, password generation and SHA-256. Reusable logic lives in packages;
larger future applications may have independent folders in projects.

## Next priorities

1. Fix CI, browser regressions, data leaks and incorrect results first.
2. Expand synthetic TrueScrub regression cases, especially Unicode, credentials,
   and country-specific identifiers; never claim complete anonymization.
3. Automate browser accessibility, mobile and offline regression coverage.
4. Consider image metadata removal with explicit format/support limits, and
   local CSV inspection with spreadsheet-formula injection protections.
5. Add per-tool deep links containing only tool IDs, never user inputs; improve
   keyboard navigation and translations before expanding the catalog.
6. Separate large future projects cleanly. A Java/Spring integration utility or
   desktop app can be independent rather than increasing the web app's runtime.

No placeholder tools, paid APIs, background uploads, fake certifications or
unverified claims. Keep original projects personal-free/business-paid forever
as the product policy. Do not publish prices or enable payments without Denys.

## Provenance and licensing

TrueScrub logic originated in Denys's separately prepared 0.1.0 distribution.
Its MyTools edition is 0.2.0 and is distributed under the custom MyTools license.
This does not cancel valid grants for copies of the earlier distribution.
The repository's initial license-only commit used PolyForm Noncommercial; no
application code was included in that commit. The application introduced here
uses LICENSE and its stricter private-person/business distinction.
