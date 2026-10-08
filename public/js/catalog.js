// Shared by the server (risk engine, audit) and the browser (explanations).
// Each risk rule carries its points and a plain-language reason in en/ta/hi.

export const RISK_THRESHOLD = 50;

export const RISK_RULES = [
  {
    code: 'unknown_call',
    points: 40,
    text: {
      en: 'On a call with a number that is not in the contacts',
      ta: 'தொடர்புகளில் இல்லாத ஒரு எண்ணுடன் அழைப்பு நடக்கிறது',
      hi: 'ऐसे नंबर से कॉल चल रही है जो संपर्कों में नहीं है',
    },
  },
  {
    code: 'remote_access',
    points: 30,
    text: {
      en: 'A remote-control app (like AnyDesk) is running',
      ta: 'AnyDesk போன்ற தொலைக் கட்டுப்பாட்டுச் செயலி இயங்குகிறது',
      hi: 'AnyDesk जैसा रिमोट-कंट्रोल ऐप चल रहा है',
    },
  },
  {
    code: 'screen_share',
    points: 30,
    text: {
      en: 'The screen is being shared with someone',
      ta: 'திரை வேறொருவருடன் பகிரப்படுகிறது',
      hi: 'स्क्रीन किसी के साथ शेयर हो रही है',
    },
  },
  {
    code: 'sim_changed',
    points: 30,
    text: {
      en: 'The SIM card was changed recently',
      ta: 'சிம் கார்டு சமீபத்தில் மாற்றப்பட்டது',
      hi: 'सिम कार्ड हाल ही में बदला गया है',
    },
  },
  {
    code: 'otp_pasted',
    points: 15,
    text: {
      en: 'A one-time code was pasted instead of typed',
      ta: 'ஒருமுறைக் குறியீடு தட்டச்சு செய்யப்படாமல் ஒட்டப்பட்டது',
      hi: 'वन-टाइम कोड टाइप करने के बजाय पेस्ट किया गया',
    },
  },
  {
    code: 'new_device',
    points: 20,
    text: {
      en: 'This device was added less than 10 minutes ago',
      ta: 'இந்தச் சாதனம் 10 நிமிடங்களுக்குள் சேர்க்கப்பட்டது',
      hi: 'यह डिवाइस 10 मिनट से कम समय पहले जोड़ा गया',
    },
  },
  {
    code: 'odd_hour',
    points: 10,
    text: {
      en: 'It is between midnight and 5 a.m.',
      ta: 'நள்ளிரவு முதல் அதிகாலை 5 மணி வரையிலான நேரம்',
      hi: 'आधी रात से सुबह 5 बजे के बीच का समय है',
    },
  },
  {
    code: 'recent_failures',
    points: 15,
    text: {
      en: '3 or more failed attempts in the last 15 minutes',
      ta: 'கடந்த 15 நிமிடங்களில் 3 அல்லது அதற்கு மேற்பட்ட தோல்வியுற்ற முயற்சிகள்',
      hi: 'पिछले 15 मिनट में 3 या अधिक असफल प्रयास',
    },
  },
];

export const ACTIONS = {
  add_device: {
    text: { en: 'Add a new device', ta: 'புதிய சாதனத்தைச் சேர்', hi: 'नया डिवाइस जोड़ें' },
  },
  show_otp: {
    text: { en: 'Show payment OTP', ta: 'பணம் செலுத்தும் OTP-ஐக் காட்டு', hi: 'भुगतान OTP दिखाएँ' },
  },
  change_phone: {
    text: { en: 'Change phone number', ta: 'தொலைபேசி எண்ணை மாற்று', hi: 'फ़ोन नंबर बदलें' },
  },
  raise_limit: {
    text: { en: 'Increase transfer limit', ta: 'பரிமாற்ற வரம்பை உயர்த்து', hi: 'ट्रांसफ़र सीमा बढ़ाएँ' },
  },
  recover_account: {
    text: { en: 'Recover the account on a new phone', ta: 'புதிய தொலைபேசியில் கணக்கை மீட்டெடு', hi: 'नए फ़ोन पर खाता वापस पाएँ' },
  },
};

export const ruleByCode = (code) => RISK_RULES.find((r) => r.code === code);
