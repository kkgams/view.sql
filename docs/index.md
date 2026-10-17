---
title: SQL Views
status: reference
---

# SQL Views

`view.sql` provides three GAMS Views in one release archive. `view-sql`
(`views/view-sql.js`) browses database tables, displays paginated rows, supports
row editing and query-based selection. `view-sql-console`
(`views/view-sql-console.js`) executes SQL statements and displays query results.
`sql-table-editor` (`views/sql-table-editor.js`) is the create-table popup for
specifying columns, types, primary keys and constraints.

Register each View separately in the external Project using the same
`view.sql-1.0.0.zip` URL with its corresponding `#views/...` entry fragment.
The Views require a compatible GAMS Host, `plugin.sql`, and the `ui.popup` and
`ui.toast` services; SQL helpers, editor/pagination widgets and styling come
from the Host. The archive retains LICENSE, NOTICE, README.md and NOTES.md,
without `unit.json`. See the [repository README](https://github.com/kkgams/view.sql#readme)
for checks and release commands.
