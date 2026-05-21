"""Outlook宛先作成アプリ用の軽量バックエンド。

Windows + Outlook + pywin32 がある環境ではOutlookから実データを取得し、
それ以外の環境では明示的なエラーを返す。CSVとSQLiteを同時に更新する。
"""
from __future__ import annotations

import csv
import json
import logging
import logging.handlers
import os
import sqlite3
import sys
import threading
import time
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    from .event_parser import JST, ParsedEvent, parse_event_text
except ImportError:  # pragma: no cover - direct script execution
    from event_parser import JST, ParsedEvent, parse_event_text

BASE_DIR = Path(__file__).resolve().parents[1]
PUBLIC_CSV_PATH = BASE_DIR / "public" / "send_mail-ranking_tabulator.csv"
DIST_CSV_PATH = BASE_DIR / "dist" / "send_mail-ranking_tabulator.csv"
DB_PATH = BASE_DIR / "backend" / "data" / "app.sqlite3"
LOG_PATH = BASE_DIR / "backend" / "logs" / "app.log"
JOB_LOCKS: dict[str, threading.Lock] = {}
JOB_LOCKS_LOCK = threading.Lock()
LOGGER = logging.getLogger("outlook_address_maker")

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


def setup_logging() -> None:
    if LOGGER.handlers:
        return

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOGGER.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(threadName)s] %(message)s",
        "%Y-%m-%d %H:%M:%S",
    )
    file_handler = logging.handlers.RotatingFileHandler(
        LOG_PATH,
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    LOGGER.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    LOGGER.addHandler(console_handler)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def is_allowed_browser_origin(origin: str | None, host: str | None) -> bool:
    if not origin:
        return True
    if not host:
        return False
    try:
        parsed = urlparse(origin)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and parsed.netloc.lower() == host.lower()


@contextmanager
def db_connection() -> Any:
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


def ensure_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db_connection() as conn:
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
            CREATE TABLE IF NOT EXISTS favorites (
              name TEXT PRIMARY KEY,
              addresses TEXT NOT NULL,
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


def seed_dummy_data() -> dict[str, int]:
    """Outlookを使えない検証環境向けに、画面確認用のサンプルデータを保存する。"""
    ensure_db()
    recipients = [
        ("山田 太郎", 12),
        ("佐藤 一郎", 8),
        ("職アド 管理者", 5),
        ("テスト 利用者", 0),
    ]
    matches = [
        KeywordMatch(
            received_time="2026-05-14T09:30:00+09:00",
            subject="職アドからのお知らせ: 棚卸対応",
            line="棚卸の回答期限は本日17時です。",
            keyword="棚卸",
            is_new=False,
        ),
        KeywordMatch(
            received_time="2026-05-13T16:45:00+09:00",
            subject="職アドからのお知らせ: ユーザID確認",
            line="ユーザIDの申請内容を確認してください。",
            keyword="ユーザID",
            is_new=False,
        ),
        KeywordMatch(
            received_time="2026-05-12T11:15:00+09:00",
            subject="職アドからのお知らせ: 棚おろし準備",
            line="棚おろし前の事前チェックをお願いします。",
            keyword="棚おろし",
            is_new=False,
        ),
    ]
    save_recipients(recipients)
    persisted_matches = persist_keyword_matches(matches)
    record_job_run("refresh_addresses", "success", "ダミーデータを保存しました")
    record_job_run("check_keywords", "success", f"ダミーデータ {len(matches)}件を保存しました")
    write_recipients_csv(recipients)
    return {
        "recipients": len(recipients),
        "keyword_matches": sum(1 for match in persisted_matches if match.is_new),
        "job_runs": 2,
    }


def get_settings() -> dict[str, Any]:
    ensure_db()
    settings = dict(DEFAULT_SETTINGS)
    with db_connection() as conn:
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

    with db_connection() as conn:
        for key, value in current.items():
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                (key, json.dumps(value, ensure_ascii=False)),
            )
        conn.commit()
    return current


def normalize_favorite_addresses(addresses: Any) -> list[str]:
    if isinstance(addresses, str):
        parts = addresses.replace("、", ";").replace(",", ";").split(";")
    elif isinstance(addresses, list):
        parts = [str(item) for item in addresses]
    else:
        parts = []
    return [part.strip() for part in parts if part.strip()]


def list_favorites() -> list[dict[str, Any]]:
    ensure_db()
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT name, addresses, updated_at FROM favorites ORDER BY updated_at DESC, name"
        ).fetchall()
    return [
        {
            "name": row[0],
            "addresses": json.loads(row[1]),
            "updated_at": row[2],
        }
        for row in rows
    ]


