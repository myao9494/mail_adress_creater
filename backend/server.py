"""Outlook宛先作成アプリ用の軽量バックエンド。

Windows + Outlook + pywin32 がある環境ではOutlookから実データを取得し、
それ以外の環境では明示的なエラーを返す。CSVとSQLiteを同時に更新する。
"""
from __future__ import annotations

import csv
import json
import os
import sqlite3
import sys
import threading
import time
import traceback
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parents[1]
PUBLIC_CSV_PATH = BASE_DIR / "public" / "send_mail-ranking_tabulator.csv"
DIST_CSV_PATH = BASE_DIR / "dist" / "send_mail-ranking_tabulator.csv"
DB_PATH = BASE_DIR / "backend" / "data" / "app.sqlite3"
JOB_LOCKS: dict[str, threading.Lock] = {}
JOB_LOCKS_LOCK = threading.Lock()

DEFAULT_SETTINGS = {
    "keywords": ["棚卸", "棚おろし", "ユーザID"],
    "address_interval_minutes": 43200,
    "keyword_interval_minutes": 60,
}

@dataclass
class KeywordMatch:
    received_time: str
    subject: str
    line: str
    keyword: str
    is_new: bool


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS recipients (
              name TEXT PRIMARY KEY,
              count INTEGER NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS keyword_matches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              received_time TEXT NOT NULL,
              subject TEXT NOT NULL,
              line TEXT NOT NULL,
              keyword TEXT NOT NULL,
              first_seen_at TEXT NOT NULL,
              UNIQUE(received_time, subject, line, keyword)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS job_runs (
              job_name TEXT PRIMARY KEY,
              last_run_at TEXT NOT NULL,
              status TEXT NOT NULL,
              message TEXT NOT NULL
            )
            """
        )
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)",
                (key, json.dumps(value, ensure_ascii=False)),
            )
        conn.commit()


def get_settings() -> dict[str, Any]:
    ensure_db()
    settings = dict(DEFAULT_SETTINGS)
    with sqlite3.connect(DB_PATH) as conn:
        for key, value in conn.execute("SELECT key, value FROM settings"):
            settings[key] = json.loads(value)
    return settings


def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    current = get_settings()
    if "keywords" in payload:
        keywords = payload["keywords"]
        if not isinstance(keywords, list) or not all(isinstance(item, str) for item in keywords):
            raise ValueError("keywords must be a string array")
        current["keywords"] = [item.strip() for item in keywords if item.strip()]
    for key in ("address_interval_minutes", "keyword_interval_minutes"):
        if key in payload:
            value = int(payload[key])
            if value < 1:
                raise ValueError(f"{key} must be greater than 0")
            current[key] = value

    with sqlite3.connect(DB_PATH) as conn:
        for key, value in current.items():
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                (key, json.dumps(value, ensure_ascii=False)),
            )
        conn.commit()
    return current


def read_recipients_csv(path: Path) -> dict[str, int]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as fp:
        reader = csv.DictReader(fp)
        result: dict[str, int] = {}
        for row in reader:
            name = (row.get("名前") or "").strip()
            if name:
                result[name] = int(row.get("回数") or 0)
        return result


def write_recipients_csv(rows: list[tuple[str, int]]) -> None:
    for path in (PUBLIC_CSV_PATH, DIST_CSV_PATH):
        if path.parent.exists():
            with path.open("w", encoding="utf-8", newline="") as fp:
                writer = csv.writer(fp)
                writer.writerow(["名前", "回数"])
                writer.writerows(rows)


def save_recipients(rows: list[tuple[str, int]]) -> None:
    now = utc_now()
    with sqlite3.connect(DB_PATH) as conn:
        for name, count in rows:
            conn.execute(
                "INSERT OR REPLACE INTO recipients(name, count, updated_at) VALUES(?, ?, ?)",
                (name, count, now),
            )
        conn.commit()


def outlook_namespace() -> Any:
    try:
        import win32com.client  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("Outlook連携にはWindows環境とpywin32が必要です") from exc
    return win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")


def get_sent_item_recipients(limit: int = 150) -> list[str]:
    namespace = outlook_namespace()
    sent_folder = namespace.GetDefaultFolder(5)
    items = sent_folder.Items
    items.Sort("[SentOn]", True)
    recipients: list[str] = []
    for index, item in enumerate(items, start=1):
        if index > limit:
            break
        for recipient in item.Recipients:
            name = str(getattr(recipient, "Name", "") or "").strip()
            if name:
                recipients.append(name)
    return recipients


def count_and_sort_recipients(recipients: list[str]) -> list[tuple[str, int]]:
    return sorted(Counter(recipients).items(), key=lambda item: (-item[1], item[0]))


def refresh_addresses(limit: int = 150) -> dict[str, Any]:
    ensure_db()
    recipients = get_sent_item_recipients(limit)
    if not recipients:
        raise RuntimeError("送信済みアイテムフォルダにメールがありません")

    old_counts = read_recipients_csv(PUBLIC_CSV_PATH)
    new_counts = dict(count_and_sort_recipients(recipients))
    all_names = set(old_counts) | set(new_counts)
    merged_rows = sorted(
        ((name, int(new_counts.get(name, 0))) for name in all_names),
        key=lambda item: (-item[1], item[0]),
    )
    write_recipients_csv(merged_rows)
    save_recipients(merged_rows)
    record_job_run("refresh_addresses", "success", f"{len(merged_rows)}件を保存しました")
    return {
        "saved_count": len(merged_rows),
        "zero_count": sum(1 for _, count in merged_rows if count == 0),
        "csv_path": str(PUBLIC_CSV_PATH),
    }


def message_received_time(message: Any) -> str:
    received_time = getattr(message, "ReceivedTime", "")
    if hasattr(received_time, "isoformat"):
        return received_time.isoformat()
    return str(received_time)


def find_keyword_matches(keywords: list[str], limit: int = 500) -> list[KeywordMatch]:
    namespace = outlook_namespace()
    inbox = namespace.GetDefaultFolder(6)
    messages = inbox.Items
    messages.Sort("[ReceivedTime]", True)
    matches: list[KeywordMatch] = []
    for index, message in enumerate(messages, start=1):
        if index > limit:
            break
        subject = str(getattr(message, "Subject", "") or "")
        if "職アドからのお知らせ" not in subject:
            continue
        body = str(getattr(message, "Body", "") or "")
        received_time = message_received_time(message)
        for line in body.splitlines():
            matched_keyword = next((keyword for keyword in keywords if keyword in line), None)
            if matched_keyword:
                matches.append(
                    KeywordMatch(
                        received_time=received_time,
                        subject=subject,
                        line=line.strip(),
                        keyword=matched_keyword,
                        is_new=False,
                    )
                )
    return matches


def persist_keyword_matches(matches: list[KeywordMatch]) -> list[KeywordMatch]:
    now = utc_now()
    persisted: list[KeywordMatch] = []
    with sqlite3.connect(DB_PATH) as conn:
        for match in matches:
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO keyword_matches(
                  received_time, subject, line, keyword, first_seen_at
                ) VALUES(?, ?, ?, ?, ?)
                """,
                (match.received_time, match.subject, match.line, match.keyword, now),
            )
            persisted.append(
                KeywordMatch(
                    received_time=match.received_time,
                    subject=match.subject,
                    line=match.line,
                    keyword=match.keyword,
                    is_new=cursor.rowcount == 1,
                )
            )
        conn.commit()
    return persisted


