const fs = require('fs');
const path = require('path');

const newOfficeEn = {
  table: 'Table',
  link: 'Link',
  addSlide: 'Add Slide',
  duplicate: 'Duplicate',
  delete: 'Delete',
  present: 'Present',
  fullScreen: 'Full Screen',
  exitFullScreen: 'Exit Full Screen',
  toggleThumbs: 'Toggle Thumbnails',
  prev: 'Previous',
  next: 'Next',
  slide: 'Slide',
  resetZoom: 'Reset Zoom',
  searchText: 'Search Document',
  downloadOriginal: 'Download Original File',
  startSlideshow: 'Start Slideshow',
  moreOptions: 'More Options',
  findInDoc: 'Find in Document',
  findInDocPlaceholder: 'Find in document...',
  downloadFile: 'Download File',
  printDoc: 'Print Document',
  thumbnails: 'Thumbnails',
  loadingDoc: 'Loading document...'
};

const newOfficeTa = {
  table: 'அட்டவணை',
  link: 'இணைப்பு',
  addSlide: 'ஸ்லைடு சேர்',
  duplicate: 'நகல் செய்',
  delete: 'நீக்கு',
  present: 'வழங்கு',
  fullScreen: 'முழுத்திரை',
  exitFullScreen: 'முழுத்திரையிலிருந்து வெளியேறு',
  toggleThumbs: 'சிறுபடங்களை மாற்று',
  prev: 'முந்தைய',
  next: 'அடுத்த',
  slide: 'ஸ்லைடு',
  resetZoom: 'ஜூம் மீட்டமை',
  searchText: 'ஆவணத்தில் தேடு',
  downloadOriginal: 'அசல் கோப்பைப் பதிவிறக்கு',
  startSlideshow: 'ஸ்லைடுகாட்சியைத் தொடங்கு',
  moreOptions: 'கூடுதல் விருப்பங்கள்',
  findInDoc: 'ஆவணத்தில் தேடு',
  findInDocPlaceholder: 'ஆவணத்தில் தேடுக...',
  downloadFile: 'கோப்பைப் பதிவிறக்கு',
  printDoc: 'ஆவணத்தை அச்சிடு',
  thumbnails: 'சிறுபடங்கள்',
  loadingDoc: 'ஆவணம் ஏற்றப்படுகிறது...'
};

const newOfficeHi = {
  table: 'तालिका',
  link: 'लिंक',
  addSlide: 'स्लाइड जोड़ें',
  duplicate: 'डुप्लिकेट करें',
  delete: 'हटाएं',
  present: 'प्रस्तुत करें',
  fullScreen: 'पूर्ण स्क्रीन',
  exitFullScreen: 'पूर्ण स्क्रीन से बाहर निकलें',
  toggleThumbs: 'थंबनेल टॉगल करें',
  prev: 'पिछला',
  next: 'अगला',
  slide: 'स्लाइड',
  resetZoom: 'ज़ूम रीसेट करें',
  searchText: 'दस्तावेज़ में खोजें',
  downloadOriginal: 'मूल फ़ाइल डाउनलोड करें',
  startSlideshow: 'स्लाइड शो शुरू करें',
  moreOptions: 'अधिक विकल्प',
  findInDoc: 'दस्तावेज़ में खोजें',
  findInDocPlaceholder: 'दस्तावेज़ में खोजें...',
  downloadFile: 'फ़ाइल डाउनलोड करें',
  printDoc: 'दस्तावेज़ प्रिंट करें',
  thumbnails: 'थंबनेल',
  loadingDoc: 'दस्तावेज़ लोड हो रहा है...'
};

const enPath = path.join(__dirname, '..', 'frontend', 'i18n', 'en.json');
const taPath = path.join(__dirname, '..', 'frontend', 'i18n', 'ta.json');
const hiPath = path.join(__dirname, '..', 'frontend', 'i18n', 'hi.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));

Object.assign(en.office, newOfficeEn);
Object.assign(ta.office, newOfficeTa);
Object.assign(hi.office, newOfficeHi);

fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');
fs.writeFileSync(taPath, JSON.stringify(ta, null, 2) + '\n');
fs.writeFileSync(hiPath, JSON.stringify(hi, null, 2) + '\n');

// Also update frontend/js/i18n.js
const i18nJsPath = path.join(__dirname, '..', 'frontend', 'js', 'i18n.js');
let i18nContent = fs.readFileSync(i18nJsPath, 'utf8');

// Replace the TRANSLATIONS object inside frontend/js/i18n.js with formatted translations
const translationsObj = {
  en,
  ta,
  hi
};
const newTranslationsStr = '    const TRANSLATIONS = ' + JSON.stringify(translationsObj, null, 8) + ';\n';
i18nContent = i18nContent.replace(/    const TRANSLATIONS = \{[\s\S]*?\n    \};\n/, newTranslationsStr);

fs.writeFileSync(i18nJsPath, i18nContent);
console.log('Successfully updated en.json, ta.json, hi.json, and i18n.js with expanded office keys!');
