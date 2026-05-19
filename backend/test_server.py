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


if __name__ == "__main__":
    unittest.main()
