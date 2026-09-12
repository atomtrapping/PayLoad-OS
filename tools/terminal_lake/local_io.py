"""Confine Iceberg I/O to this dedicated index; never open artifact object keys."""
from pathlib import Path
import stat
from urllib.parse import urlparse
from urllib.request import url2pathname

from pyiceberg.io.pyarrow import PyArrowFileIO

MAX_FILE_BYTES = 64 * 1024 * 1024


def safe_path(path: Path) -> None:
    for item in reversed((path, *path.parents)):
        if item.is_symlink() or (hasattr(item, "is_junction") and item.is_junction()):
            raise ValueError("LOCAL_INDEX_LINK_REFUSED")
        if item != path and item.exists() and not item.is_dir():
            raise ValueError("LOCAL_INDEX_DIRECTORY_REQUIRED")


class TerminalFileIO(PyArrowFileIO):
    @staticmethod
    def parse_location(location, properties=None):
        uri = urlparse(location)
        if uri.scheme != "file" or uri.netloc or uri.query or uri.fragment:
            raise ValueError("LOCAL_INDEX_FILE_URI_REQUIRED")
        if not properties or "terminal.root" not in properties:
            raise ValueError("LOCAL_INDEX_ROOT_REQUIRED")
        root = Path(properties["terminal.root"])
        path = Path(url2pathname(uri.path))
        if not path.is_absolute():
            raise ValueError("LOCAL_INDEX_FILE_URI_REQUIRED")
        safe_path(path)
        resolved = path.resolve()
        if not resolved.is_relative_to(root) or resolved == root:
            raise ValueError("LOCAL_INDEX_PATH_ESCAPE")
        if path.exists():
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE_BYTES:
                raise ValueError("LOCAL_INDEX_FILE_BOUND")
        return "file", "", str(resolved)

    def new_output(self, location):
        _, _, path = self.parse_location(location, self.properties)
        if Path(path).exists():
            raise ValueError("LOCAL_INDEX_OVERWRITE_REFUSED")
        return super().new_output(location)

    def delete(self, location):
        raise ValueError("LOCAL_INDEX_DELETE_REFUSED")