def save_favorites(payload: dict[str, Any]) -> list[dict[str, Any]]:
    ensure_db()
    favorites = payload.get("favorites")
    if not isinstance(favorites, list):
        raise ValueError("favorites must be an array")

    normalized: dict[str, list[str]] = {}
    for favorite in favorites:
        if not isinstance(favorite, dict):
            continue
        name = str(favorite.get("name") or "").strip()
        addresses = normalize_favorite_addresses(favorite.get("addresses"))
        if name and addresses:
            normalized[name] = addresses

    now = utc_now()
    with db_connection() as conn:
        conn.execute("DELETE FROM favorites")
        for name, addresses in normalized.items():
            conn.execute(
                "INSERT INTO favorites(name, addresses, updated_at) VALUES(?, ?, ?)",
                (name, json.dumps(addresses, ensure_ascii=False), now),
            )
        conn.commit()
    return list_favorites()


def add_favorite(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_db()
    name = str(payload.get("name") or "").strip()
    addresses = normalize_favorite_addresses(payload.get("addresses"))
    if not name:
        raise ValueError("お気に入り名を入力してください")
    if not addresses:
        raise ValueError("お気に入りに登録する宛先がありません")

    favorite = {"name": name, "addresses": addresses, "updated_at": utc_now()}
    with db_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO favorites(name, addresses, updated_at) VALUES(?, ?, ?)",
            (favorite["name"], json.dumps(favorite["addresses"], ensure_ascii=False), favorite["updated_at"]),
        )
        conn.commit()
    return favorite


def read_recipients_csv(path: Path) -> dict[str, int]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as fp:
        reader = csv.DictReader(fp)
        result: dict[str, int] = {}
        for row in reader:
            name = (row.get("名前") or "").strip()
            if name:
                try:
                    result[name] = int(row.get("回数") or 0)
                except ValueError:
                    LOGGER.warning("Skipped recipient row with invalid count: name=%s count=%s", name, row.get("回数"))
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
    with db_connection() as conn:
        conn.execute("DELETE FROM recipients")
        for name, count in rows:
            conn.execute(
                "INSERT OR REPLACE INTO recipients(name, count, updated_at) VALUES(?, ?, ?)",
                (name, count, now),
            )
        conn.commit()


def list_recipient_rows_for_csv(conn: sqlite3.Connection) -> list[tuple[str, int]]:
    return [
        (str(row[0]), int(row[1]))
        for row in conn.execute("SELECT name, count FROM recipients ORDER BY count DESC, name")
    ]


def outlook_namespace() -> Any:
    return outlook_application().GetNamespace("MAPI")


def outlook_application() -> Any:
    try:
        import win32com.client  # type: ignore[import-not-found]
    except ImportError as exc:
        LOGGER.exception("pywin32 import failed")
        raise RuntimeError("Outlook連携にはWindows環境とpywin32が必要です") from exc

    try:
        return win32com.client.gencache.EnsureDispatch("Outlook.Application")
    except Exception:
        LOGGER.warning("EnsureDispatch failed; clearing Outlook gen_py cache and retrying", exc_info=True)
        clear_outlook_gen_py_cache()

    try:
        return win32com.client.gencache.EnsureDispatch("Outlook.Application")
    except Exception:
        LOGGER.warning("EnsureDispatch retry failed; falling back to Dispatch", exc_info=True)

    try:
        return win32com.client.Dispatch("Outlook.Application")
    except Exception as exc:  # noqa: BLE001 - pywin32 raises platform-specific COM errors
        LOGGER.exception("Failed to connect to Outlook COM namespace")
        raise RuntimeError(
            "OutlookのCOM連携を開始できません。"
            "クラシック版Outlookがインストールされ、同じWindowsユーザーで起動できる状態か確認してください。"
            "新しいOutlookのみの環境ではOutlook.Applicationが登録されないため、この機能は使えません。"
        ) from exc


