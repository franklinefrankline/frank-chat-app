import json
import os
from pathlib import Path

root_dir = Path(r"c:\Users\inbat\Downloads\frank-chat-app-main\frank-chat-app-main")
i18n_dir = root_dir / "i18n"

en_file = i18n_dir / "en.json"
ta_file = i18n_dir / "ta.json"
hi_file = i18n_dir / "hi.json"

with open(en_file, "r", encoding="utf-8") as f:
    en = json.load(f)
with open(ta_file, "r", encoding="utf-8") as f:
    ta = json.load(f)
with open(hi_file, "r", encoding="utf-8") as f:
    hi = json.load(f)

# Definitions to add/merge
en_updates = {
    "auth": {
        "rememberMe": "Remember me",
        "demoAccounts": "Demo accounts",
        "emailOrUsername": "Email Address or Username"
    },
    "chat": {
        "filterAll": "All",
        "filterUnread": "Unread",
        "filterDirect": "Direct",
        "filterGroups": "Groups",
        "emptyChatTitle": "Select a conversation",
        "emptyChatDesc": "Choose from your existing conversations or start a new one to begin messaging.",
        "emptyConversationsTitle": "No conversations yet",
        "emptyConversationsDesc": "Start a new chat to begin messaging",
        "messageYourselfSub": "Notes & bookmarks",
        "inviteViaLink": "Invite Via Link",
        "starred": "Starred",
        "star": "Star Message",
        "unstar": "Unstar Message",
        "translate": "Translate Message",
        "showOriginal": "Show original",
        "showTranslation": "Show translation",
        "translated": "Translated",
        "translating": "Translating...",
        "translationFailed": "Translation unavailable",
        "autoTranslate": "Auto-Translate Messages",
        "detailsDrawer": "Conversation Details",
        "participants": "Participants",
        "sharedMedia": "Shared Media & Files",
        "securityEncryption": "Security & Encryption",
        "muteNotifications": "Mute Notifications",
        "clearChatHistory": "Clear Chat History",
        "deleteChatConfirm": "Are you sure you want to delete this chat?",
        "voiceMessage": "Voice message",
        "recording": "Recording...",
        "cancelReply": "Cancel reply",
        "cancelEdit": "Cancel edit",
        "saveEdit": "Save edit",
        "lastSeen": "Last seen {time}"
    },
    "smart": {
        "beta": "BETA",
        "targetedBadge": "TARGETED ANALYSIS",
        "fullConversation": "Full Conversation",
        "fullConvBadge": "FULL CONVERSATION ANALYSIS",
        "returnTargeted": "Return to Targeted Analysis",
        "selectedMessage": "Selected Message",
        "selectedDocument": "Selected Document",
        "executiveSummary": "Executive Summary",
        "keyPoints": "Key Points",
        "importantInfo": "Important Information",
        "sourceReferences": "Source References",
        "refresh": "Refresh",
        "analyzingWithGemini": "Analyzing conversation with Gemini...",
        "analyzingMessage": "Analyzing selected message...",
        "analyzingDoc": "Analyzing document...",
        "analyzingBoth": "Analyzing message and document...",
        "assignedTo": "Assigned to",
        "due": "Due",
        "markComplete": "Mark complete",
        "deleteAction": "Delete action",
        "copySummary": "Copy Summary",
        "missed": "Missed",
        "important": "Important",
        "actions": "Actions",
        "decisions": "Decisions",
        "dates": "Dates",
        "files": "Files",
        "insights": "Insights"
    },
    "settings": {
        "languageAndTranslation": "Language & Translation",
        "interfaceLanguage": "Interface Language",
        "interfaceLanguageDesc": "Select the primary display language for the FRANK application interface.",
        "autoTranslateTitle": "Automatic Message Translation",
        "autoTranslateDesc": "Automatically translate incoming messages in chats into your preferred language.",
        "defaultViewTitle": "Default Message View",
        "defaultViewDesc": "Choose whether to display the translated text or original message first.",
        "viewTranslated": "Show Translated Text",
        "viewOriginal": "Show Original Message",
        "enabled": "Enabled",
        "disabled": "Disabled"
    },
    "admin": {
        "groupsChats": "Groups & Chats",
        "adminProfile": "Admin Profile",
        "live": "LIVE",
        "refresh": "Refresh",
        "signOut": "Sign Out",
        "user": "User",
        "email": "Email",
        "role": "Role",
        "joined": "Joined"
    }
}

