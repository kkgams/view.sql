# Publishing

A maintainer commit constitutes approval. A matching vMAJOR.MINOR.PATCH tag
triggers the template-based workflow: tests, documentation validation, packaging,
then GitHub Release creation with view.sql-<version>.zip and SHA256SUMS. No special
release branch, digest variables, policy token, npm publication or custom release
secrets are required. Existing releases must not be overwritten or published
tags moved. Publication requires successful CI; local checks do not establish it.

The archive contains views/view-sql.js, views/view-sql-console.js and
views/sql-table-editor.js plus LICENSE, NOTICE, README.md and NOTES.md.
There is no unit.json. Configure the three View IDs separately using entry
fragments from the same archive. Do not also install old individual SQL View
archives because deployment paths overlap. Existing release pins are unchanged.

See README.md for version rules and release commands. Enable GitHub Pages with
GitHub Actions as its source to deploy the minimal docs on default-branch pushes.
Local preparation and tagging do not push or publish.
