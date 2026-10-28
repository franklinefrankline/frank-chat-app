"""
Update js/i18n.js to add nav.downloadApp for en, ta, and hi.
"""

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
I18N_PATH = ROOT_DIR / "js" / "i18n.js"

def update_i18n():
    with open(I18N_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # EN
    target_en = '                        "selectLanguage": "Select Language"'
    repl_en = '                        "selectLanguage": "Select Language",\n                        "downloadApp": "Download App"'
    assert target_en in content, "target_en not found"
    content = content.replace(target_en, repl_en, 1)

    # TA
    target_ta = '                        "selectLanguage": "மொழியைத் தேர்வுசெய்"'
    repl_ta = '                        "selectLanguage": "மொழியைத் தேர்வுசெய்",\n                        "downloadApp": "செயலியைப் பதிவிறக்கு"'
    assert target_ta in content, "target_ta not found"
    content = content.replace(target_ta, repl_ta, 1)

    # HI
    target_hi = '                        "selectLanguage": "भाषा चुनें"'
    repl_hi = '                        "selectLanguage": "भाषा चुनें",\n                        "downloadApp": "ऐप डाउनलोड करें"'
    assert target_hi in content, "target_hi not found"
    content = content.replace(target_hi, repl_hi, 1)

    with open(I18N_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print("Successfully updated js/i18n.js with nav.downloadApp for en, ta, and hi!")

if __name__ == "__main__":
    update_i18n()