ta_updates = {
    "auth": {
        "rememberMe": "என்னை நினைவில் கொள்",
        "demoAccounts": "மாதிரி கணக்குகள்",
        "emailOrUsername": "மின்னஞ்சல் அல்லது பயனர்பெயர்"
    },
    "chat": {
        "filterAll": "அனைத்தும்",
        "filterUnread": "படிக்காதவை",
        "filterDirect": "நேரடி",
        "filterGroups": "குழுக்கள்",
        "emptyChatTitle": "ஒரு உரையாடலைத் தேர்வுசெய்க",
        "emptyChatDesc": "ஏற்கனவே உள்ள உரையாடல்களில் இருந்து தேர்வுசெய்யவும் அல்லது புதிய அரட்டையைத் தொடங்கவும்.",
        "emptyConversationsTitle": "உரையாடல்கள் இன்னும் இல்லை",
        "emptyConversationsDesc": "செய்தி அனுப்ப புதிய அரட்டையைத் தொடங்குங்கள்",
        "messageYourselfSub": "குறிப்புகள் மற்றும் புக்மார்க்குகள்",
        "inviteViaLink": "இணைப்பு மூலம் அழைக்கவும்",
        "starred": "நட்சத்திரமிட்டவை",
        "star": "நட்சத்திரமிடு",
        "unstar": "நட்சத்திரத்தை நீக்கு",
        "translate": "செய்தியை மொழிபெயர்",
        "showOriginal": "மூல செய்தியைக் காட்டு",
        "showTranslation": "மொழிபெயர்ப்பைக் காட்டு",
        "translated": "மொழிபெயர்க்கப்பட்டது",
        "translating": "மொழிபெயர்க்கிறது...",
        "translationFailed": "மொழிபெயர்ப்பு கிடைக்கவில்லை",
        "autoTranslate": "செய்திகளை தானாக மொழிபெயர்",
        "detailsDrawer": "உரையாடல் விவரங்கள்",
        "participants": "பங்கேற்பாளர்கள்",
        "sharedMedia": "பகிரப்பட்ட ஊடகம் & கோப்புகள்",
        "securityEncryption": "பாதுகாப்பு & குறியாக்கம்",
        "muteNotifications": "அறிவிப்புகளை முடக்கு",
        "clearChatHistory": "அரட்டை வரலாற்றை அழி",
        "deleteChatConfirm": "இந்த அரட்டையை நிச்சயமாக நீக்க விரும்புகிறீர்களா?",
        "voiceMessage": "குரல் செய்தி",
        "recording": "பதிவாகிறது...",
        "cancelReply": "பதிலை ரத்துசெய்",
        "cancelEdit": "திருத்தத்தை ரத்துசெய்",
        "saveEdit": "மாற்றத்தை சேமி",
        "lastSeen": "கடைசியாகப் பார்த்தது {time}"
    },
    "smart": {
        "beta": "பீட்டா",
        "targetedBadge": "குறிப்பிட்ட பகுப்பாய்வு",
        "fullConversation": "முழு உரையாடல்",
        "fullConvBadge": "முழு உரையாடல் பகுப்பாய்வு",
        "returnTargeted": "குறிப்பிட்ட பகுப்பாய்வுக்கு திரும்பு",
        "selectedMessage": "தேர்ந்தெடுக்கப்பட்ட செய்தி",
        "selectedDocument": "தேர்ந்தெடுக்கப்பட்ட ஆவணம்",
        "executiveSummary": "முதன்மை சுருக்கம்",
        "keyPoints": "முக்கிய குறிப்புகள்",
        "importantInfo": "முக்கியமான தகவல்",
        "sourceReferences": "மூல குறிப்புகள்",
        "refresh": "புதுப்பி",
        "analyzingWithGemini": "ஜெமினியுடன் உரையாடலை பகுப்பாய்வு செய்கிறது...",
        "analyzingMessage": "தேர்ந்தெடுக்கப்பட்ட செய்தியை பகுப்பாய்வு செய்கிறது...",
        "analyzingDoc": "ஆவணத்தை பகுப்பாய்வு செய்கிறது...",
        "analyzingBoth": "செய்தி மற்றும் ஆவணத்தை பகுப்பாய்வு செய்கிறது...",
        "assignedTo": "ஒதுக்கப்பட்டவர்",
        "due": "காலக்கெடு",
        "markComplete": "முடிந்தது என குறி",
        "deleteAction": "செயலை நீக்கு",
        "copySummary": "சுருக்கத்தை நகலெடு",
        "missed": "தவறவிட்டவை",
        "important": "முக்கியமானவை",
        "actions": "செயல்கள்",
        "decisions": "முடிவுகள்",
        "dates": "தேதிகள்",
        "files": "கோப்புகள்",
        "insights": "நுண்ணறிவு"
    },
    "settings": {
        "languageAndTranslation": "மொழி & மொழிபெயர்ப்பு",
        "interfaceLanguage": "பயன்பாட்டு இடைமுக மொழி",
        "interfaceLanguageDesc": "FRANK பயன்பாட்டு இடைமுகத்திற்கான முதன்மை காட்சி மொழியைத் தேர்வுசெய்யவும்.",
        "autoTranslateTitle": "செய்திகளை தானாக மொழிபெயர்த்தல்",
        "autoTranslateDesc": "அரட்டைகளில் வரும் உள்வரும் செய்திகளை உங்கள் விருப்பமான மொழிக்கு தானாகவே மொழிபெயர்க்கவும்.",
        "defaultViewTitle": "இயல்புநிலை செய்தி காட்சி",
        "defaultViewDesc": "மொழிபெயர்க்கப்பட்ட உரையையோ அல்லது மூல செய்தியையோ முதலில் காட்ட வேண்டுமா என்பதைத் தேர்ந்தெடுக்கவும்.",
        "viewTranslated": "மொழிபெயர்க்கப்பட்ட உரையை காட்டு",
        "viewOriginal": "மூல செய்தியை காட்டு",
        "enabled": "இயக்கப்பட்டது",
        "disabled": "முடக்கப்பட்டது"
    },
    "admin": {
        "groupsChats": "குழுக்கள் & அரட்டைகள்",
        "adminProfile": "நிர்வாகி சுயவிவரம்",
        "live": "நேரலை",
        "refresh": "புதுப்பி",
        "signOut": "வெளியேறு",
        "user": "பயனர்",
        "email": "மின்னஞ்சல்",
        "role": "பங்கு",
        "joined": "இணைந்த தேதி"
    }
}

