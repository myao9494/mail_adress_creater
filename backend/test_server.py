"""バックエンドの主要な保存処理のテスト。"""
from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import server


class BackendServerTest(unittest.TestCase):
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
