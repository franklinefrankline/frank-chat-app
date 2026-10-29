"""
Unit & Integration Tests for Android Share Menu Integration in FRANK Think
Validates:
1. AndroidManifest.xml intent filters (ACTION_SEND & ACTION_SEND_MULTIPLE)
2. Java Native Plugin (FrankShareTargetPlugin) & MainActivity hooks
3. Built debug APK file presence & validity
4. PWA Manifest & share_target configuration
5. Frontend script references & modal styling in CSS
"""

import os
import xml.etree.ElementTree as ET
import json
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
ANDROID_DIR = ROOT_DIR / "android"
MANIFEST_PATH = ANDROID_DIR / "app" / "src" / "main" / "AndroidManifest.xml"
PLUGIN_PATH = ANDROID_DIR / "app" / "src" / "main" / "java" / "app" / "frank" / "think" / "FrankShareTargetPlugin.java"
MAIN_ACTIVITY_PATH = ANDROID_DIR / "app" / "src" / "main" / "java" / "app" / "frank" / "think" / "MainActivity.java"
APK_PATH = ANDROID_DIR / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
PWA_MANIFEST_PATH = ROOT_DIR / "manifest.json"
SHARE_JS_PATH = ROOT_DIR / "js" / "share_target.js"
CSS_PATH = ROOT_DIR / "css" / "chat.css"


def test_android_manifest_intent_filters():
    assert MANIFEST_PATH.exists(), f"Missing AndroidManifest at {MANIFEST_PATH}"

    tree = ET.parse(MANIFEST_PATH)
    root = tree.getroot()
    ns = {"android": "http://schemas.android.com/apk/res/android"}

    app = root.find("application")
    assert app is not None, "Application tag not found in AndroidManifest.xml"

    main_activity = None
    for act in app.findall("activity"):
        name = act.attrib.get(f"{{{ns['android']}}}name")
        if name == ".MainActivity":
            main_activity = act
            break

    assert main_activity is not None, ".MainActivity not found in AndroidManifest.xml"
    assert main_activity.attrib.get(f"{{{ns['android']}}}launchMode") == "singleTask"
    assert main_activity.attrib.get(f"{{{ns['android']}}}exported") == "true"

    # Collect intent filters
    send_mimes = set()
    send_multiple_mimes = set()

    for inf in main_activity.findall("intent-filter"):
        actions = [a.attrib.get(f"{{{ns['android']}}}name") for a in inf.findall("action")]
        categories = [c.attrib.get(f"{{{ns['android']}}}name") for c in inf.findall("category")]
        mimes = [d.attrib.get(f"{{{ns['android']}}}mimeType") for d in inf.findall("data")]

        if "android.intent.action.SEND" in actions:
            assert "android.intent.category.DEFAULT" in categories
            for m in mimes:
                send_mimes.add(m)

        if "android.intent.action.SEND_MULTIPLE" in actions:
            assert "android.intent.category.DEFAULT" in categories
            for m in mimes:
                send_multiple_mimes.add(m)

    # Validate required MIME types
    expected_mimes = {"image/*", "video/*", "audio/*", "application/pdf", "*/*"}
    assert expected_mimes.issubset(send_mimes), f"ACTION_SEND missing mimes: {expected_mimes - send_mimes}"
    assert expected_mimes.issubset(send_multiple_mimes), f"ACTION_SEND_MULTIPLE missing mimes: {expected_mimes - send_multiple_mimes}"


def test_java_plugin_implementation():
    assert PLUGIN_PATH.exists(), f"Missing plugin file at {PLUGIN_PATH}"
    content = PLUGIN_PATH.read_text(encoding="utf-8")

    assert '@CapacitorPlugin(name = "FrankShareTarget")' in content
    assert "public class FrankShareTargetPlugin extends Plugin" in content
    assert "@PluginMethod" in content
    assert "public void getSharedFiles" in content
    assert "public void clearSharedFiles" in content
    assert "handleShareIntent(Context context, Intent intent)" in content
    assert "Intent.ACTION_SEND" in content
    assert "Intent.ACTION_SEND_MULTIPLE" in content
    assert "OpenableColumns.DISPLAY_NAME" in content
    assert "OpenableColumns.SIZE" in content
    assert "shared_incoming" in content
    assert "cleanOldCacheFiles" in content
    assert "dataUrl" in content
    assert "notifyWebViewIfPending" in content


def test_main_activity_hooks():
    assert MAIN_ACTIVITY_PATH.exists(), f"Missing MainActivity at {MAIN_ACTIVITY_PATH}"
    content = MAIN_ACTIVITY_PATH.read_text(encoding="utf-8")

    assert "registerPlugin(FrankShareTargetPlugin.class)" in content
    assert "FrankShareTargetPlugin.handleShareIntent(this, getIntent())" in content
    assert "onNewIntent(Intent intent)" in content
    assert "FrankShareTargetPlugin.handleShareIntent(this, intent)" in content
    assert "FrankShareTargetPlugin.notifyWebViewIfPending" in content


def test_pwa_manifest_share_target():
    assert PWA_MANIFEST_PATH.exists(), f"Missing PWA manifest at {PWA_MANIFEST_PATH}"
    data = json.loads(PWA_MANIFEST_PATH.read_text(encoding="utf-8"))

    assert data.get("name") == "FRANK Think"
    share_target = data.get("share_target")
    assert share_target is not None, "share_target missing from manifest.json"
    assert share_target.get("action") == "/dashboard.html"
    params = share_target.get("params", {})
    assert "files" in params
    assert any("image/*" in f.get("accept", []) for f in params["files"])


def test_frontend_references():
    assert SHARE_JS_PATH.exists(), f"Missing js/share_target.js at {SHARE_JS_PATH}"
    js_content = SHARE_JS_PATH.read_text(encoding="utf-8")

    assert "window.frankShareTarget" in js_content
    assert "frank:filesShared" in js_content
    assert "sessionStorage.getItem('frank_pending_share')" in js_content
    assert "ensureModalInDom" in js_content
    assert "selectRecipient" in js_content
    assert "api.uploadFile" in js_content

    # Check html inclusions
    for fname in ["dashboard.html", "login.html", "index.html"]:
        html_file = ROOT_DIR / fname
        assert html_file.exists()
        txt = html_file.read_text(encoding="utf-8")
        assert 'src="js/share_target.js"' in txt, f"{fname} missing js/share_target.js script tag"
        assert 'href="manifest.json"' in txt, f"{fname} missing manifest.json link tag"


def test_css_styling():
    assert CSS_PATH.exists()
    css_content = CSS_PATH.read_text(encoding="utf-8")

    assert ".share-modal-card" in css_content
    assert ".share-preview-section" in css_content
    assert ".share-preview-card" in css_content
    assert ".share-conversation-item" in css_content
    assert ".share-progress-container" in css_content


def test_output_apk_exists():
    assert APK_PATH.exists(), f"APK does not exist at {APK_PATH}"
    size = APK_PATH.stat().st_size
    assert size > 5 * 1024 * 1024, f"APK file is unexpectedly small: {size} bytes"

