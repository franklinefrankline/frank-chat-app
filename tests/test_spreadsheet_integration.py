import unittest
import urllib.request
import urllib.error
import json
import uuid
import re
import sys
from pathlib import Path

# Add backend directory to sys.path so we can import create_access_token
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from security import create_access_token

BASE_URL = "http://127.0.0.1:8000"

def make_request(url, method="GET", headers=None, data=None):
    if headers is None:
        headers = {}
    req_data = None
    if data is not None:
        req_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.status, body.decode(charset, errors="ignore"), resp.headers
    except urllib.error.HTTPError as e:
        body = e.read()
        charset = e.headers.get_content_charset() or "utf-8"
        return e.code, body.decode(charset, errors="ignore"), e.headers

class TestSpreadsheetIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # User 1 (Admin / Default User)
        cls.token1 = create_access_token({"sub": "frankline30999112@gmail.com", "id": 1, "email": "frankline30999112@gmail.com"})
        # User 2 (Separate User for Isolation Testing)
        cls.token2 = create_access_token({"sub": "userf08ce5", "id": 2, "email": "user_f08ce5@frank-test.com"})

    def test_01_static_routes_and_navigation(self):
        """Test spreadsheet pages, navigation link in dashboard, and assets."""
        # 1. Spreadsheet HTML
        status, body, _ = make_request(f"{BASE_URL}/spreadsheet.html")
        self.assertEqual(status, 200)
        self.assertIn("FRANK Think Sheets", body)
        self.assertIn('id="root"', body)

        # 2. Spreadsheet route alias
        status_alias, body_alias, _ = make_request(f"{BASE_URL}/spreadsheet")
        self.assertEqual(status_alias, 200)
        self.assertIn("FRANK Think Sheets", body_alias)

        # 3. Dashboard navigation entry
        dash_status, dash_body, _ = make_request(f"{BASE_URL}/dashboard.html")
        self.assertEqual(dash_status, 200)
        self.assertIn('id="navSpreadsheetLink"', dash_body)
        self.assertIn("Excel / Spreadsheet", dash_body)

        # 4. Built assets check
        script_match = re.search(r'src="(/assets/[^"]+\.js)"', body)
        self.assertIsNotNone(script_match, "JavaScript bundle reference not found in spreadsheet.html")
        js_url = f"{BASE_URL}{script_match.group(1)}"
        js_status, js_body, _ = make_request(js_url)
        self.assertEqual(js_status, 200, f"Asset JS failed to load: {js_url}")
        self.assertGreater(len(js_body), 1000)

        css_match = re.search(r'href="(/assets/[^"]+\.css)"', body)
        self.assertIsNotNone(css_match, "CSS bundle reference not found in spreadsheet.html")
        css_url = f"{BASE_URL}{css_match.group(1)}"
        css_status, css_body, _ = make_request(css_url)
        self.assertEqual(css_status, 200, f"Asset CSS failed to load: {css_url}")
        self.assertGreater(len(css_body), 500)

    def test_02_authentication_enforcement(self):
        """Test unauthenticated calls to /api/spreadsheets are rejected with 401."""
        status_get, _, _ = make_request(f"{BASE_URL}/api/spreadsheets")
        self.assertEqual(status_get, 401)

        status_post, _, _ = make_request(f"{BASE_URL}/api/spreadsheets", method="POST", data={"id": "wb-test", "title": "Test"})
        self.assertEqual(status_post, 401)

    def test_03_spreadsheet_crud_and_user_isolation(self):
        """Test full CRUD and cross-user data isolation."""
        self.assertIsNotNone(self.token1)
        self.assertIsNotNone(self.token2)

        headers1 = {"Authorization": f"Bearer {self.token1}"}
        headers2 = {"Authorization": f"Bearer {self.token2}"}

        # 1. User 1 saves a workbook
        wb_id = f"wb-test-{uuid.uuid4().hex[:8]}"
        workbook_data = {
            "id": wb_id,
            "title": "Quarterly Budget 2026",
            "activeSheetId": "sheet-1",
            "sheets": [
                {
                    "id": "sheet-1",
                    "name": "Q1 Revenue",
                    "rowCount": 50,
                    "colCount": 10,
                    "cells": {
                        "A1": {"raw": "Revenue", "style": {"bold": True}},
                        "B1": {"raw": "50000", "computed": 50000},
                        "A2": {"raw": "Expenses", "style": {"bold": True}},
                        "B2": {"raw": "30000", "computed": 30000},
                        "A3": {"raw": "Net Profit", "style": {"bold": True}},
                        "B3": {"raw": "=B1-B2", "computed": 20000}
                    },
                    "rowHeights": {},
                    "colWidths": {"1": 150, "2": 120}
                }
            ],
            "createdAt": "2026-10-28T00:00:00Z",
            "updatedAt": "2026-10-28T00:00:00Z"
        }

        save_status, save_body, _ = make_request(f"{BASE_URL}/api/spreadsheets", method="POST", headers=headers1, data=workbook_data)
        self.assertEqual(save_status, 200)
        save_json = json.loads(save_body)
        self.assertTrue(save_json.get("success"))
        self.assertEqual(save_json.get("id"), wb_id)

        # 2. User 1 lists spreadsheets - should find wb_id
        list_status, list_body, _ = make_request(f"{BASE_URL}/api/spreadsheets", headers=headers1)
        self.assertEqual(list_status, 200)
        sheets1 = json.loads(list_body).get("spreadsheets", [])
        found1 = [s for s in sheets1 if s["id"] == wb_id]
        self.assertEqual(len(found1), 1)
        self.assertEqual(found1[0]["title"], "Quarterly Budget 2026")

        # 3. User 1 loads the workbook
        get_status, get_body, _ = make_request(f"{BASE_URL}/api/spreadsheets/{wb_id}", headers=headers1)
        self.assertEqual(get_status, 200)
        wb_loaded = json.loads(get_body).get("workbook")
        self.assertEqual(wb_loaded["id"], wb_id)
        self.assertEqual(wb_loaded["sheets"][0]["cells"]["B3"]["raw"], "=B1-B2")

        # 4. User 1 renames the workbook
        rename_status, rename_body, _ = make_request(
            f"{BASE_URL}/api/spreadsheets/{wb_id}/title",
            method="PATCH",
            headers=headers1,
            data={"title": "Updated Budget 2026"}
        )
        self.assertEqual(rename_status, 200)
        self.assertTrue(json.loads(rename_body).get("success"))

        # Verify rename
        _, get1_renamed_body, _ = make_request(f"{BASE_URL}/api/spreadsheets/{wb_id}", headers=headers1)
        self.assertEqual(json.loads(get1_renamed_body)["workbook"]["title"], "Updated Budget 2026")

        # 5. USER ISOLATION: User 2 cannot list User 1's spreadsheet
        list2_status, list2_body, _ = make_request(f"{BASE_URL}/api/spreadsheets", headers=headers2)
        self.assertEqual(list2_status, 200)
        sheets2 = json.loads(list2_body).get("spreadsheets", [])
        found2 = [s for s in sheets2 if s["id"] == wb_id]
        self.assertEqual(len(found2), 0, "Security violation: User 2 should NOT see User 1's spreadsheet in list")

        # 6. USER ISOLATION: User 2 cannot access User 1's spreadsheet by ID
        get2_status, _, _ = make_request(f"{BASE_URL}/api/spreadsheets/{wb_id}", headers=headers2)
        self.assertEqual(get2_status, 404, "Security violation: User 2 should receive 404 for User 1's spreadsheet")

        # 7. USER ISOLATION: User 2 cannot rename User 1's spreadsheet
        rename2_status, _, _ = make_request(
            f"{BASE_URL}/api/spreadsheets/{wb_id}/title",
            method="PATCH",
            headers=headers2,
            data={"title": "Hacked Title"}
        )
        self.assertIn(rename2_status, (403, 404), "Security violation: User 2 should receive 403 or 404 attempting to rename")

        # 8. USER ISOLATION: User 2 cannot delete User 1's spreadsheet
        del2_status, _, _ = make_request(f"{BASE_URL}/api/spreadsheets/{wb_id}", method="DELETE", headers=headers2)
        self.assertIn(del2_status, (403, 404), "Security violation: User 2 should receive 403 or 404 attempting to delete")

        # 9. User 1 deletes their own spreadsheet
        del1_status, del1_body, _ = make_request(f"{BASE_URL}/api/spreadsheets/{wb_id}", method="DELETE", headers=headers1)
        self.assertEqual(del1_status, 200)
        self.assertTrue(json.loads(del1_body).get("success"))

        # Verify deletion
        get1_after_del_status, _, _ = make_request(f"{BASE_URL}/api/spreadsheets/{wb_id}", headers=headers1)
        self.assertEqual(get1_after_del_status, 404)

    def test_04_seeded_workbooks_availability(self):
        """Test that the 5 seeded workbooks from EXCELL project are available for user 1."""
        headers1 = {"Authorization": f"Bearer {self.token1}"}
        list_status, list_body, _ = make_request(f"{BASE_URL}/api/spreadsheets", headers=headers1)
        self.assertEqual(list_status, 200)
        sheets = json.loads(list_body).get("spreadsheets", [])
        self.assertGreaterEqual(len(sheets), 1, "Expected at least 1 workbook for user 1")
        # Check titles
        titles = [s["title"] for s in sheets]
        print(f"Available seeded workbooks for admin: {titles}")

if __name__ == '__main__':
    unittest.main()
