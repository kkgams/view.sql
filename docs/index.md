---
title: SQL Views
status: reference
---

# SQL Views

Database browser, SQL console and create-table popup for [GAMS](https://github.com/kkgams/gams), maintained in one combined `view.sql.zip`. Register each View with its own `#views/...` archive entry; do not also install overlapping old individual SQL archives. Requires `plugin.sql`, `ui.popup`, `ui.toast` and Host-owned SQL helpers/widgets/styling. The local Project uses an in-memory database that does not persist after closing the Host.

[Launch fresh SQL demo](https://gams.z0.lv/app.html?showcase=https%3A%2F%2Fgithub.com%2Fkkgams%2Fshowcases%2Freleases%2Fdownload%2Fv0.2.0%2Fsql.zip). Run `SELECT name, price FROM items WHERE rarity = 'rare' ORDER BY price;` against the sample database.

| View | Source → deployed file | Screenshot | Original work |
| --- | --- | --- | --- |
| Database browser (`view-sql`) | `src/views/view-sql.js` → `views/view-sql.js` | Not available | GAMS authors |
| SQL console (`view-sql-console`) | `src/views/view-sql-console.js` → `views/view-sql-console.js` | Not available | GAMS authors |
| Create table (`sql-table-editor`) | `src/views/sql-table-editor.js` → `views/sql-table-editor.js` | Not available | GAMS authors |

In browser mode, click any data-column header to sort ascending; activate it
again to reverse direction, or another header to start ascending there. Enter
and Space also activate focused headers. SQLite sorts the entire table before
pagination; changing the sort returns to page one and clears row selection and
any active edit. Sorting persists across pages and reloads, and resets when
switching tables. The sidebar's Name and Rows headers sort the table list too.
The Host supplies direction icons through shared `base.css`.
Chooser/saver modes retain the ordering of their configured SQL queries.

## Development

Requires Make, Node.js 24+, Python 3, curl, zip, unzip and tar. `make open` requires macOS Apple Silicon. Sources load directly; Host helpers and pinned released dependencies in `gams.json` are not bundled.

| Command | Purpose |
| --- | --- |
| `make open` | Open local Project in released Host; first launch needs network. |
| `make check` | Check JavaScript syntax. |
| `make test` | Run native JS console, sorting, BLOB and registration tests. |
| `make package` | Build stable-name ZIP and SHA256SUMS under `build.nosync/`. |
| `make serve-docs` | Preview pinned wiki; `DOCS_PORT=8081` overrides port 8080. |
| `make docs` | Build portable wiki in `build.nosync/site/`. |
| `make validate-docs` | Validate wiki links/content. |
| `make clean` | Remove all of `build.nosync/`, `tools/` and `gams_modules/`, without ownership markers; refuse tracked files or symlinks in deletion paths before deleting anything. |

Existing Host tools are never implicitly updated. Keep macOS security checks intact. Native Host/plugin.sql integration and GUI/theme rendering remain unverified; domain tests substitute Host imports.
