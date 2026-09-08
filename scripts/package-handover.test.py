"""Regression checks for source files being omitted from the handover."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("handover", Path(__file__).with_name("package-handover.py"))
handover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handover)


class PackagingTests(unittest.TestCase):
    def test_logos_are_source_not_logs(self):
        for name in ("logo-actions.ts", "logo-access.ts", "logo-access.test.ts", "catalog.ts", "logging.ts"):
            self.assertFalse(handover.excluded(Path("src/lib") / name))
        self.assertTrue(handover.excluded(Path("scripts/debug.log")))
        self.assertTrue(handover.excluded(Path("src/generated/prisma/client.ts")))

    def test_independent_coverage_rejects_missing_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            names = ("src/lib/logo-actions.ts", "src/lib/logo-access.ts", "src/lib/logo-access.test.ts", "src/lib/future-feature.ts", "prisma/migrations/new/migration.sql")
            files = {}
            for name in names:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"test source")
                files[name] = b"test source"
            handover.verify_source_coverage(root, files)
            for name in names:
                incomplete = dict(files)
                incomplete.pop(name)
                with self.assertRaisesRegex(ValueError, "Missing or changed source"):
                    handover.verify_source_coverage(root, incomplete)


if __name__ == "__main__":
    unittest.main()
