#!/usr/bin/env python3
import os
import sys
import sqlite3
import zipfile
import tempfile
import shutil
from datetime import datetime


def is_excluded_path(path: str) -> bool:
    exclude_dirs = {'__pycache__', '.git', 'venv', 'env', 'node_modules', '.mypy_cache', '.pytest_cache', '.cache'}
    exclude_files_suffixes = {'.pyc', '.pyo', '.log'}
    parts = set(os.path.normpath(path).split(os.sep))
    if parts & exclude_dirs:
        return True
    base = os.path.basename(path)
    if any(base.endswith(suf) for suf in exclude_files_suffixes):
        return True
    return False


def backup_database(working_dir: str, backups_dir: str) -> str:
    db_path = os.path.join(working_dir, 'restaurant.db')
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found: {db_path}")
    os.makedirs(backups_dir, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    dest = os.path.join(backups_dir, f'restaurant_db_backup_{ts}.sqlite')
    shutil.copy2(db_path, dest)
    return dest


def verify_sqlite(path: str) -> tuple[bool, str]:
    if not os.path.exists(path):
        return False, f"File not found: {path}"
    try:
        with sqlite3.connect(path) as conn:
            cur = conn.execute('PRAGMA integrity_check;')
            res = cur.fetchone()
            ok = bool(res and str(res[0]).lower() == 'ok')
            return ok, f"PRAGMA integrity_check -> {res[0] if res else 'No result'}"
    except Exception as e:
        return False, f"SQLite error: {e}"


def backup_full_system(working_dir: str, backups_dir: str) -> str:
    os.makedirs(backups_dir, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    zip_path = os.path.join(backups_dir, f'restaurant_full_backup_{ts}.zip')

    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zipf:
        # manifest
        manifest = (
            '{"created_at": "%s", "includes": ["working directory (filtered)"]}'
            % datetime.now().isoformat()
        )
        zipf.writestr('BACKUP_MANIFEST.json', manifest)

        for root, dirs, files in os.walk(working_dir):
            # prevent descending into excluded dirs
            rel_root = os.path.relpath(root, working_dir)
            if rel_root == '.':
                filtered = [d for d in dirs if not is_excluded_path(d)]
            else:
                filtered = [d for d in dirs if not is_excluded_path(os.path.join(rel_root, d))]
            dirs[:] = filtered

            for f in files:
                rel = os.path.relpath(os.path.join(root, f), working_dir)
                if is_excluded_path(rel):
                    continue
                # avoid re-zipping other backup zips
                if f.lower().endswith('.zip') and ('backup' in f.lower()):
                    continue
                abs_path = os.path.join(working_dir, rel)
                if os.path.isfile(abs_path):
                    zipf.write(abs_path, rel)

    return zip_path


def verify_full_backup(zip_path: str) -> tuple[bool, str]:
    if not os.path.exists(zip_path):
        return False, f"File not found: {zip_path}"
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            names = z.namelist()
            has_db = any(n.endswith('restaurant.db') for n in names)
            has_app = any(n.endswith('app.py') for n in names)

            inner_msg = 'No inner DB check performed'
            # Try inner DB integrity if present
            db_entries = [n for n in names if n.endswith('restaurant.db')]
            if db_entries:
                data = z.read(db_entries[0])
                with tempfile.NamedTemporaryFile(delete=True, suffix='.sqlite') as tmp:
                    tmp.write(data)
                    tmp.flush()
                    ok_db, msg_db = verify_sqlite(tmp.name)
                    inner_msg = f"Inner DB integrity: {'OK' if ok_db else 'FAIL'} ({msg_db})"

            ok = has_db and has_app
            return ok, f"Contains DB: {has_db}, Contains app.py: {has_app}. {inner_msg}"
    except Exception as e:
        return False, f"Zip error: {e}"


def main():
    working_dir = os.path.dirname(os.path.dirname(__file__))
    backups_dir = os.path.join(working_dir, 'backups')

    print(f"Working dir: {working_dir}")
    print(f"Backups dir: {backups_dir}")

    # DB backup
    db_backup = backup_database(working_dir, backups_dir)
    ok_db, msg_db = verify_sqlite(db_backup)
    print(f"[DB BACKUP] {db_backup}")
    print(f"[DB VERIFY] {'OK' if ok_db else 'FAIL'} - {msg_db}")

    # Full backup
    full_backup = backup_full_system(working_dir, backups_dir)
    ok_zip, msg_zip = verify_full_backup(full_backup)
    print(f"[FULL BACKUP] {full_backup}")
    print(f"[FULL VERIFY] {'OK' if ok_zip else 'FAIL'} - {msg_zip}")


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


