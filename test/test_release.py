import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release", ROOT / "scripts/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ("package.json", "LICENSE", "NOTICE", "README.md", "NOTES.md"):
            shutil.copyfile(ROOT / name, self.root / name)
        shutil.copytree(ROOT / "src", self.root / "src")
        # Fixed fixture metadata keeps packaging tests valid after version bumps.
        self.metadata(name="view.example", version="1.0.0")

    def metadata(self, **changes):
        path = self.root / "package.json"
        metadata = json.loads(path.read_text())
        metadata.update(changes)
        path.write_text(json.dumps(metadata))

    def test_archive_contents_checksum_and_reproducibility(self):
        archive = release.package(self.root, "v1.0.0")
        first = archive.read_bytes()
        with zipfile.ZipFile(archive) as bundle:
            self.assertEqual(set(bundle.namelist()), {
                "LICENSE", "NOTICE", "README.md", "NOTES.md",
                "views/view-sql.js", "views/view-sql-console.js", "views/sql-table-editor.js"
            })
            for name in ("LICENSE", "NOTICE", "README.md", "NOTES.md"):
                self.assertEqual(bundle.read(name), (self.root / name).read_bytes())
            for path in ("views/view-sql.js", "views/view-sql-console.js", "views/sql-table-editor.js"):
                self.assertEqual(bundle.read(path), (self.root / "src" / path).read_bytes())
            self.assertNotIn("unit.json", bundle.namelist())
        self.assertEqual((archive.parent / "SHA256SUMS").read_text(),
                         f"{hashlib.sha256(first).hexdigest()}  view.example-1.0.0.zip\n")
        self.assertEqual(release.package(self.root).read_bytes(), first)

    def test_companion_assets_are_packaged(self):
        (self.root / "src/views/helper.json").write_text('{"value": 1}')
        archive = release.package(self.root)
        with zipfile.ZipFile(archive) as bundle:
            self.assertEqual(bundle.read("views/helper.json"), b'{"value": 1}')

    def test_production_cli_packages_all_three_views(self):
        import subprocess
        import sys

        (self.root / "scripts").mkdir()
        shutil.copyfile(ROOT / "scripts/release.py", self.root / "scripts/release.py")
        result = subprocess.run(
            [sys.executable, str(self.root / "scripts/release.py"), "--tag", "v1.0.0"],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        archive = self.root / "dist/view.example-1.0.0.zip"
        with zipfile.ZipFile(archive) as bundle:
            self.assertEqual(set(bundle.namelist()), {
                "LICENSE", "NOTICE", "README.md", "NOTES.md",
                "views/view-sql.js", "views/view-sql-console.js", "views/sql-table-editor.js",
            })
            for path in (self.root / "src").rglob("*.js"):
                self.assertEqual(bundle.read(path.relative_to(self.root / "src").as_posix()),
                                 path.read_bytes())

    def test_tag_must_match_version_exactly(self):
        for tag in ("v1.0.1", "1.0.0", "v01.0.0", "v1.0.0-beta", "v1.0.0+build"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                release.package(self.root, tag)
        self.assertFalse((self.root / "dist").exists())

    def test_strict_package_versions(self):
        for version in ("v1.0.0", "01.0.0", "1.0", "1.0.0-beta", "1.0.0+build"):
            with self.subTest(version=version), self.assertRaises(ValueError):
                self.metadata(version=version)
                release.package(self.root)

    def test_missing_license_is_an_error(self):
        (self.root / "LICENSE").unlink()
        with self.assertRaises(ValueError):
            release.package(self.root)

    def test_missing_view_is_an_error(self):
        shutil.rmtree(self.root / "src/views")
        with self.assertRaises(ValueError):
            release.package(self.root)

    def test_source_cannot_overwrite_metadata(self):
        (self.root / "src/LICENSE").write_text("unexpected license")
        with self.assertRaises(ValueError):
            release.package(self.root)

    def test_symlink_cannot_escape_source(self):
        (self.root / "src/outside").symlink_to(self.root / "package.json")
        with self.assertRaises(ValueError):
            release.package(self.root)

    def test_package_name_cannot_escape_output(self):
        self.metadata(name="../escape")
        with self.assertRaises(ValueError):
            release.package(self.root)


if __name__ == "__main__":
    unittest.main()
