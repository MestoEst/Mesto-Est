"""Emulate Windows file locks on Linux; do not let GC hide unclosed SQLite handles.
Run: python tests/sqlite_cleanup_test.py
"""
import runpy
import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
original_connect = sqlite3.connect
handles = []


class TrackedConnection(sqlite3.Connection):
    closed_explicitly = False

    def close(self):
        super().close()
        self.closed_explicitly = True


def connect(database, *args, **kwargs):
    kwargs['factory'] = TrackedConnection
    connection = original_connect(database, *args, **kwargs)
    handles.append((str(database), connection))  # strong references prevent implicit GC close
    return connection


class CheckedDirectory(tempfile.TemporaryDirectory):
    def cleanup(self):
        leaking = [name for name, handle in handles
                   if str(self.name) in name and not handle.closed_explicitly]
        if leaking:
            raise AssertionError(f'SQLite files still open before directory cleanup: {leaking}')
        super().cleanup()


with patch('sqlite3.connect', connect), patch('sqlite3.dbapi2.connect', connect), patch('tempfile.TemporaryDirectory', CheckedDirectory):
    runpy.run_path(str(ROOT / 'tools/rehearse_spot_ids.py'), run_name='__main__')
    # Exercise the standalone backup's handles in this process as well.
    with CheckedDirectory() as temporary:
        source = Path(temporary) / 'source.sqlite3'
        source_connection = connect(source)
        source_connection.execute('CREATE TABLE sample (id INTEGER)')
        source_connection.close()
        with patch.object(sys, 'argv', ['backup_sqlite.py', '--source', str(source), '--output', str(Path(temporary) / 'backup.sqlite3')]):
            runpy.run_path(str(ROOT / 'tools/backup_sqlite.py'), run_name='__main__')

assert handles and all(handle.closed_explicitly for _, handle in handles)
print('PASS: all SQLite connections explicitly closed before temporary file cleanup (GC disabled by retained references).')