def clear_outlook_gen_py_cache() -> None:
    temp_dir = Path(os.environ.get("TEMP", "")) / "gen_py/3.12"
    if not temp_dir.exists():
        return
    for folder in temp_dir.glob("*000000000046*"):
        if folder.is_dir():
            import shutil
            shutil.rmtree(folder, ignore_errors=True)


@contextmanager
def outlook_com_context() -> Any:
    try:
        import pythoncom  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("Outlook連携にはWindows環境とpywin32が必要です") from exc

    pythoncom.CoInitialize()
    try:
        yield
    finally:
        pythoncom.CoUninitialize()


def get_sent_item_recipients(limit: int = 150) -> list[str]:
    with outlook_com_context():
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
    LOGGER.info("Refreshing addresses from sent items: limit=%s", limit)
    recipients = get_sent_item_recipients(limit)
    if not recipients:
        LOGGER.warning("No sent item recipients were found")
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
    LOGGER.info(
        "Refreshed addresses: saved_count=%s zero_count=%s csv_path=%s",
        len(merged_rows),
        sum(1 for _, count in merged_rows if count == 0),
        PUBLIC_CSV_PATH,
    )
    return {
        "saved_count": len(merged_rows),
        "zero_count": sum(1 for _, count in merged_rows if count == 0),
        "csv_path": str(PUBLIC_CSV_PATH),
    }