hi_updates = {
    "auth": {
        "rememberMe": "मुझे याद रखें",
        "demoAccounts": "डेमो खाते",
        "emailOrUsername": "ईमेल पता या उपयोगकर्ता नाम"
    },
    "chat": {
        "filterAll": "सभी",
        "filterUnread": "अपठित",
        "filterDirect": "प्रत्यक्ष",
        "filterGroups": "समूह",
        "emptyChatTitle": "एक बातचीत चुनें",
        "emptyChatDesc": "अपनी मौजूदा बातचीत में से चुनें या मैसेजिंग शुरू करने के लिए नई चैट शुरू करें।",
        "emptyConversationsTitle": "अभी कोई बातचीत नहीं है",
        "emptyConversationsDesc": "संदेश भेजना शुरू करने के लिए नई चैट शुरू करें",
        "messageYourselfSub": "नोट्स और बुकमार्क",
        "inviteViaLink": "लिंक द्वारा आमंत्रित करें",
        "starred": "तारांकित",
        "star": "तारांकित करें",
        "unstar": "तारांकित हटाएं",
        "translate": "संदेश का अनुवाद करें",
        "showOriginal": "मूल संदेश देखें",
        "showTranslation": "अनुवाद देखें",
        "translated": "अनुवादित",
        "translating": "अनुवाद हो रहा है...",
        "translationFailed": "अनुवाद अनुपलब्ध",
        "autoTranslate": "संदेशों का स्वतः अनुवाद",
        "detailsDrawer": "बातचीत का विवरण",
        "participants": "प्रतिभागी",
        "sharedMedia": "साझा मीडिया और फ़ाइलें",
        "securityEncryption": "सुरक्षा और एन्क्रिप्शन",
        "muteNotifications": "सूचनाएं म्यूट करें",
        "clearChatHistory": "चैट इतिहास साफ़ करें",
        "deleteChatConfirm": "क्या आप वाकई इस चैट को हटाना चाहते हैं?",
        "voiceMessage": "वॉयस संदेश",
        "recording": "रिकॉर्डिंग हो रही है...",
        "cancelReply": "उत्तर रद्द करें",
        "cancelEdit": "संपादन रद्द करें",
        "saveEdit": "संपादन सहेजें",
        "lastSeen": "अंतिम बार देखा गया {time}"
    },
    "smart": {
        "beta": "बीटा",
        "targetedBadge": "लक्षित विश्लेषण",
        "fullConversation": "पूर्ण वार्तालाप",
        "fullConvBadge": "पूर्ण वार्तालाप विश्लेषण",
        "returnTargeted": "लक्षित विश्लेषण पर वापस जाएं",
        "selectedMessage": "चयनित संदेश",
        "selectedDocument": "चयनित दस्तावेज़",
        "executiveSummary": "कार्यकारी सारांश",
        "keyPoints": "मुख्य बिंदु",
        "importantInfo": "महत्वपूर्ण जानकारी",
        "sourceReferences": "स्रोत संदर्भ",
        "refresh": "ताज़ा करें",
        "analyzingWithGemini": "जेमिनी के साथ बातचीत का विश्लेषण कर रहा है...",
        "analyzingMessage": "चयनित संदेश का विश्लेषण कर रहा है...",
        "analyzingDoc": "दस्तावेज़ का विश्लेषण कर रहा है...",
        "analyzingBoth": "संदेश और दस्तावेज़ का विश्लेषण कर रहा है...",
        "assignedTo": "सौंपा गया",
        "due": "नियत तिथि",
        "markComplete": "पूर्ण चिह्नित करें",
        "deleteAction": "कार्य हटाएं",
        "copySummary": "सारांश कॉपी करें",
        "missed": "छूटे हुए",
        "important": "महत्वपूर्ण",
        "actions": "कार्य",
        "decisions": "निर्णय",
        "dates": "तिथियां",
        "files": "फ़ाइलें",
        "insights": "अंतर्दृष्टि"
    },
    "settings": {
        "languageAndTranslation": "भाषा और अनुवाद",
        "interfaceLanguage": "इंटरफ़ेस भाषा",
        "interfaceLanguageDesc": "FRANK एप्लिकेशन इंटरफ़ेस के लिए प्राथमिक प्रदर्शन भाषा चुनें।",
        "autoTranslateTitle": "स्वचालित संदेश अनुवाद",
        "autoTranslateDesc": "चैट में आने वाले संदेशों को अपनी पसंदीदा भाषा में स्वचालित रूप से अनुवाद करें।",
        "defaultViewTitle": "डिफ़ॉल्ट संदेश दृश्य",
        "defaultViewDesc": "पहले अनुवादित पाठ दिखाना है या मूल संदेश, इसे चुनें।",
        "viewTranslated": "अनुवादित पाठ दिखाएं",
        "viewOriginal": "मूल संदेश दिखाएं",
        "enabled": "सक्षम",
        "disabled": "अक्षम"
    },
    "admin": {
        "groupsChats": "समूह और चैट",
        "adminProfile": "व्यवस्थापक प्रोफ़ाइल",
        "live": "लाइव",
        "refresh": "ताज़ा करें",
        "signOut": "साइन आउट",
        "user": "उपयोगकर्ता",
        "email": "ईमेल",
        "role": "भूमिका",
        "joined": "शामिल हुए"
    }
}

def deep_merge(target, source):
    for k, v in source.items():
        if isinstance(v, dict):
            if k not in target or not isinstance(target[k], dict):
                target[k] = {}
            deep_merge(target[k], v)
        else:
            target[k] = v

deep_merge(en, en_updates)
deep_merge(ta, ta_updates)
deep_merge(hi, hi_updates)

with open(en_file, "w", encoding="utf-8") as f:
    json.dump(en, f, ensure_ascii=False, indent=2)
with open(ta_file, "w", encoding="utf-8") as f:
    json.dump(ta, f, ensure_ascii=False, indent=2)
with open(hi_file, "w", encoding="utf-8") as f:
    json.dump(hi, f, ensure_ascii=False, indent=2)

print("Successfully merged and updated dictionaries!")
