"""Consistent full SQLite backup, usable BEFORE Django schema migrations."""
import argparse
import sqlite3
from contextlib import closing
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True);parser.add_argument('--output',required=True)
args=parser.parse_args()
source=Path(args.source).resolve();destination=Path(args.output).resolve()
if not source.is_file():parser.error('Исходная база не найдена')
if source==destination:parser.error('Нужен отдельный файл')
with destination.open('xb'):pass  # never overwrite a previous backup
with closing(sqlite3.connect(f'file:{source}?mode=ro',uri=True)) as src:
    with closing(sqlite3.connect(destination)) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Backup integrity check failed')
print(f'Полная проверенная копия: {destination}')
