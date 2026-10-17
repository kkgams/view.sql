# view.sql

This repository owns three GAMS Views, released in one archive: `view-sql`
(`views/view-sql.js`), `view-sql-console` (`views/view-sql-console.js`) and
`sql-table-editor` (`views/sql-table-editor.js`). Each is registered separately
in Project Config. Canonical deployment files live under `src/`; packaging strips
that prefix. The Host supplies runtime, SQL helpers, widgets and styling.
`plugin.sql` and UI Service providers remain Project-configured dependencies.

Release tooling follows template.view: a maintainer commit constitutes approval,
and a matching version tag triggers GitHub Release publication. No approval-digest
variables, policy token, special release branch or unit.json are required.
Documentation uses justgook/wiki v1.4.0. Historical extraction/evidence records
are not current-tree certification or active release gates; see NOTES.md.
