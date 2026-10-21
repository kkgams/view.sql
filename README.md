# view.sql

Database browser, SQL console and create-table popup, maintained and released together:

| View ID | Deployment path | Purpose |
| --- | --- | --- |
| `view-sql` | `views/view-sql.js` | Browse/edit rows and query-based selection |
| `view-sql-console` | `views/view-sql-console.js` | Execute SQL and inspect query results |
| `sql-table-editor` | `views/sql-table-editor.js` | Create tables with typed columns and constraints |

Requires a compatible GAMS Host, `plugin.sql`, `ui.popup` and `ui.toast`.
The Host supplies browser APIs, `/core`, `/util`, `/widgets` and theme styling.
This repository is not a standalone Host or external Project.

## Develop

Requires Node.js 24+, Python 3 (stdlib), Make, curl and tar; no npm install needed.

```sh
npm test
make validate-docs
make serve-docs                 # http://localhost:8080
make build-docs                 # portable wiki under build/site/
npm run package                # one ZIP and SHA256SUMS under dist/
```

The wiki uses justgook/wiki v1.4.0, cached under ignored `build/`.
Enable GitHub Pages with **Settings → Pages → Source → GitHub Actions** to deploy
docs on default-branch pushes. The [overview](docs/index.md) explains the Views.
Local tests cover syntax/import closure, View registration and SQL console execution, archive contents,
checksums and reproducibility, not native Host integration or theme rendering.

## Install

The 1.1.0 release archive contains all three deployment paths above and LICENSE,
NOTICE, README.md and NOTES.md. It strips `src/` and does not include `unit.json`.
After publication, register each View separately using the same archive URL and
its own entry fragment, for example:

```text
https://github.com/kkgams/view.sql/releases/download/v1.1.0/view.sql-1.1.0.zip#views/view-sql.js
https://github.com/kkgams/view.sql/releases/download/v1.1.0/view.sql-1.1.0.zip#views/view-sql-console.js
https://github.com/kkgams/view.sql/releases/download/v1.1.0/view.sql-1.1.0.zip#views/sql-table-editor.js
```

For manual installation, download the ZIP and SHA256SUMS, run
`shasum -a 256 -c SHA256SUMS`, then extract into staging. Copy deployment files to
matching Project-relative paths; retain metadata under
`notices/project-units/view.sql/`, not over the Project's own files.
Do not also install the old individual SQL View archives: deployment paths overlap.
Existing tags and pinned example releases remain unchanged.

## Version and release

A maintainer commit constitutes approval. Its matching version tag triggers
publication; no separate approval, digest variables or special release branch
is required. The workflow tests and packages the exact tagged checkout, then
creates a GitHub Release containing `view.sql-<version>.zip` and SHA256SUMS.
Existing releases must not be overwritten or published tags moved.

Versions and tags are exactly `MAJOR.MINOR.PATCH` and `vMAJOR.MINOR.PATCH`, without
suffixes or leading zeros. Use **major** for incompatible public API changes,
**minor** for compatible additions, and **patch** for fixes, docs or internal
changes without API changes. Public API includes View IDs, inputs, outputs,
deployment paths and required Host facilities. Use the largest applicable bump.

The prepared 1.1.0 release adds clickable, keyboard-accessible column sorting in
browser mode, with full-table SQL ordering before pagination and sidebar sorting.
Direction indicators require GAMS 2.1.0 or newer shared styling. After local validation and tagging, push when publication is authorized:

```sh
git push origin HEAD refs/tags/v1.1.0
```

For later releases, start from a clean checkout with changes committed:

```sh
npm test
make validate-docs
npm version patch -m '🔖(view.sql): release v%s'  # or minor / major
git push origin HEAD --follow-tags
```

Branch pushes run checks and deploy default-branch docs, not Unit releases.
See [PUBLISHING.md](PUBLISHING.md) for release boundaries.

## License

Apache-2.0. Preserve LICENSE and NOTICE. Historical extraction/consolidation
records remain in the repository as described in [NOTES.md](NOTES.md); they are
not approval gates or new legal certification.