def parse_schedule(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(payload.get("text") or "")
    parsed = parse_event_text(text)
    return {"event": parsed.to_dict()}


def add_schedule(payload: dict[str, Any]) -> dict[str, Any]:
    parsed = schedule_event_from_payload(payload)
    save_outlook_event(parsed)
    record_job_run("add_schedule", "success", f"{parsed.subject} を追加しました")
    return {"event": parsed.to_dict(), "saved": True}


def schedule_event_from_payload(payload: dict[str, Any]) -> ParsedEvent:
    event_payload = payload.get("event")
    if event_payload is None:
        return parse_event_text(str(payload.get("text") or ""))
    if not isinstance(event_payload, dict):
        raise ValueError("event must be an object")

    subject = str(event_payload.get("subject") or "").strip()
    if not subject:
        raise ValueError("件名を入力してください")

    start = parse_schedule_datetime(event_payload.get("start"))
    end = parse_schedule_datetime(event_payload.get("end"))
    all_day = bool(event_payload.get("all_day", False))
    if end <= start:
        raise ValueError("終了日時は開始日時より後にしてください")

    return ParsedEvent(
        start=start,
        end=end,
        subject=subject,
        location=str(event_payload.get("location") or "").strip(),
        body=str(event_payload.get("body") or "").strip(),
        all_day=all_day,
        duration_minutes=max(1, int((end - start).total_seconds() // 60)),
        normalized_text=str(event_payload.get("normalized_text") or payload.get("text") or ""),
    )


def parse_schedule_datetime(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("日時を入力してください")
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError("日時の形式が正しくありません") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=JST)
    return parsed.astimezone(JST)


def save_outlook_event(event: ParsedEvent) -> None:
    with outlook_com_context():
        app = outlook_application()
        appointment = app.CreateItem(1)
        appointment.Start = event.start.strftime("%Y/%m/%d %H:%M:%S")
        appointment.Subject = event.subject
        appointment.Duration = event.duration_minutes
        appointment.Location = event.location
        appointment.Body = event.body
        appointment.ReminderSet = True
        appointment.ReminderMinutesBeforeStart = 5
        appointment.AllDayEvent = bool(event.all_day)
        appointment.BusyStatus = 2
        appointment.Save()


def message_received_time(message: Any) -> str:
    received_time = getattr(message, "ReceivedTime", "")
    if hasattr(received_time, "isoformat"):
        return received_time.isoformat()
    return str(received_time)


def find_keyword_matches(keywords: list[str], limit: int = 500) -> list[KeywordMatch]:
    with outlook_com_context():
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
    with db_connection() as conn:
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
    LOGGER.info("Checking keyword matches: limit=%s keywords=%s", limit, keywords)
    matches = persist_keyword_matches(find_keyword_matches(keywords, limit))
    new_matches = [match for match in matches if match.is_new]
    record_job_run("check_keywords", "success", f"新規{len(new_matches)}件 / 合計{len(matches)}件")
    LOGGER.info("Checked keyword matches: total=%s new=%s", len(matches), len(new_matches))
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
    with db_connection() as conn:
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


def list_database() -> dict[str, list[dict[str, Any]]]:
    ensure_db()
    with db_connection() as conn:
        conn.row_factory = sqlite3.Row
        settings = [
            {"key": row["key"], "value": row["value"]}
            for row in conn.execute("SELECT key, value FROM settings ORDER BY key")
        ]
        recipients = [
            {"name": row["name"], "count": row["count"], "updated_at": row["updated_at"]}
            for row in conn.execute(
                "SELECT name, count, updated_at FROM recipients ORDER BY updated_at DESC, count DESC, name"
            )
        ]
        favorites = [
            {
                "name": row["name"],
                "addresses": json.loads(row["addresses"]),
                "updated_at": row["updated_at"],
            }
            for row in conn.execute(
                "SELECT name, addresses, updated_at FROM favorites ORDER BY updated_at DESC, name"
            )
        ]
        keyword_matches = [
            {
                "id": row["id"],
                "received_time": row["received_time"],
                "subject": row["subject"],
                "line": row["line"],
                "keyword": row["keyword"],
                "first_seen_at": row["first_seen_at"],
            }
            for row in conn.execute(
                """
                SELECT id, received_time, subject, line, keyword, first_seen_at
                FROM keyword_matches
                ORDER BY received_time DESC, first_seen_at DESC, id DESC
                """
            )
        ]
        job_runs = [
            {
                "job_name": row["job_name"],
                "last_run_at": row["last_run_at"],
                "status": row["status"],
                "message": row["message"],
            }
            for row in conn.execute(
                "SELECT job_name, last_run_at, status, message FROM job_runs ORDER BY last_run_at DESC, job_name"
            )
        ]
    return {
        "settings": settings,
        "recipients": recipients,
        "favorites": favorites,
        "keyword_matches": keyword_matches,
        "job_runs": job_runs,
    }


def delete_database_records(table: str, keys: list[str]) -> dict[str, Any]:
    ensure_db()
    if table not in {"recipients", "favorites", "keyword_matches", "job_runs"}:
        raise ValueError("削除できないテーブルです")
    if not keys:
        return {"table": table, "deleted": 0}

    recipient_rows: list[tuple[str, int]] | None = None
    with db_connection() as conn:
        if table == "recipients":
            cursor = conn.executemany("DELETE FROM recipients WHERE name = ?", [(key,) for key in keys])
            recipient_rows = list_recipient_rows_for_csv(conn)
        elif table == "favorites":
            cursor = conn.executemany("DELETE FROM favorites WHERE name = ?", [(key,) for key in keys])
        elif table == "keyword_matches":
            ids = [int(key) for key in keys]
            cursor = conn.executemany("DELETE FROM keyword_matches WHERE id = ?", [(row_id,) for row_id in ids])
        else:
            cursor = conn.executemany("DELETE FROM job_runs WHERE job_name = ?", [(key,) for key in keys])
        conn.commit()
        deleted = cursor.rowcount if cursor.rowcount != -1 else 0
    if recipient_rows is not None:
        write_recipients_csv(recipient_rows)
    return {"table": table, "deleted": deleted}


def record_job_run(job_name: str, status: str, message: str) -> None:
    with db_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO job_runs(job_name, last_run_at, status, message) VALUES(?, ?, ?, ?)",
            (job_name, utc_now(), status, message),
        )
        conn.commit()


def list_job_runs() -> dict[str, dict[str, str]]:
    ensure_db()
    with db_connection() as conn:
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
        LOGGER.info("Skipped job because it is already running: %s", job_name)
        return
    try:
        LOGGER.info("Starting scheduled job: %s", job_name)
        callback()
        LOGGER.info("Finished scheduled job: %s", job_name)
    except Exception as exc:  # noqa: BLE001 - job loop should keep running and expose error
        LOGGER.exception("Scheduled job failed: %s", job_name)
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
        origin = self.headers.get("Origin")
        if origin and self.is_allowed_origin():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        if not self.ensure_allowed_origin():
            return
        self.send_response(204)
        self.end_headers()

    def is_allowed_origin(self) -> bool:
        return is_allowed_browser_origin(self.headers.get("Origin"), self.headers.get("Host"))

    def ensure_allowed_origin(self) -> bool:
        if self.is_allowed_origin():
            return True
        LOGGER.warning("Rejected request from disallowed Origin: %s", self.headers.get("Origin"))
        self.write_json({"error": "forbidden origin"}, status=403)
        return False

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        LOGGER.info("GET %s", parsed.path)
        if parsed.path == "/api/health":
            self.write_json({"ok": True, "settings": get_settings(), "jobs": list_job_runs()})
        elif parsed.path == "/api/settings":
            self.write_json(get_settings())
        elif parsed.path == "/api/favorites":
            self.write_json({"favorites": list_favorites()})
        elif parsed.path == "/api/keyword-matches":
            params = parse_qs(parsed.query)
            self.write_json({"matches": list_keyword_matches(params.get("new_only") == ["1"])})
        elif parsed.path == "/api/database":
            self.write_json(list_database())
        elif parsed.path.startswith("/api/"):
            self.write_json({"error": "not found"}, status=404)
        else:
            super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        LOGGER.info("POST %s", parsed.path)
        if not self.ensure_allowed_origin():
            return
        try:
            if parsed.path == "/api/refresh-addresses":
                payload = self.read_json()
                self.write_json(refresh_addresses(int(payload.get("limit", 150))))
            elif parsed.path == "/api/check-keywords":
                payload = self.read_json()
                self.write_json(check_keywords(int(payload.get("limit", 500))))
            elif parsed.path == "/api/parse-schedule":
                self.write_json(parse_schedule(self.read_json()))
            elif parsed.path == "/api/add-schedule":
                self.write_json(add_schedule(self.read_json()))
            elif parsed.path == "/api/seed-dummy-data":
                self.write_json({"inserted": seed_dummy_data(), "database": list_database()})
            elif parsed.path == "/api/favorites/add":
                favorite = add_favorite(self.read_json())
                self.write_json({"favorite": favorite, "favorites": list_favorites()})
            elif parsed.path == "/api/database/delete":
                payload = self.read_json()
                result = delete_database_records(
                    str(payload.get("table") or ""),
                    [str(key) for key in payload.get("keys", [])],
                )
                self.write_json({"result": result, "database": list_database()})
            else:
                self.write_json({"error": "not found"}, status=404)
        except Exception as exc:  # noqa: BLE001 - return surfaced app errors to UI
            LOGGER.exception("POST %s failed", parsed.path)
            self.write_json({"error": str(exc)}, status=500)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        LOGGER.info("PUT %s", parsed.path)
        if not self.ensure_allowed_origin():
            return
        try:
            if parsed.path == "/api/settings":
                self.write_json(save_settings(self.read_json()))
            elif parsed.path == "/api/favorites":
                self.write_json({"favorites": save_favorites(self.read_json())})
            else:
                self.write_json({"error": "not found"}, status=404)
        except Exception as exc:  # noqa: BLE001 - validation errors are shown in UI
            LOGGER.exception("PUT %s failed", parsed.path)
            self.write_json({"error": str(exc)}, status=400)

    def log_message(self, format: str, *args: Any) -> None:
        LOGGER.info("%s - %s", self.address_string(), format % args)

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
    setup_logging()
    ensure_db()
    LOGGER.info("Starting backend: base_dir=%s db_path=%s log_path=%s", BASE_DIR, DB_PATH, LOG_PATH)
    if os.environ.get("OUTLOOK_ADDRESS_DISABLE_SCHEDULER") != "1":
        threading.Thread(target=scheduler_loop, daemon=True).start()
        LOGGER.info("Scheduler enabled")
    else:
        LOGGER.info("Scheduler disabled by OUTLOOK_ADDRESS_DISABLE_SCHEDULER")
    host = os.environ.get("OUTLOOK_ADDRESS_HOST", "127.0.0.1")
    port = int(os.environ.get("OUTLOOK_ADDRESS_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Serving Outlook address maker on http://{host}:{port}", file=sys.stderr)
    server.serve_forever()


if __name__ == "__main__":
    main()
