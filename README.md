# view.sql

Database browser, SQL console and create-table popup for [GAMS](https://github.com/kkgams/gams), maintained in one combined `view.sql.zip`. Register each View with its own `#views/...` archive entry; do not also install overlapping old individual SQL archives. Requires `plugin.sql`, `ui.popup`, `ui.toast` and Host-owned SQL helpers/widgets/styling. The local Project uses an in-memory database that does not persist after closing the Host.

| View | Source → deployed file | Screenshot | Original work |
| --- | --- | --- | --- |
| Database browser (`view-sql`) | `src/views/view-sql.js` → `views/view-sql.js` | Not available | GAMS authors |
| SQL console (`view-sql-console`) | `src/views/view-sql-console.js` → `views/view-sql-console.js` | Not available | GAMS authors |
| Create table (`sql-table-editor`) | `src/views/sql-table-editor.js` → `views/sql-table-editor.js` | Not available | GAMS authors |

The ZIP includes [Apache-2.0](LICENSE), [NOTICE](NOTICE) and [licensing scope](LICENSING.md).

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
