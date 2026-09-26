/* -------------------------------------------------------------------------
   FRANK MULTI-LANGUAGE (i18n) SYSTEM
   Professional internationalization engine for FRANK.
   Supports English (en), Tamil (ta), and Hindi (hi).
   - Instant in-memory translations (0 network latency, zero flash)
   - Fallback hierarchy: Active Lang -> English -> Safe Humanized Label
   - No page reload, zero state loss, theme-compatible
   - Accessible keyboard-controlled dropdown
   - Guest localStorage persistence & Authenticated user database persistence
   - Intl.DateTimeFormat & Intl.NumberFormat localization
   ------------------------------------------------------------------------- */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.i18n = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STORAGE_KEY = 'frank_lang';
    const LEGACY_KEY = 'chatapp_lang';

    const LANGUAGES = {
        en: {
            code: 'en',
            label: 'English',
            dir: 'ltr',
            locale: 'en-US'
        },
        ta: {
            code: 'ta',
            label: 'தமிழ்',
            dir: 'ltr',
            locale: 'ta-IN'
        },
        hi: {
            code: 'hi',
            label: 'हिन्दी',
            dir: 'ltr',
            locale: 'hi-IN'
        }
    };

    const TRANSLATIONS = {
        en: {
    "nav": {
        "features": "Features",
        "security": "Security",
        "experience": "Experience",
        "about": "About",
        "signIn": "Sign In",
        "startChatting": "Start Chatting",
        "language": "Language",
        "selectLanguage": "Select Language"
    },
    "hero": {
        "badge": "Think",
        "title": "Communication, Reimagined.",
        "subtitle": "Chat, connect and collaborate with people in a secure, beautifully designed messaging experience.",
        "startChatting": "Start Chatting",
        "exploreFeatures": "Explore Features",
        "webClient": "FRANK Web Client",
        "liveDemo": "Live Demo",
        "activeNow": "Active Now",
        "typing": "Typing...",
        "demoMsg1": "Could you send over the updated design assets?",
        "demoMsg2": "Sending them right now! 📦",
        "demoMsg3": "Received! The new glassmorphic theme looks stunning.",
        "inputPlaceholder": "Type a message..."
    },
    "stats": {
        "latencyValue": "< 50ms",
        "latencyLabel": "WebSocket Latency",
        "uptimeValue": "99.99%",
        "uptimeLabel": "Engineered Uptime",
        "tokensValue": "256-bit",
        "tokensLabel": "Cryptographic Tokens"
    },
    "features": {
        "sectionLabel": "ENTERPRISE CAPABILITIES",
        "title": "Everything you need for effortless communication",
        "subtitle": "Designed from the ground up for high reliability, zero latency, and seamless interaction across all your devices.",
        "realTimeTitle": "Real-Time Messaging",
        "realTimeDesc": "Sub-millisecond WebSocket data dispatch ensures instantaneous message delivery and updates without page refreshes.",
        "secureTitle": "Secure Authentication",
        "secureDesc": "Cryptographically hashed credentials with PBKDF2 and HMAC-SHA256 JWT tokens safeguarding each API and socket request.",
        "groupsTitle": "Group Conversations",
        "groupsDesc": "Organize discussions into focused groups with multi-member broadcasting, administrative controls, and activity tracking.",
        "presenceTitle": "Live Online Presence",
        "presenceDesc": "Real-time presence engine updates online/away statuses and interactive typing indicators across all active users.",
        "searchTitle": "Smart Search",
        "searchDesc": "Find past conversations, direct contacts, and team members with client-side debounced search indexing.",
        "themeTitle": "Tailored Dark Theme",
        "themeDesc": "Designed with bespoke dark mode tokens for comfortable night-time communication without jarring high-contrast glare."
    },
    "security": {
        "sectionLabel": "ENTERPRISE ARCHITECTURE",
        "title": "Private conversations. Protected by design.",
        "subtitle": "FRANK is built on authoritative server-side validation, secure token handshakes, and strict data isolation to ensure confidentiality and integrity.",
        "hashing": "PBKDF2 Password Hashing",
        "jwt": "JWT Bearer Authorization",
        "websocket": "WebSocket Token Auth",
        "cors": "Strict CORS & Security Headers",
        "sql": "SQL Injection Immunity",
        "xss": "XSS-Safe DOM Rendering",
        "protectedTitle": "Protected Environment",
        "protectedDesc": "Every request is authenticated through signed headers, preventing impersonation or unauthorized message snooping."
    },
    "cta": {
        "title": "Ready to experience seamless communication?",
        "subtitle": "Join thousands of modern communicators today on FRANK. Set up your account in 30 seconds with no credit card required.",
        "button": "Get Started with FRANK →"
    },
    "footer": {
        "copyright": "© 2026 FRANK. All rights reserved.",
        "think": "Think",
        "privacy": "Privacy Policy",
        "terms": "Terms of Service",
        "contact": "Contact Support"
    },
    "auth": {
        "signIn": "Sign In",
        "welcomeBack": "Welcome Back",
        "welcomeBackSubtitle": "Enter your credentials to access your FRANK account",
        "createAccount": "Create an Account",
        "createAccountSubtitle": "Join FRANK for secure real-time messaging",
        "email": "Email Address",
        "emailPlaceholder": "name@example.com",
        "username": "Username",
        "usernamePlaceholder": "Choose a username",
        "fullName": "Full Name",
        "fullNamePlaceholder": "Enter your full name",
        "password": "Password",
        "passwordPlaceholder": "Enter your password",
        "confirmPassword": "Confirm Password",
        "confirmPasswordPlaceholder": "Re-enter your password",
        "forgotPassword": "Forgot your password?",
        "resetPassword": "Reset Password",
        "sendRecoveryLink": "Send Reset Link",
        "backToLogin": "Back to Sign In",
        "agreeTerms": "I agree to the Terms of Service & Privacy Policy",
        "alreadyHaveAccount": "Already have an account? Sign In",
        "dontHaveAccount": "Don't have an account? Create one",
        "loginSuccess": "Logged in successfully!",
        "registerSuccess": "Account created successfully!",
        "loggingIn": "Signing in...",
        "registering": "Creating account...",
        "invalidCredentials": "Invalid email/username or password",
        "passwordsDoNotMatch": "Passwords do not match",
        "accountDisabled": "This account is disabled. Contact your administrator."
    },
    "chat": {
        "chats": "Chats",
        "groups": "Groups",
        "contacts": "Contacts",
        "favorites": "Favorites",
        "archive": "Archive",
        "searchPlaceholder": "Search conversations, users, or FRANK ID...",
        "newChat": "New Chat",
        "newGroup": "New Group",
        "messageYourself": "Message Yourself",
        "online": "Online",
        "offline": "Offline",
        "typing": "typing...",
        "activeNow": "Active Now",
        "typeMessage": "Type a message...",
        "send": "Send",
        "reply": "Reply",
        "copy": "Copy",
        "copied": "Copied",
        "edit": "Edit",
        "delete": "Delete",
        "edited": "edited",
        "pin": "Pin Conversation",
        "unpin": "Unpin Conversation",
        "mute": "Mute Notifications",
        "unmute": "Unmute Notifications",
        "favorite": "Favorite",
        "unfavorite": "Remove Favorite",
        "clearChat": "Clear Messages",
        "leaveGroup": "Leave Group",
        "addMembers": "Add Members",
        "groupInfo": "Group Details",
        "chatInfo": "Conversation Details",
        "noMessages": "No messages yet. Send a message to start the conversation!",
        "noConversations": "No conversations yet. Start a new chat!",
        "userNotFound": "User not found",
        "uploadFile": "Upload File",
        "voiceNote": "Voice Note",
        "connecting": "Connecting...",
        "connected": "Connected",
        "download": "Download",
        "view": "View",
        "unreadCount": "{count} unread messages"
    },
    "messages": {
        "unread": "{count} unread messages"
    },
    "settings": {
        "title": "Settings",
        "profile": "Profile",
        "account": "Account",
        "appearance": "Appearance",
        "language": "Language",
        "selectLanguage": "Select Interface Language",
        "theme": "Theme",
        "themeMonochrome": "Monochrome (Dark)",
        "themeSandstone": "Sandstone (Warm Light)",
        "notifications": "Notifications",
        "privacy": "Privacy & Security",
        "saveChanges": "Save Changes",
        "savedSuccessfully": "Settings saved successfully",
        "frankId": "Your permanent FRANK ID",
        "copyFrankId": "Copy FRANK ID",
        "logout": "Log Out"
    },
    "admin": {
        "title": "Admin Portal",
        "metrics": "Overview & Metrics",
        "totalUsers": "Total Users",
        "activeAccounts": "Active Accounts",
        "disabledAccounts": "Disabled Accounts",
        "verifiedEmails": "Verified Emails",
        "totalMessages": "Total Messages",
        "userManagement": "User Management",
        "searchUsers": "Search by name, email or FRANK ID...",
        "actions": "Actions",
        "status": "Status",
        "active": "Active",
        "disabled": "Disabled",
        "disableUser": "Disable Account",
        "enableUser": "Enable Account",
        "wipeData": "Wipe User Data",
        "deleteAccount": "Delete Account",
        "confirmDelete": "Confirm Account Deletion",
        "auditLogs": "Audit Logs",
        "announcements": "System Announcements",
        "broadcast": "Broadcast Announcement"
    },
    "common": {
        "cancel": "Cancel",
        "confirm": "Confirm",
        "close": "Close",
        "loading": "Loading...",
        "save": "Save",
        "delete": "Delete",
        "error": "Error",
        "success": "Success",
        "retry": "Try Again",
        "back": "Back",
        "next": "Next",
        "yes": "Yes",
        "no": "No"
    }
},
        ta: {
    "nav": {
        "features": "அம்சங்கள்",
        "security": "பாதுகாப்பு",
        "experience": "அனுபவம்",
        "about": "எங்களை பற்றி",
        "signIn": "உள்நுழை",
        "startChatting": "அரட்டையை தொடங்கு",
        "language": "மொழி",
        "selectLanguage": "மொழியைத் தேர்வுசெய்"
    },
    "hero": {
        "badge": "சிந்தி",
        "title": "தகவல்தொடர்பு, புதிய வடிவில்.",
        "subtitle": "பாதுகாப்பான, நேர்த்தியான சூழலில் மக்களுடன் அரட்டையடித்து, இணைந்து பணியாற்றுங்கள்.",
        "startChatting": "அரட்டையை தொடங்கு",
        "exploreFeatures": "அம்சங்களை காண்க",
        "webClient": "FRANK வலை தளம்",
        "liveDemo": "நேரலை மாதிரி",
        "activeNow": "ஆன்லைனில்",
        "typing": "தட்டச்சு செய்கிறார்...",
        "demoMsg1": "புதுப்பிக்கப்பட்ட வடிவமைப்பு ஆவணங்களை அனுப்ப முடியுமா?",
        "demoMsg2": "இப்போதே அனுப்புகிறேன்! 📦",
        "demoMsg3": "கிடைத்துவிட்டது! புதிய தீம் மிக அழகாக இருக்கிறது.",
        "inputPlaceholder": "செய்தியை தட்டச்சு செய்க..."
    },
    "stats": {
        "latencyValue": "< 50மி.வி",
        "latencyLabel": "வலைசாக்கெட் தாமதம்",
        "uptimeValue": "99.99%",
        "uptimeLabel": "இயக்க நேரம்",
        "tokensValue": "256-பிட்",
        "tokensLabel": "குறியாக்க டோக்கன்கள்"
    },
    "features": {
        "sectionLabel": "நிறுவன திறன்கள்",
        "title": "சிரமமற்ற தகவல்தொடர்புக்கு தேவையான அனைத்தும்",
        "subtitle": "அதிவேகம், பூஜ்ஜிய தாமதம் மற்றும் அனைத்து சாதனங்களிலும் தடையற்ற பயன்பாட்டிற்காக வடிவமைக்கப்பட்டது.",
        "realTimeTitle": "நிகழ்நேர செய்தி பரிமாற்றம்",
        "realTimeDesc": "பக்கத்தைப் புதுப்பிக்காமல் உடனடி செய்தி பரிமாற்றத்தை உறுதி செய்யும் மில்லிசெகண்ட் வேக வலைசாக்கெட் கட்டமைப்பு.",
        "secureTitle": "பாதுகாப்பான அங்கீகாரம்",
        "secureDesc": "PBKDF2 மற்றும் HMAC-SHA256 JWT டோக்கன்களால் பாதுகாக்கப்பட்ட தரவுப் பாதுகாப்பு.",
        "groupsTitle": "குழு உரையாடல்கள்",
        "groupsDesc": "குழுக்களை அமைத்து நிர்வாக கட்டுப்பாடுகளுடன் பலருடன் உடனடியாக விவாதிக்கலாம்.",
        "presenceTitle": "நிகழ்நேர இருப்பு",
        "presenceDesc": "பயனர்களின் ஆன்லைன்/ஆஃப்லைன் நிலை மற்றும் தட்டச்சு குறிகாட்டிகளை உடனடியாக காட்டும் இருப்பு முறைமை.",
        "searchTitle": "நுண்ணிய தேடல்",
        "searchDesc": "பழைய உரையாடல்கள், தொடர்புகள் மற்றும் குழு உறுப்பினர்களை எளிதில் கண்டறியும் தேடல் குறியீடு.",
        "themeTitle": "பிரத்யேக டார்க் தீம்",
        "themeDesc": "இரவு நேர பயன்பாட்டிற்கு கண்களை உறுத்தாத பிரத்யேக வண்ணமைப்பு."
    },
    "security": {
        "sectionLabel": "நிறுவன பாதுகாப்பு கட்டமைப்பு",
        "title": "தனிப்பட்ட உரையாடல்கள். பாதுகாப்பான வடிவமைப்பு.",
        "subtitle": "FRANK கடுமையான சேவையக சரிபார்ப்பு மற்றும் தரவு தனிமைப்படுத்தலுடன் நம்பகத்தன்மையை உறுதி செய்கிறது.",
        "hashing": "PBKDF2 கடவுச்சொல் குறியாக்கம்",
        "jwt": "JWT அங்கீகாரம்",
        "websocket": "வலைசாக்கெட் டோக்கன் பாதுகாப்பு",
        "cors": "கடுமையான CORS மற்றும் பாதுகாப்பு தலைப்புகள்",
        "sql": "SQL ஊடுருவல் தடுப்பு",
        "xss": "XSS-பாதுகாப்பான DOM வடிவமைப்பு",
        "protectedTitle": "பாதுகாக்கப்பட்ட சூழல்",
        "protectedDesc": "ஒவ்வொரு கோரிக்கையும் கையொப்பமிடப்பட்ட தலைப்புகள் மூலம் அங்கீகரிக்கப்பட்டு பாதுகாக்கப்படுகிறது."
    },
    "cta": {
        "title": "தடையற்ற தகவல்தொடர்பை அனுபவிக்க தயாரா?",
        "subtitle": "இன்றே ஆயிரக்கணக்கான பயனர்களுடன் FRANK-ல் இணையுங்கள். 30 நொடிகளில் உங்கள் கணக்கை தொடங்குங்கள்.",
        "button": "FRANK-ல் தொடங்குங்கள் →"
    },
    "footer": {
        "copyright": "© 2026 FRANK. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.",
        "think": "சிந்தி",
        "privacy": "தனியுரிமைக் கொள்கை",
        "terms": "சேவை விதிமுறைகள்",
        "contact": "ஆதரவு தொடர்பு"
    },
    "auth": {
        "signIn": "உள்நுழை",
        "welcomeBack": "மீண்டும் வருக",
        "welcomeBackSubtitle": "உங்கள் FRANK கணக்கில் உள்நுழைய விவரங்களை உள்ளிடவும்",
        "createAccount": "கணக்கு உருவாக்கவும்",
        "createAccountSubtitle": "பாதுகாப்பான நிகழ்நேர அரட்டைக்கு FRANK-ல் இணையுங்கள்",
        "email": "மின்னஞ்சல் முகவரி",
        "emailPlaceholder": "பெயர்@example.com",
        "username": "பயனர்பெயர்",
        "usernamePlaceholder": "பயனர்பெயரை தேர்வுசெய்யவும்",
        "fullName": "முழு பெயர்",
        "fullNamePlaceholder": "உங்கள் முழு பெயரை உள்ளிடவும்",
        "password": "கடவுச்சொல்",
        "passwordPlaceholder": "கடவுச்சொல்லை உள்ளிடவும்",
        "confirmPassword": "கடவுச்சொல்லை உறுதிப்படுத்தவும்",
        "confirmPasswordPlaceholder": "கடவுச்சொல்லை மீண்டும் உள்ளிடவும்",
        "forgotPassword": "கடவுச்சொல் மறந்துவிட்டதா?",
        "resetPassword": "கடவுச்சொல்லை மீட்டமை",
        "sendRecoveryLink": "மீட்டமைப்பு இணைப்பை அனுப்பு",
        "backToLogin": "உள்நுழைவுக்கு திரும்பு",
        "agreeTerms": "சேவை விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கையை ஏற்கிறேன்",
        "alreadyHaveAccount": "ஏற்கனவே கணக்கு உள்ளதா? உள்நுழையவும்",
        "dontHaveAccount": "கணக்கு இல்லையா? புதிய கணக்கு தொடங்கவும்",
        "loginSuccess": "வெற்றிகரமாக உள்நுழைந்தீர்கள்!",
        "registerSuccess": "கணக்கு வெற்றிகரமாக உருவாக்கப்பட்டது!",
        "loggingIn": "உள்நுழைகிறது...",
        "registering": "கணக்கு உருவாக்கப்படுகிறது...",
        "invalidCredentials": "தவறான மின்னஞ்சல் அல்லது கடவுச்சொல்",
        "passwordsDoNotMatch": "கடவுச்சொற்கள் பொருந்தவில்லை",
        "accountDisabled": "இந்த கணக்கு முடக்கப்பட்டுள்ளது. நிர்வாகியை தொடர்பு கொள்ளவும்."
    },
    "chat": {
        "chats": "அரட்டைகள்",
        "groups": "குழுக்கள்",
        "contacts": "தொடர்புகள்",
        "favorites": "விருப்பமானவை",
        "archive": "காப்பகம்",
        "searchPlaceholder": "உரையாடல்கள், பயனர்கள் அல்லது FRANK ID தேடுங்கள்...",
        "newChat": "புதிய அரட்டை",
        "newGroup": "புதிய குழு",
        "messageYourself": "உங்களுக்கே செய்தி அனுப்புங்கள்",
        "online": "ஆன்லைனில்",
        "offline": "ஆஃப்லைனில்",
        "typing": "தட்டச்சு செய்கிறார்...",
        "activeNow": "ஆன்லைனில்",
        "typeMessage": "செய்தியை தட்டச்சு செய்க...",
        "send": "அனுப்பு",
        "reply": "பதிலளி",
        "copy": "நகலெடு",
        "copied": "நகலெடுக்கப்பட்டது",
        "edit": "திருத்து",
        "delete": "நீக்கு",
        "edited": "திருத்தப்பட்டது",
        "pin": "அரட்டையை பின் செய்",
        "unpin": "பின்னை நீக்கு",
        "mute": "அறிவிப்பை முடக்கு",
        "unmute": "அறிவிப்பை இயக்கு",
        "favorite": "விருப்பத்தில் சேர்",
        "unfavorite": "விருப்பத்திலிருந்து நீக்கு",
        "clearChat": "செய்திகளை அழி",
        "leaveGroup": "குழுவிலிருந்து வெளியேறு",
        "addMembers": "உறுப்பினர்களைச் சேர்",
        "groupInfo": "குழு விவரங்கள்",
        "chatInfo": "அரட்டை விவரங்கள்",
        "noMessages": "செய்திகள் எதுவும் இல்லை. அரட்டையைத் தொடங்க செய்தியை அனுப்புங்கள்!",
        "noConversations": "உரையாடல்கள் எதுவும் இல்லை. புதிய அரட்டையை தொடங்குங்கள்!",
        "userNotFound": "பயனர் கிடைக்கவில்லை",
        "uploadFile": "கோப்பைப் பதிவேற்று",
        "voiceNote": "குரல் குறிப்பு",
        "connecting": "இணைக்கிறது...",
        "connected": "இணைக்கப்பட்டது",
        "download": "பதிவிறக்கு",
        "view": "பார்வையிடு",
        "unreadCount": "{count} படிக்காத செய்திகள்"
    },
    "messages": {
        "unread": "{count} படிக்காத செய்திகள்"
    },
    "settings": {
        "title": "அமைப்புகள்",
        "profile": "சுயவிவரம்",
        "account": "கணக்கு",
        "appearance": "தோற்றம்",
        "language": "மொழி",
        "selectLanguage": "பயன்பாட்டு மொழியைத் தேர்வுசெய்",
        "theme": "வண்ண அமைப்பு",
        "themeMonochrome": "மோனோக்ரோம் (டார்க்)",
        "themeSandstone": "சாண்ட்டோன் (லைட்)",
        "notifications": "அறிவிப்புகள்",
        "privacy": "தனியுரிமை & பாதுகாப்பு",
        "saveChanges": "மாற்றங்களைச் சேமி",
        "savedSuccessfully": "அமைப்புகள் வெற்றிகரமாகச் சேமிக்கப்பட்டன",
        "frankId": "உங்கள் நிரந்தர FRANK ID",
        "copyFrankId": "FRANK ID நகலெடு",
        "logout": "வெளியேறு"
    },
    "admin": {
        "title": "நிர்வாக தளம்",
        "metrics": "மேலோட்டம் மற்றும் புள்ளிவிவரங்கள்",
        "totalUsers": "மொத்த பயனர்கள்",
        "activeAccounts": "செயலில் உள்ள கணக்குகள்",
        "disabledAccounts": "முடக்கப்பட்ட கணக்குகள்",
        "verifiedEmails": "சரிபார்க்கப்பட்ட மின்னஞ்சல்கள்",
        "totalMessages": "மொத்த செய்திகள்",
        "userManagement": "பயனர் மேலாண்மை",
        "searchUsers": "பெயர், மின்னஞ்சல் அல்லது FRANK ID மூலம் தேடுங்கள்...",
        "actions": "நடவடிக்கைகள்",
        "status": "நிலை",
        "active": "செயலில்",
        "disabled": "முடக்கப்பட்டது",
        "disableUser": "கணக்கை முடக்கு",
        "enableUser": "கணக்கை இயக்கு",
        "wipeData": "பயனர் தரவை அழி",
        "deleteAccount": "கணக்கை நீக்கு",
        "confirmDelete": "கணக்கு நீக்கத்தை உறுதிசெய்",
        "auditLogs": "தணிக்கை பதிவுகள்",
        "announcements": "கட்டமைப்பு அறிவிப்புகள்",
        "broadcast": "அறிவிப்பை ஒளிபரப்பு"
    },
    "common": {
        "cancel": "ரத்துசெய்",
        "confirm": "உறுதிசெய்",
        "close": "மூடு",
        "loading": "ஏற்றுகிறது...",
        "save": "சேமி",
        "delete": "நீக்கு",
        "error": "பிழை",
        "success": "வெற்றி",
        "retry": "மீண்டும் முயற்சி செய்",
        "back": "பின்செல்",
        "next": "அடுத்து",
        "yes": "ஆம்",
        "no": "இல்லை"
    }
},
        hi: {
    "nav": {
        "features": "विशेषताएँ",
        "security": "सुरक्षा",
        "experience": "अनुभव",
        "about": "हमारे बारे में",
        "signIn": "साइन इन",
        "startChatting": "चैट शुरू करें",
        "language": "भाषा",
        "selectLanguage": "भाषा चुनें"
    },
    "hero": {
        "badge": "सोचें",
        "title": "संचार, नए रूप में।",
        "subtitle": "सुरक्षित, सुरुचिपूर्ण मैसेजिंग अनुभव में लोगों के साथ चैट करें, जुड़ें और सहयोग करें।",
        "startChatting": "चैट शुरू करें",
        "exploreFeatures": "सुविधाएँ देखें",
        "webClient": "FRANK वेब क्लाइंट",
        "liveDemo": "लाइव डेमो",
        "activeNow": "सक्रिय",
        "typing": "टाइप कर रहे हैं...",
        "demoMsg1": "क्या आप अपडेटेड डिज़ाइन एसेट्स भेज सकते हैं?",
        "demoMsg2": "अभी भेज रहा हूँ! 📦",
        "demoMsg3": "मिल गया! नया थीम बहुत आकर्षक लग रहा है।",
        "inputPlaceholder": "संदेश लिखें..."
    },
    "stats": {
        "latencyValue": "< 50ms",
        "latencyLabel": "WebSocket विलंबता",
        "uptimeValue": "99.99%",
        "uptimeLabel": "इंजीनियर्ड अपटाइम",
        "tokensValue": "256-बिट",
        "tokensLabel": "क्रिप्टोग्राफ़िक टोकन"
    },
    "features": {
        "sectionLabel": "उद्यम क्षमताएँ",
        "title": "सहज संचार के लिए आपकी ज़रूरत की हर चीज़",
        "subtitle": "उच्च विश्वसनीयता, शून्य विलंबता और सभी उपकरणों पर सहज इंटरैक्शन के लिए डिज़ाइन किया गया।",
        "realTimeTitle": "रीयल-टाइम मैसेजिंग",
        "realTimeDesc": "सब-मिलीसेकंड WebSocket डेटा प्रेषण बिना पेज रिफ्रेश किए त्वरित संदेश वितरण सुनिश्चित करता है।",
        "secureTitle": "सुरक्षित प्रमाणीकरण",
        "secureDesc": "PBKDF2 और HMAC-SHA256 JWT टोकन द्वारा सुरक्षित क्रेडेंशियल प्रत्येक API और सॉकेट अनुरोध की सुरक्षा करते हैं।",
        "groupsTitle": "समूह वार्तालाप",
        "groupsDesc": "मल्टी-मेंबर ब्रॉडकास्टिंग, प्रशासनिक नियंत्रण और गतिविधि ट्रैकिंग के साथ चर्चाओं को व्यवस्थित करें।",
        "presenceTitle": "लाइव ऑनलाइन उपस्थिति",
        "presenceDesc": "रीयल-टाइम उपस्थिति इंजन सभी सक्रिय उपयोगकर्ताओं की ऑनलाइन/दूर स्थिति और टाइपिंग संकेतकों को अपडेट करता है।",
        "searchTitle": "स्मार्ट खोज",
        "searchDesc": "क्लाइंट-साइड डिबाउंस खोज अनुक्रमण के साथ पुराने वार्तालापों, संपर्कों और टीम के सदस्यों को खोजें।",
        "themeTitle": "कस्टम डार्क थीम",
        "themeDesc": "आंखों को सुकून देने वाले विशेष डार्क मोड टोकन के साथ डिज़ाइन किया गया।"
    },
    "security": {
        "sectionLabel": "उद्यम वास्तुकला",
        "title": "निजी बातचीत। डिज़ाइन द्वारा सुरक्षित।",
        "subtitle": "FRANK गोपनीयता और अखंडता सुनिश्चित करने के लिए आधिकारिक सर्वर-साइड सत्यापन, सुरक्षित टोकन और सख्त डेटा अलगाव पर आधारित है।",
        "hashing": "PBKDF2 पासवर्ड हैशिंग",
        "jwt": "JWT बियरर प्राधिकरण",
        "websocket": "WebSocket टोकन प्रमाणीकरण",
        "cors": "सख्त CORS और सुरक्षा हेडर",
        "sql": "SQL इंजेक्शन प्रतिरक्षा",
        "xss": "XSS-सुरक्षित DOM रेंडरिंग",
        "protectedTitle": "संरक्षित वातावरण",
        "protectedDesc": "प्रत्येक अनुरोध हस्ताक्षरित हेडर के माध्यम से प्रमाणित होता है, जो अनधिकृत पहुंच को रोकता है।"
    },
    "cta": {
        "title": "सहज संचार का अनुभव करने के लिए तैयार हैं?",
        "subtitle": "आज ही FRANK पर हज़ारों आधुनिक उपयोगकर्ताओं से जुड़ें। 30 सेकंड में बिना क्रेडिट कार्ड के अपना खाता बनाएं।",
        "button": "FRANK के साथ शुरू करें →"
    },
    "footer": {
        "copyright": "© 2026 FRANK. सर्वाधिकार सुरक्षित।",
        "think": "सोचें",
        "privacy": "गोपनीयता नीति",
        "terms": "सेवा की शर्तें",
        "contact": "सहायता संपर्क"
    },
    "auth": {
        "signIn": "साइन इन",
        "welcomeBack": "वापसी पर स्वागत है",
        "welcomeBackSubtitle": "अपने FRANK खाते तक पहुँचने के लिए अपनी साख दर्ज करें",
        "createAccount": "खाता बनाएं",
        "createAccountSubtitle": "सुरक्षित रीयल-टाइम मैसेजिंग के लिए FRANK से जुड़ें",
        "email": "ईमेल पता",
        "emailPlaceholder": "name@example.com",
        "username": "उपयोगकर्ता नाम",
        "usernamePlaceholder": "उपयोगकर्ता नाम चुनें",
        "fullName": "पूरा नाम",
        "fullNamePlaceholder": "अपना पूरा नाम दर्ज करें",
        "password": "पासवर्ड",
        "passwordPlaceholder": "अपना पासवर्ड दर्ज करें",
        "confirmPassword": "पासवर्ड की पुष्टि करें",
        "confirmPasswordPlaceholder": "पासवर्ड फिर से दर्ज करें",
        "forgotPassword": "पासवर्ड भूल गए?",
        "resetPassword": "पासवर्ड रीसेट करें",
        "sendRecoveryLink": "रीसेट लिंक भेजें",
        "backToLogin": "साइन इन पर वापस जाएं",
        "agreeTerms": "मैं सेवा की शर्तों और गोपनीयता नीति से सहमत हूँ",
        "alreadyHaveAccount": "क्या आपके पास पहले से एक खाता है? साइन इन करें",
        "dontHaveAccount": "खाता नहीं है? नया बनाएं",
        "loginSuccess": "सफलतापूर्वक लॉगिन हुआ!",
        "registerSuccess": "खाता सफलतापूर्वक बनाया गया!",
        "loggingIn": "साइन इन हो रहा है...",
        "registering": "खाता बनाया जा रहा है...",
        "invalidCredentials": "अमान्य ईमेल/उपयोगकर्ता नाम या पासवर्ड",
        "passwordsDoNotMatch": "पासवर्ड मेल नहीं खाते",
        "accountDisabled": "यह खाता निष्क्रिय है। अपने व्यवस्थापक से संपर्क करें।"
    },
    "chat": {
        "chats": "चैट",
        "groups": "समूह",
        "contacts": "संपर्क",
        "favorites": "पसंदीदा",
        "archive": "संग्रह",
        "searchPlaceholder": "बातचीत, उपयोगकर्ता या FRANK ID खोजें...",
        "newChat": "नई चैट",
        "newGroup": "नया समूह",
        "messageYourself": "खुद को संदेश भेजें",
        "online": "ऑनलाइन",
        "offline": "ऑफ़लाइन",
        "typing": "टाइप कर रहे हैं...",
        "activeNow": "सक्रिय",
        "typeMessage": "एक संदेश लिखें...",
        "send": "भेजें",
        "reply": "उत्तर दें",
        "copy": "कॉपी करें",
        "copied": "कॉपी किया गया",
        "edit": "संपादित करें",
        "delete": "हटाएं",
        "edited": "संपादित",
        "pin": "चैट पिन करें",
        "unpin": "चैट अनपिन करें",
        "mute": "सूचनाएं म्यूट करें",
        "unmute": "सूचनाएं अनम्यूट करें",
        "favorite": "पसंदीदा बनाएं",
        "unfavorite": "पसंदीदा से हटाएं",
        "clearChat": "संदेश साफ़ करें",
        "leaveGroup": "समूह छोड़ें",
        "addMembers": "सदस्य जोड़ें",
        "groupInfo": "समूह विवरण",
        "chatInfo": "बातचीत विवरण",
        "noMessages": "अभी कोई संदेश नहीं है। बातचीत शुरू करने के लिए एक संदेश भेजें!",
        "noConversations": "अभी कोई बातचीत नहीं है। नई चैट शुरू करें!",
        "userNotFound": "उपयोगकर्ता नहीं मिला",
        "uploadFile": "फ़ाइल अपलोड करें",
        "voiceNote": "वॉयस नोट",
        "connecting": "कनेक्ट हो रहा है...",
        "connected": "कनेक्टेड",
        "download": "डाउनलोड",
        "view": "देखें",
        "unreadCount": "{count} अपठित संदेश"
    },
    "messages": {
        "unread": "{count} अपठित संदेश"
    },
    "settings": {
        "title": "सेटिंग्स",
        "profile": "प्रोफ़ाइल",
        "account": "खाता",
        "appearance": "दिखावट",
        "language": "भाषा",
        "selectLanguage": "इंटरफ़ेस भाषा चुनें",
        "theme": "थीम",
        "themeMonochrome": "मोनोक्रोम (डार्क)",
        "themeSandstone": "सैंडस्टोन (वार्म लाइट)",
        "notifications": "सूचनाएं",
        "privacy": "गोपनीयता और सुरक्षा",
        "saveChanges": "बदलाव सहेजें",
        "savedSuccessfully": "सेटिंग्स सफलतापूर्वक सहेजी गईं",
        "frankId": "आपकी स्थायी FRANK ID",
        "copyFrankId": "FRANK ID कॉपी करें",
        "logout": "लॉग आउट"
    },
    "admin": {
        "title": "एडमिन पोर्टल",
        "metrics": "अवलोकन और मेट्रिक्स",
        "totalUsers": "कुल उपयोगकर्ता",
        "activeAccounts": "सक्रिय खाते",
        "disabledAccounts": "निष्क्रिय खाते",
        "verifiedEmails": "सत्यापित ईमेल",
        "totalMessages": "कुल संदेश",
        "userManagement": "उपयोगकर्ता प्रबंधन",
        "searchUsers": "नाम, ईमेल या FRANK ID द्वारा खोजें...",
        "actions": "कार्रवाई",
        "status": "स्थिति",
        "active": "सक्रिय",
        "disabled": "निष्क्रिय",
        "disableUser": "खाता अक्षम करें",
        "enableUser": "खाता सक्षम करें",
        "wipeData": "डेटा साफ़ करें",
        "deleteAccount": "खाता हटाएं",
        "confirmDelete": "खाता हटाने की पुष्टि करें",
        "auditLogs": "ऑडिट लॉग",
        "announcements": "सिस्टम घोषणाएं",
        "broadcast": "घोषणा प्रसारित करें"
    },
    "common": {
        "cancel": "रद्द करें",
        "confirm": "पुष्टि करें",
        "close": "बंद करें",
        "loading": "लोड हो रहा है...",
        "save": "सहेजें",
        "delete": "हटाएं",
        "error": "त्रुटि",
        "success": "सफलता",
        "retry": "पुनः प्रयास करें",
        "back": "वापस",
        "next": "आगे",
        "yes": "हाँ",
        "no": "नहीं"
    }
}
    };

    class FrankI18n {
        constructor() {
            this.currentLang = 'en';
            this.languages = LANGUAGES;
            this.translations = TRANSLATIONS;
            this.initialized = false;
            this._listenersBound = false;
        }

        normalizeLang(code) {
            if (!code || typeof code !== 'string') return 'en';
            const normalized = code.toLowerCase().trim().slice(0, 2);
            return this.languages[normalized] ? normalized : 'en';
        }

        init() {
            let saved = null;
            try {
                saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
            } catch (e) {
                console.warn('[i18n] localStorage inaccessible:', e);
            }

            // If user is authenticated, check saved user profile preference
            try {
                const rawUser = localStorage.getItem('chatapp_user');
                if (rawUser) {
                    const user = JSON.parse(rawUser);
                    if (user && user.language) {
                        saved = user.language;
                    }
                }
            } catch (e) {}

            const targetLang = this.normalizeLang(saved);
            this.setLanguage(targetLang, { saveToDb: false, silent: true });
            this.bindDropdownEvents();
            this.initialized = true;

            // Listen for user login/update events
            window.addEventListener('storage', (event) => {
                if (event.key === STORAGE_KEY && event.newValue) {
                    this.setLanguage(event.newValue, { saveToDb: false });
                }
            });

            return this;
        }

        getLanguage() {
            return this.currentLang;
        }

        getLanguageInfo() {
            return this.languages[this.currentLang] || this.languages.en;
        }

        t(key, params = {}, fallback = null) {
            if (!key || typeof key !== 'string') return fallback || '';

            let value = this._resolve(this.translations[this.currentLang], key);

            // Fallback 1: English
            if (value === undefined || value === null) {
                value = this._resolve(this.translations.en, key);
            }

            // Fallback 2: Custom fallback if specified
            if ((value === undefined || value === null) && fallback !== null && fallback !== undefined) {
                value = fallback;
            }

            // Fallback 3: Safe humanized key name
            if (value === undefined || value === null) {
                const parts = key.split('.');
                const last = parts[parts.length - 1];
                // Convert camelCase or snake_case to readable words
                value = last
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/_/g, ' ')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();
            }

            if (typeof value !== 'string') {
                return String(value ?? '');
            }

            // Interpolate {paramName}
            return value.replace(/\{(\w+)\}/g, (match, paramName) => {
                if (params && params[paramName] !== undefined && params[paramName] !== null) {
                    return this._escapeHtml(String(params[paramName]));
                }
                return match;
            });
        }

        _resolve(obj, path) {
            if (!obj || typeof obj !== 'object') return undefined;
            const segments = path.split('.');
            let curr = obj;
            for (let i = 0; i < segments.length; i++) {
                if (curr === null || curr === undefined || typeof curr !== 'object') {
                    return undefined;
                }
                curr = curr[segments[i]];
            }
            return curr;
        }

        _escapeHtml(str) {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        setLanguage(langCode, options = {}) {
            const nextLang = this.normalizeLang(langCode);
            this.currentLang = nextLang;
            const langInfo = this.languages[nextLang];

            // Apply HTML attributes
            document.documentElement.lang = nextLang;
            document.documentElement.dir = langInfo.dir || 'ltr';

            // Save to localStorage
            try {
                localStorage.setItem(STORAGE_KEY, nextLang);
                localStorage.setItem(LEGACY_KEY, nextLang);
            } catch (e) {}

            // Save to database if user is authenticated and saveToDb is not false
            if (options.saveToDb !== false) {
                this.syncLanguageToBackend(nextLang);
            }

            // Apply to all DOM elements
            this.applyTranslations();

            // Update UI selectors
            this.updateSelectors();

            // Dispatch global event for application listeners
            if (!options.silent) {
                window.dispatchEvent(new CustomEvent('frank:languageChanged', {
                    detail: {
                        lang: nextLang,
                        info: langInfo
                    }
                }));
            }

            return nextLang;
        }

        async syncLanguageToBackend(langCode) {
            try {
                const token = localStorage.getItem('chatapp_token');
                if (!token) return;

                // Update local cached user object first
                const rawUser = localStorage.getItem('chatapp_user');
                if (rawUser) {
                    const user = JSON.parse(rawUser);
                    user.language = langCode;
                    localStorage.setItem('chatapp_user', JSON.stringify(user));
                }

                // Call backend API
                if (typeof api !== 'undefined' && typeof api.updateProfile === 'function') {
                    await api.updateProfile({ language: langCode });
                } else {
                    await fetch('/api/users/profile', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ language: langCode })
                    });
                }
            } catch (err) {
                console.warn('[i18n] Failed to sync language preference to backend:', err);
            }
        }

        applyTranslations(root = document) {
            if (!root) return;

            // 1. Text elements
            const textElements = root.querySelectorAll('[data-i18n]');
            textElements.forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    // If element has no element children, safely replace textContent
                    if (el.children.length === 0) {
                        el.textContent = translated;
                    } else {
                        // Element contains icons or children, update first text node or container text
                        let hasTextNode = false;
                        for (let child of el.childNodes) {
                            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                                child.textContent = ' ' + translated.trim() + ' ';
                                hasTextNode = true;
                                break;
                            }
                        }
                        if (!hasTextNode) {
                            // Find child span or append
                            const span = el.querySelector('span:not([aria-hidden])');
                            if (span) {
                                span.textContent = translated;
                            } else {
                                el.appendChild(document.createTextNode(' ' + translated));
                            }
                        }
                    }
                }
            });

            // 2. Placeholder attributes
            const placeholderElements = root.querySelectorAll('[data-i18n-placeholder]');
            placeholderElements.forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    el.setAttribute('placeholder', translated);
                }
            });

            // 3. Title attributes
            const titleElements = root.querySelectorAll('[data-i18n-title]');
            titleElements.forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    el.setAttribute('title', translated);
                }
            });

            // 4. Aria-label attributes
            const ariaElements = root.querySelectorAll('[data-i18n-aria-label]');
            ariaElements.forEach(el => {
                const key = el.getAttribute('data-i18n-aria-label');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    el.setAttribute('aria-label', translated);
                }
            });
        }

        updateSelectors() {
            const langInfo = this.getLanguageInfo();

            // Update all currentLangLabel elements
            document.querySelectorAll('.current-lang-label, #currentLangLabel, #mobileCurrentLangLabel').forEach(label => {
                label.textContent = langInfo.label;
            });

            // Update all dropdown menu options
            document.querySelectorAll('.lang-option').forEach(option => {
                const optionLang = option.getAttribute('data-lang');
                if (optionLang === this.currentLang) {
                    option.classList.add('active');
                    option.setAttribute('aria-selected', 'true');
                } else {
                    option.classList.remove('active');
                    option.setAttribute('aria-selected', 'false');
                }
            });
        }

        bindDropdownEvents() {
            if (this._listenersBound) return;
            this._listenersBound = true;

            // Handle toggle button clicks & accessibility
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.lang-btn');
                if (btn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const container = btn.closest('.lang-selector-container');
                    const menu = container ? container.querySelector('.lang-dropdown-menu') : null;
                    if (menu) {
                        const isOpen = menu.classList.contains('show');
                        this.closeAllDropdowns();
                        if (!isOpen) {
                            menu.classList.add('show');
                            btn.setAttribute('aria-expanded', 'true');
                            // Focus first option or active option
                            const activeOption = menu.querySelector('.lang-option.active') || menu.querySelector('.lang-option');
                            if (activeOption) activeOption.focus();
                        }
                    }
                    return;
                }

                // Handle language option selection
                const option = e.target.closest('.lang-option');
                if (option) {
                    e.preventDefault();
                    e.stopPropagation();
                    const chosenLang = option.getAttribute('data-lang');
                    if (chosenLang) {
                        this.setLanguage(chosenLang, { saveToDb: true });
                    }
                    this.closeAllDropdowns();
                    // Return focus to trigger button
                    const container = option.closest('.lang-selector-container');
                    if (container) {
                        const trigger = container.querySelector('.lang-btn');
                        if (trigger) trigger.focus();
                    }
                    return;
                }

                // Clicked outside: close all dropdowns
                this.closeAllDropdowns();
            });

            // Handle Keyboard navigation
            document.addEventListener('keydown', (e) => {
                const activeEl = document.activeElement;
                const isDropdownOpen = document.querySelector('.lang-dropdown-menu.show');

                // Escape key closes open dropdown
                if (e.key === 'Escape' && isDropdownOpen) {
                    e.preventDefault();
                    const container = isDropdownOpen.closest('.lang-selector-container');
                    this.closeAllDropdowns();
                    if (container) {
                        const trigger = container.querySelector('.lang-btn');
                        if (trigger) trigger.focus();
                    }
                    return;
                }

                // Arrow navigation within open menu
                if (isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    e.preventDefault();
                    const options = Array.from(isDropdownOpen.querySelectorAll('.lang-option'));
                    const currentIndex = options.indexOf(activeEl);

                    let nextIndex = 0;
                    if (e.key === 'ArrowDown') {
                        nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
                    } else if (e.key === 'ArrowUp') {
                        nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
                    }

                    if (options[nextIndex]) {
                        options[nextIndex].focus();
                    }
                    return;
                }

                // Enter or Space on trigger button opens dropdown
                if ((e.key === 'Enter' || e.key === ' ') && activeEl && activeEl.classList.contains('lang-btn')) {
                    e.preventDefault();
                    activeEl.click();
                }
            });
        }

        closeAllDropdowns() {
            document.querySelectorAll('.lang-dropdown-menu.show').forEach(menu => {
                menu.classList.remove('show');
            });
            document.querySelectorAll('.lang-btn[aria-expanded="true"]').forEach(btn => {
                btn.setAttribute('aria-expanded', 'false');
            });
        }

        formatDate(date, options = {}) {
            const langInfo = this.getLanguageInfo();
            const d = date instanceof Date ? date : new Date(date);
            if (isNaN(d.getTime())) return '';
            try {
                return new Intl.DateTimeFormat(langInfo.locale, options).format(d);
            } catch (e) {
                return d.toLocaleDateString();
            }
        }

        formatNumber(number, options = {}) {
            const langInfo = this.getLanguageInfo();
            const n = Number(number);
            if (isNaN(n)) return String(number);
            try {
                return new Intl.NumberFormat(langInfo.locale, options).format(n);
            } catch (e) {
                return String(number);
            }
        }
    }

    const instance = new FrankI18n();

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => instance.init());
    } else {
        instance.init();
    }

    return instance;
}));