def check_keywords(limit: int = 500) -> dict[str, Any]:
    ensure_db()
    keywords = get_settings()["keywords"]
    matches = persist_keyword_matches(find_keyword_matches(keywords, limit))
    new_matches = [match for match in matches if match.is_new]
    record_job_run("check_keywords", "success", f"新規{len(new_matches)}件 / 合計{len(matches)}件")
    return {
        "matches": [match.__dict__ for match in matches],
        "new_matches": [match.__dict__ for match in new_matches],
        "keywords": keywords,
    }


def list_keyword_matches(new_only: bool = False) -> list[dict[str, Any]]:
    ensure_db()
    if new_only:
        return []
    query = "SELECT received_time, subject, line, keyword, first_seen_at FROM keyword_matches ORDER BY first_seen_at DESC, id DESC"
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(query).fetchall()
    return [
        {
            "received_time": row[0],
            "subject": row[1],
            "line": row[2],
            "keyword": row[3],
            "first_seen_at": row[4],
            "is_new": False,
        }
        for row in rows
    ]


def record_job_run(job_name: str, status: str, message: str) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO job_runs(job_name, last_run_at, status, message) VALUES(?, ?, ?, ?)",
            (job_name, utc_now(), status, message),
        )
        conn.commit()


def list_job_runs() -> dict[str, dict[str, str]]:
    ensure_db()
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT job_name, last_run_at, status, message FROM job_runs").fetchall()
    return {
        row[0]: {
            "last_run_at": row[1],
            "status": row[2],
            "message": row[3],
        }
        for row in rows
    }


