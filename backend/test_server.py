"""バックエンドの主要な保存処理のテスト。"""
from __future__ import annotations

import csv
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.event_parser import parse_event_text
from backend import server


class BackendServerTest(unittest.TestCase):
    def test_parse_event_text_extracts_weekday_time_range(self) -> None:
        base = datetime(2026, 5, 18, 9, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        event = parse_event_text("今週の水曜日 １５：００から１６：３０ 調整会議", base)

        self.assertEqual(event.start.isoformat(timespec="minutes"), "2026-05-20T15:00+09:00")
        self.assertEqual(event.end.isoformat(timespec="minutes"), "2026-05-20T16:30+09:00")
        self.assertEqual(event.duration_minutes, 90)
        self.assertEqual(event.subject, "調整会議")
        self.assertFalse(event.all_day)

    def test_parse_event_text_extracts_spaces_around_colon(self) -> None:
        base = datetime(2026, 5, 18, 9, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        event = parse_event_text("2026年 5 月 28 日 (木)  15 : 00 〜 16 : 00 会議 @ aa", base)

        self.assertEqual(event.start.isoformat(timespec="minutes"), "2026-05-28T15:00+09:00")
        self.assertEqual(event.end.isoformat(timespec="minutes"), "2026-05-28T16:00+09:00")
        self.assertEqual(event.duration_minutes, 60)
        self.assertEqual(event.subject, "会議")
        self.assertEqual(event.location, "aa")
        self.assertFalse(event.all_day)

    def test_parse_event_text_comprehensive_patterns(self) -> None:
        base = datetime(2026, 5, 18, 9, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        cases = [
            {
                "input": "5 / 28 15:00-16:00 会議",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "2026.5.28 15:00 会議",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "２０２６年５月２８日 １５：００から１６：００ 会議",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28木 15:00 会議",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "来週木曜日 15:00 会議",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "あした 15:00 定例",
                "start": "2026-05-19T15:00+09:00",
                "end": "2026-05-19T16:00+09:00",
                "duration": 60,
                "subject": "定例",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 １５　：　３０ 会議",
                "start": "2026-05-28T15:30+09:00",
                "end": "2026-05-28T16:30+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 15時30分 会議",
                "start": "2026-05-28T15:30+09:00",
                "end": "2026-05-28T16:30+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 15時半 会議",
                "start": "2026-05-28T15:30+09:00",
                "end": "2026-05-28T16:30+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 15 時 30 分 会議",
                "start": "2026-05-28T15:30+09:00",
                "end": "2026-05-28T16:30+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 午後 3:00 会議",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 夕方 5 時 会議",
                "start": "2026-05-28T17:00+09:00",
                "end": "2026-05-28T18:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 夜 8:30 会議",
                "start": "2026-05-28T20:30+09:00",
                "end": "2026-05-28T21:30+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 正午 会議",
                "start": "2026-05-28T12:00+09:00",
                "end": "2026-05-28T13:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "",
                "all_day": False,
            },
            {
                "input": "5/28 15:00 会議 @ 会議室A",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "会議室A",
                "all_day": False,
            },
            {
                "input": "5/28 15:00 於 会議室B 会議",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "会議室B",
                "all_day": False,
            },
            {
                "input": "5/28 15:00 会議 会場： オンライン",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "会議",
                "location": "オンライン",
                "all_day": False,
            },
            {
                "input": "5/28 15:00 【定例】進捗確認会議 @ 会議室1",
                "start": "2026-05-28T15:00+09:00",
                "end": "2026-05-28T16:00+09:00",
                "duration": 60,
                "subject": "【定例】進捗確認会議",
                "location": "会議室1",
                "all_day": False,
            },
        ]

        for i, c in enumerate(cases):
            with self.subTest(i=i, text=c["input"]):
                event = parse_event_text(c["input"], base)
                self.assertEqual(event.start.isoformat(timespec="minutes"), c["start"])
                self.assertEqual(event.end.isoformat(timespec="minutes"), c["end"])
                self.assertEqual(event.duration_minutes, c["duration"])
                self.assertEqual(event.subject, c["subject"])
                self.assertEqual(event.location, c["location"])
                self.assertEqual(event.all_day, c["all_day"])

    def test_parse_event_text_extracts_slash_date_hyphen_time_range(self) -> None:
        base = datetime(2026, 5, 18, 9, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        event = parse_event_text("5/20 14:00ー15:00 会議", base)

        self.assertEqual(event.start.isoformat(timespec="minutes"), "2026-05-20T14:00+09:00")
        self.assertEqual(event.end.isoformat(timespec="minutes"), "2026-05-20T15:00+09:00")
        self.assertEqual(event.duration_minutes, 60)
        self.assertEqual(event.subject, "会議")
        self.assertFalse(event.all_day)

    def test_parse_event_text_uses_one_hour_for_start_time_only(self) -> None:
        base = datetime(2026, 5, 18, 9, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        event = parse_event_text("5/20 14:00 会議", base)

        self.assertEqual(event.start.isoformat(timespec="minutes"), "2026-05-20T14:00+09:00")
        self.assertEqual(event.end.isoformat(timespec="minutes"), "2026-05-20T15:00+09:00")
        self.assertEqual(event.duration_minutes, 60)
        self.assertFalse(event.all_day)

    def test_parse_event_text_treats_date_only_input_as_all_day(self) -> None:
        base = datetime(2026, 5, 18, 9, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        event = parse_event_text("明日、東京出張", base)

        self.assertEqual(event.start.isoformat(timespec="minutes"), "2026-05-19T00:00+09:00")
        self.assertEqual(event.duration_minutes, 1440)
        self.assertEqual(event.subject, "東京出張")
        self.assertEqual(event.location, "東京")
        self.assertTrue(event.all_day)

    def test_parse_event_text_does_not_treat_room_number_as_time(self) -> None:
        base = datetime(2026, 5, 18, 9, 0, tzinfo=ZoneInfo("Asia/Tokyo"))

        event = parse_event_text("明日 第2会議室で定例", base)

        self.assertEqual(event.start.isoformat(timespec="minutes"), "2026-05-19T00:00+09:00")
        self.assertEqual(event.subject, "第2会議室で定例")
        self.assertTrue(event.all_day)

    def test_browser_origin_must_match_request_host(self) -> None:
        self.assertTrue(server.is_allowed_browser_origin(None, "127.0.0.1:8765"))
        self.assertTrue(server.is_allowed_browser_origin("http://127.0.0.1:8765", "127.0.0.1:8765"))
        self.assertFalse(server.is_allowed_browser_origin("https://example.com", "127.0.0.1:8765"))
        self.assertFalse(server.is_allowed_browser_origin("null", "127.0.0.1:8765"))
        self.assertFalse(server.is_allowed_browser_origin("http://[::1", "127.0.0.1:8765"))

    def test_add_schedule_saves_outlook_appointment(self) -> None:
        class FakeAppointment:
            def __init__(self) -> None:
                self.saved = False

            def Save(self) -> None:
                self.saved = True

        class FakeOutlook:
            def __init__(self, appointment: FakeAppointment) -> None:
                self.appointment = appointment

            def CreateItem(self, item_type: int) -> FakeAppointment:
                self.item_type = item_type
                return self.appointment

        appointment = FakeAppointment()
        fake_outlook = FakeOutlook(appointment)

        with (
            patch.object(server, "outlook_com_context"),
            patch.object(server, "outlook_application", return_value=fake_outlook),
            patch.object(server, "record_job_run"),
        ):
            result = server.add_schedule({"text": "2026/5/20 15:00から16:30 調整会議"})

        self.assertTrue(result["saved"])
        self.assertTrue(appointment.saved)
        self.assertEqual(fake_outlook.item_type, 1)
        self.assertEqual(appointment.Subject, "調整会議")
        self.assertEqual(appointment.Start, "2026/05/20 15:00:00")
        self.assertEqual(appointment.Duration, 90)

    def test_add_schedule_uses_edited_event_payload(self) -> None:
        class FakeAppointment:
            def Save(self) -> None:
                pass

        class FakeOutlook:
            def __init__(self, appointment: FakeAppointment) -> None:
                self.appointment = appointment

            def CreateItem(self, item_type: int) -> FakeAppointment:
                return self.appointment

        appointment = FakeAppointment()

        with (
            patch.object(server, "outlook_com_context"),
            patch.object(server, "outlook_application", return_value=FakeOutlook(appointment)),
            patch.object(server, "record_job_run"),
        ):
            result = server.add_schedule({
                "text": "今週の水曜日 調整会議",
                "event": {
                    "start": "2026-05-21T10:15",
                    "end": "2026-05-21T11:45",
                    "subject": "編集後会議",
                    "location": "第1会議室",
                    "body": "議題を確認する",
                    "all_day": False,
                    "normalized_text": "今週の水曜日 調整会議",
                },
            })

        self.assertEqual(result["event"]["subject"], "編集後会議")
        self.assertEqual(appointment.Subject, "編集後会議")
        self.assertEqual(appointment.Location, "第1会議室")
        self.assertEqual(appointment.Body, "議題を確認する")
        self.assertEqual(appointment.Start, "2026/05/21 10:15:00")
        self.assertEqual(appointment.Duration, 90)

    def test_outlook_com_context_initializes_and_uninitializes_com(self) -> None:
        calls: list[str] = []
        fake_pythoncom = types.SimpleNamespace(
            CoInitialize=lambda: calls.append("init"),
            CoUninitialize=lambda: calls.append("uninit"),
        )

        with patch.dict(sys.modules, {"pythoncom": fake_pythoncom}):
            with server.outlook_com_context():
                calls.append("body")

        self.assertEqual(calls, ["init", "body", "uninit"])

    def test_refresh_addresses_keeps_missing_old_address_with_zero_count(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            public_csv = tmp / "public" / "send_mail-ranking_tabulator.csv"
            dist_csv = tmp / "dist" / "send_mail-ranking_tabulator.csv"
            db_path = tmp / "backend" / "data" / "app.sqlite3"
            public_csv.parent.mkdir(parents=True)
            dist_csv.parent.mkdir(parents=True)
            with public_csv.open("w", encoding="utf-8", newline="") as fp:
                writer = csv.writer(fp)
                writer.writerow(["名前", "回数"])
                writer.writerow(["旧アドレス", "9"])
                writer.writerow(["継続アドレス", "3"])

            with (
                patch.object(server, "PUBLIC_CSV_PATH", public_csv),
                patch.object(server, "DIST_CSV_PATH", dist_csv),
                patch.object(server, "DB_PATH", db_path),
                patch.object(server, "get_sent_item_recipients", return_value=["継続アドレス", "新アドレス", "新アドレス"]),
            ):
                result = server.refresh_addresses()

            self.assertEqual(result["saved_count"], 3)
            self.assertEqual(result["zero_count"], 1)
            rows = server.read_recipients_csv(public_csv)
            self.assertEqual(rows["旧アドレス"], 0)
            self.assertEqual(rows["継続アドレス"], 1)
            self.assertEqual(rows["新アドレス"], 2)

    def test_refresh_addresses_skips_invalid_old_csv_count(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            public_csv = tmp / "public" / "send_mail-ranking_tabulator.csv"
            dist_csv = tmp / "dist" / "send_mail-ranking_tabulator.csv"
            db_path = tmp / "backend" / "data" / "app.sqlite3"
            public_csv.parent.mkdir(parents=True)
            dist_csv.parent.mkdir(parents=True)
            with public_csv.open("w", encoding="utf-8", newline="") as fp:
                writer = csv.writer(fp)
                writer.writerow(["名前", "回数"])
                writer.writerow(["壊れた旧アドレス", "not-a-number"])
                writer.writerow(["正常な旧アドレス", "3"])

            with (
                patch.object(server, "PUBLIC_CSV_PATH", public_csv),
                patch.object(server, "DIST_CSV_PATH", dist_csv),
                patch.object(server, "DB_PATH", db_path),
                patch.object(server, "get_sent_item_recipients", return_value=["新アドレス"]),
            ):
                result = server.refresh_addresses()

            rows = server.read_recipients_csv(public_csv)
            self.assertEqual(result["saved_count"], 2)
            self.assertNotIn("壊れた旧アドレス", rows)
            self.assertEqual(rows["正常な旧アドレス"], 0)
            self.assertEqual(rows["新アドレス"], 1)

    def test_list_keyword_matches_does_not_mark_history_as_new(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"

            with patch.object(server, "DB_PATH", db_path):
                server.ensure_db()
                server.persist_keyword_matches([
                    server.KeywordMatch(
                        received_time="2026-04-28T10:00:00",
                        subject="職アドからのお知らせ",
                        line="棚卸の通知です",
                        keyword="棚卸",
                        is_new=False,
                    )
                ])

                matches = server.list_keyword_matches()
                new_only_matches = server.list_keyword_matches(new_only=True)

            self.assertEqual(len(matches), 1)
            self.assertFalse(matches[0]["is_new"])
            self.assertEqual(new_only_matches, [])

    def test_list_database_orders_latest_rows_first(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"

            with patch.object(server, "DB_PATH", db_path):
                server.ensure_db()
                with server.db_connection() as conn:
                    conn.execute(
                        "INSERT INTO recipients(name, count, updated_at) VALUES(?, ?, ?)",
                        ("古い宛先", 1, "2026-05-12T00:00:00+00:00"),
                    )
                    conn.execute(
                        "INSERT INTO recipients(name, count, updated_at) VALUES(?, ?, ?)",
                        ("新しい宛先", 2, "2026-05-14T00:00:00+00:00"),
                    )
                    conn.execute(
                        """
                        INSERT INTO keyword_matches(received_time, subject, line, keyword, first_seen_at)
                        VALUES(?, ?, ?, ?, ?)
                        """,
                        ("2026-05-13T00:00:00+09:00", "職アドからのお知らせ", "古い通知", "棚卸", "2026-05-13T00:00:00+00:00"),
                    )
                    conn.execute(
                        """
                        INSERT INTO keyword_matches(received_time, subject, line, keyword, first_seen_at)
                        VALUES(?, ?, ?, ?, ?)
                        """,
                        ("2026-05-14T00:00:00+09:00", "職アドからのお知らせ", "新しい通知", "棚卸", "2026-05-14T00:00:00+00:00"),
                    )
                    conn.commit()

                snapshot = server.list_database()

            self.assertEqual(snapshot["recipients"][0]["name"], "新しい宛先")
            self.assertEqual(snapshot["keyword_matches"][0]["line"], "新しい通知")

    def test_save_and_add_favorites(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"

            with patch.object(server, "DB_PATH", db_path):
                server.ensure_db()
                saved = server.save_favorites({
                    "favorites": [
                        {"name": "開発チーム", "addresses": ["山田 太郎", "佐藤 一郎"]},
                    ],
                })
                added = server.add_favorite({"name": "経理", "addresses": "keiri@example.com; 山田 花子"})
                favorites = server.list_favorites()

            self.assertEqual(saved[0]["name"], "開発チーム")
            self.assertEqual(saved[0]["addresses"], ["山田 太郎", "佐藤 一郎"])
            self.assertEqual(added["name"], "経理")
            self.assertEqual({favorite["name"] for favorite in favorites}, {"開発チーム", "経理"})

    def test_seed_dummy_data_populates_database(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            db_path = tmp / "backend" / "data" / "app.sqlite3"
            public_csv = tmp / "public" / "send_mail-ranking_tabulator.csv"
            dist_csv = tmp / "dist" / "send_mail-ranking_tabulator.csv"
            public_csv.parent.mkdir(parents=True)
            dist_csv.parent.mkdir(parents=True)

            with (
                patch.object(server, "DB_PATH", db_path),
                patch.object(server, "PUBLIC_CSV_PATH", public_csv),
                patch.object(server, "DIST_CSV_PATH", dist_csv),
            ):
                inserted = server.seed_dummy_data()
                snapshot = server.list_database()

            self.assertEqual(inserted["recipients"], 4)
            self.assertGreaterEqual(len(snapshot["keyword_matches"]), 3)
            self.assertEqual(snapshot["job_runs"][0]["status"], "success")

    def test_delete_database_records_removes_selected_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            db_path = tmp / "backend" / "data" / "app.sqlite3"
            public_csv = tmp / "public" / "send_mail-ranking_tabulator.csv"
            dist_csv = tmp / "dist" / "send_mail-ranking_tabulator.csv"
            public_csv.parent.mkdir(parents=True)
            dist_csv.parent.mkdir(parents=True)

            with (
                patch.object(server, "DB_PATH", db_path),
                patch.object(server, "PUBLIC_CSV_PATH", public_csv),
                patch.object(server, "DIST_CSV_PATH", dist_csv),
            ):
                server.ensure_db()
                server.save_recipients([("削除する宛先", 1), ("残す宛先", 2)])
                result = server.delete_database_records("recipients", ["削除する宛先"])
                snapshot = server.list_database()

            self.assertEqual(result["deleted"], 1)
            self.assertEqual([row["name"] for row in snapshot["recipients"]], ["残す宛先"])

    def test_delete_recipient_records_updates_csv_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            db_path = tmp / "backend" / "data" / "app.sqlite3"
            public_csv = tmp / "public" / "send_mail-ranking_tabulator.csv"
            dist_csv = tmp / "dist" / "send_mail-ranking_tabulator.csv"
            public_csv.parent.mkdir(parents=True)
            dist_csv.parent.mkdir(parents=True)

            with (
                patch.object(server, "DB_PATH", db_path),
                patch.object(server, "PUBLIC_CSV_PATH", public_csv),
                patch.object(server, "DIST_CSV_PATH", dist_csv),
            ):
                server.ensure_db()
                server.save_recipients([("削除する宛先", 1), ("残す宛先", 2)])
                server.write_recipients_csv([("残す宛先", 2), ("削除する宛先", 1)])
                server.delete_database_records("recipients", ["削除する宛先"])

                public_rows = server.read_recipients_csv(public_csv)
                dist_rows = server.read_recipients_csv(dist_csv)

            self.assertEqual(public_rows, {"残す宛先": 2})
            self.assertEqual(dist_rows, {"残す宛先": 2})

    def test_delete_database_records_rejects_settings(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"

            with patch.object(server, "DB_PATH", db_path):
                with self.assertRaises(ValueError):
                    server.delete_database_records("settings", ["keywords"])

    def test_run_job_safely_skips_when_same_job_is_running(self) -> None:
        job_name = "refresh_addresses"
        calls: list[str] = []
        lock = server.job_lock(job_name)

        self.assertTrue(lock.acquire(blocking=False))
        try:
            server.run_job_safely(job_name, lambda: calls.append("called"))
        finally:
            lock.release()

        self.assertEqual(calls, [])

    def test_run_job_safely_allows_different_jobs_to_run(self) -> None:
        calls: list[str] = []
        lock = server.job_lock("refresh_addresses")

        self.assertTrue(lock.acquire(blocking=False))
        try:
            server.run_job_safely("check_keywords", lambda: calls.append("called"))
        finally:
            lock.release()

        self.assertEqual(calls, ["called"])

    def test_ensure_db_adds_confirmed_column(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"
            db_path.parent.mkdir(parents=True, exist_ok=True)

            # 古いスキーマ（confirmedなし）でテーブルを作成
            import sqlite3
            conn = sqlite3.connect(db_path)
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
            conn.commit()
            conn.close()

            # ensure_db を呼び出してカラムが追加されるか確認
            with patch.object(server, "DB_PATH", db_path):
                server.ensure_db()
                with server.db_connection() as conn:
                    # confirmed カラムが存在するかチェック
                    cursor = conn.execute("PRAGMA table_info(keyword_matches)")
                    columns = [row[1] for row in cursor.fetchall()]
                    self.assertIn("confirmed", columns)

    def test_list_keyword_matches_unconfirmed_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"

            with patch.object(server, "DB_PATH", db_path):
                server.ensure_db()
                # confirmed=0 (未確認) と confirmed=1 (確認済み) のマッチを追加
                # まず普通に登録 (confirmed=0)
                server.persist_keyword_matches([
                    server.KeywordMatch(
                        received_time="2026-05-18T10:00:00",
                        subject="職アドからのお知らせ",
                        line="未確認の通知です",
                        keyword="棚卸",
                        is_new=False,
                    ),
                    server.KeywordMatch(
                        received_time="2026-05-18T11:00:00",
                        subject="職アドからのお知らせ",
                        line="確認済みの通知です",
                        keyword="棚卸",
                        is_new=False,
                    )
                ])

                # 2つ目のIDを取得して確認済みに更新する
                with server.db_connection() as conn:
                    row = conn.execute("SELECT id FROM keyword_matches WHERE line = '確認済みの通知です'").fetchone()
                    target_id = row[0]
                    # 現在はconfirmedカラムがないため、このテストはここで失敗するはず
                    conn.execute("UPDATE keyword_matches SET confirmed = 1 WHERE id = ?", (target_id,))
                    conn.commit()

                # unconfirmed_only=True で取得
                # 現在はlist_keyword_matchesがunconfirmed_only引数を受け取らないため、ここで例外が発生して失敗するはず
                unconfirmed_matches = server.list_keyword_matches(unconfirmed_only=True)
                self.assertEqual(len(unconfirmed_matches), 1)
                self.assertEqual(unconfirmed_matches[0]["line"], "未確認 of code")

    def test_confirm_keyword_matches(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"

            with patch.object(server, "DB_PATH", db_path):
                server.ensure_db()
                server.persist_keyword_matches([
                    server.KeywordMatch(
                        received_time="2026-05-18T10:00:00",
                        subject="職アドからのお知らせ",
                        line="テスト通知",
                        keyword="棚卸",
                        is_new=False,
                    )
                ])

                # 現在はconfirm_keyword_matches属性がないため、ここで例外が発生して失敗するはず
                with self.assertRaises(AttributeError):
                    server.confirm_keyword_matches([1])


if __name__ == "__main__":
    unittest.main()

