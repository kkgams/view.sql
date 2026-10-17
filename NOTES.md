# Notes

## 1.0.0 preparation

The three existing SQL Views now share one view.sql archive, rather than three
individually named archives. The owner approved including the existing uncommitted
edits in all three Views and moving them unchanged to src/views/. Deployment
filenames and custom-element IDs remain unchanged. No additional source behavior
or HTML changes were made during release preparation.

Build, release workflow and wiki setup follow template.view. A maintainer commit
is approval; a matching version tag triggers publication after CI checks. There
are no approval-digest variables, policy-token requirement, release-branch gate
or unit.json. The archive contains all src/ files plus LICENSE, NOTICE, README.md
and NOTES.md. Old tags, example release pins and upstream snapshots are untouched.

Historical 0.2.0 metadata, mappings, NOTICE, evidence and publishing instructions
are preserved under provenance/legacy-0.2.0/. Root SOURCE.json,
SOURCE-CLOSURE.json, NOTICE-EVIDENCE.json and THIRD-PARTY-REVIEW.md also remain
historical snapshots, not current-tree certification or release gates. The source
move and accepted working-tree hashes are recorded in provenance/migration.json.
No audit was refreshed or new legal certification claimed. LICENSE is unchanged;
no third-party runtime implementation or separate license terms were identified
in the retained review. Host libraries are not bundled.

Local tests cover syntax/import closure, View registration, SQL console execution,
archive contents, checksums and reproducibility. Stubbed Host tests are not GUI
or native plugin.sql integration evidence. That validation remains unverified.
