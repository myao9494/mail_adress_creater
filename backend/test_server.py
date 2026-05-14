"""バックエンドの主要な保存処理のテスト。"""
from __future__ import annotations

import csv
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import server


class BackendServerTest(unittest.TestCase):
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
            db_path = Path(tmpdir) / "backend" / "data" / "app.sqlite3"

            with patch.object(server, "DB_PATH", db_path):
                server.ensure_db()
                server.save_recipients([("削除する宛先", 1), ("残す宛先", 2)])
                result = server.delete_database_records("recipients", ["削除する宛先"])
                snapshot = server.list_database()

            self.assertEqual(result["deleted"], 1)
            self.assertEqual([row["name"] for row in snapshot["recipients"]], ["残す宛先"])

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