def job_lock(job_name: str) -> threading.Lock:
    with JOB_LOCKS_LOCK:
        if job_name not in JOB_LOCKS:
            JOB_LOCKS[job_name] = threading.Lock()
        return JOB_LOCKS[job_name]


def run_job_safely(job_name: str, callback: Any) -> None:
    lock = job_lock(job_name)
    if not lock.acquire(blocking=False):
        return
    try:
        callback()
    except Exception as exc:  # noqa: BLE001 - job loop should keep running and expose error
        record_job_run(job_name, "error", str(exc))
    finally:
        lock.release()


def scheduler_loop() -> None:
    while True:
        settings = get_settings()
        runs = list_job_runs()
        now_ts = time.time()
        jobs = [
            ("refresh_addresses", settings["address_interval_minutes"], refresh_addresses),
            ("check_keywords", settings["keyword_interval_minutes"], check_keywords),
        ]
        for job_name, interval_minutes, callback in jobs:
            last_run_at = runs.get(job_name, {}).get("last_run_at")
            if not last_run_at:
                last_ts = 0
            else:
                try:
                    last_ts = datetime.fromisoformat(last_run_at).timestamp()
                except ValueError:
                    last_ts = 0
            if now_ts - last_ts >= int(interval_minutes) * 60:
                threading.Thread(target=run_job_safely, args=(job_name, callback), daemon=True).start()
        time.sleep(60)


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(BASE_DIR / "dist"), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.write_json({"ok": True, "settings": get_settings(), "jobs": list_job_runs()})
        elif parsed.path == "/api/settings":
            self.write_json(get_settings())
        elif parsed.path == "/api/keyword-matches":
            params = parse_qs(parsed.query)
            self.write_json({"matches": list_keyword_matches(params.get("new_only") == ["1"])})
        elif parsed.path.startswith("/api/"):
            self.write_json({"error": "not found"}, status=404)
        else:
            super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/refresh-addresses":
                payload = self.read_json()
                self.write_json(refresh_addresses(int(payload.get("limit", 150))))
            elif parsed.path == "/api/check-keywords":
                payload = self.read_json()
                self.write_json(check_keywords(int(payload.get("limit", 500))))
            else:
                self.write_json({"error": "not found"}, status=404)
        except Exception as exc:  # noqa: BLE001 - return surfaced app errors to UI
            self.write_json(
                {"error": str(exc), "traceback": traceback.format_exc(limit=4)},
                status=500,
            )

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/settings":
                self.write_json(save_settings(self.read_json()))
            else:
                self.write_json({"error": "not found"}, status=404)
        except Exception as exc:  # noqa: BLE001 - validation errors are shown in UI
            self.write_json({"error": str(exc)}, status=400)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def write_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    ensure_db()
    if os.environ.get("OUTLOOK_ADDRESS_DISABLE_SCHEDULER") != "1":
        threading.Thread(target=scheduler_loop, daemon=True).start()
    host = os.environ.get("OUTLOOK_ADDRESS_HOST", "127.0.0.1")
    port = int(os.environ.get("OUTLOOK_ADDRESS_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Serving Outlook address maker on http://{host}:{port}", file=sys.stderr)
    server.serve_forever()


if __name__ == "__main__":
    main()
