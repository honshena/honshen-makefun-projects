import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class EntryTests(unittest.TestCase):
    def test_writes_valid_single_line(self):
        source = Path(__file__).with_name("main.py")
        self.assertTrue(source.is_file(), "main.py must exist")
        spec = importlib.util.spec_from_file_location("entry_main", source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(module, "OUTPUT_DIR", Path(directory)):
                module.main()
            text = (Path(directory) / "entry.txt").read_text(encoding="utf-8")

        self.assertTrue(text.strip())
        self.assertLessEqual(len(text), 280)
        self.assertNotIn("\n", text)
        self.assertNotIn("\r", text)


if __name__ == "__main__":
    unittest.main()
