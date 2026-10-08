// Interface text and failure explanations in English, Tamil and Hindi.
// Translations should be reviewed by native speakers before real use.

export const LANGS = {
  en: { label: 'English', speech: 'en-IN' },
  ta: { label: 'தமிழ்', speech: 'ta-IN' },
  hi: { label: 'हिन्दी', speech: 'hi-IN' },
};

const UI = {
  heroTitle: { en: 'Your fingerprint is the key.', ta: 'உங்கள் கைரேகையே சாவி.', hi: 'आपका फ़िंगरप्रिंट ही चाबी है।' },
  heroNote: {
    en: 'If something looks wrong, like a stranger on the phone, someone you trust is asked before anything changes.',
    ta: 'தொலைபேசியில் அறிமுகமில்லாதவர் போல ஏதாவது தவறாகத் தெரிந்தால், எதுவும் மாறும் முன் நீங்கள் நம்பும் ஒருவரிடம் கேட்கப்படும்.',
    hi: 'अगर कुछ गड़बड़ लगे, जैसे फ़ोन पर कोई अजनबी, तो कुछ भी बदलने से पहले आपके भरोसेमंद व्यक्ति से पूछा जाता है।',
  },
  tagline: {
    en: 'Sign in with your fingerprint or screen lock. Nothing to remember.',
    ta: 'உங்கள் கைரேகை அல்லது திரைப் பூட்டுடன் உள்நுழையுங்கள். எதையும் நினைவில் வைக்கத் தேவையில்லை.',
    hi: 'अपने फ़िंगरप्रिंट या स्क्रीन लॉक से साइन इन करें। कुछ भी याद रखने की ज़रूरत नहीं।',
  },
  signIn: { en: 'Sign in with my passkey', ta: 'என் கடவுச்சாவியுடன் உள்நுழை', hi: 'मेरी पासकी से साइन इन करें' },
  newHere: { en: 'New here?', ta: 'புதியவரா?', hi: 'पहली बार?' },
  yourName: { en: 'Your name', ta: 'உங்கள் பெயர்', hi: 'आपका नाम' },
  createAccount: { en: 'Create my account', ta: 'என் கணக்கை உருவாக்கு', hi: 'मेरा खाता बनाएँ' },
  lostPhone: { en: 'I lost my phone', ta: 'என் தொலைபேசி தொலைந்தது', hi: 'मेरा फ़ोन खो गया' },
  language: { en: 'Language', ta: 'மொழி', hi: 'भाषा' },
  voiceOn: { en: 'Voice on', ta: 'குரல் இயக்கத்தில்', hi: 'आवाज़ चालू' },
  voiceOff: { en: 'Voice off', ta: 'குரல் அணைப்பில்', hi: 'आवाज़ बंद' },
  hearAgain: { en: 'Hear again', ta: 'மீண்டும் கேள்', hi: 'फिर से सुनें' },
  noVoice: {
    en: 'This device has no English voice installed, so messages are shown as text.',
    ta: 'இந்தச் சாதனத்தில் தமிழ் குரல் இல்லை, அதனால் செய்திகள் எழுத்தாகக் காட்டப்படும்.',
    hi: 'इस डिवाइस में हिंदी आवाज़ नहीं है, इसलिए संदेश लिखकर दिखाए जाएँगे।',
  },
  hello: { en: 'Hello, {name}', ta: 'வணக்கம், {name}', hi: 'नमस्ते, {name}' },
  balance: { en: 'Balance', ta: 'இருப்பு', hi: 'बैलेंस' },
  phone: { en: 'Phone', ta: 'தொலைபேசி', hi: 'फ़ोन' },
  limit: { en: 'Transfer limit', ta: 'பரிமாற்ற வரம்பு', hi: 'ट्रांसफ़र सीमा' },
  safetyClear: { en: 'Safety check: all clear', ta: 'பாதுகாப்புச் சோதனை: எல்லாம் சரி', hi: 'सुरक्षा जाँच: सब ठीक' },
  safetyRisk: { en: 'Safety check: we noticed something', ta: 'பாதுகாப்புச் சோதனை: ஒன்றைக் கவனித்தோம்', hi: 'सुरक्षा जाँच: कुछ ध्यान में आया' },
  riskScore: {
    en: 'Risk score {score}. Guardian check starts at {threshold}.',
    ta: 'ஆபத்து மதிப்பெண் {score}. {threshold}-இல் பாதுகாவலர் சோதனை தொடங்கும்.',
    hi: 'जोखिम स्कोर {score}। {threshold} पर अभिभावक जाँच शुरू होती है।',
  },
  paySection: { en: 'Pay someone', ta: 'யாருக்காவது பணம் அனுப்பு', hi: 'किसी को भुगतान करें' },
  payee: { en: 'To', ta: 'பெறுநர்', hi: 'किसे' },
  amount: { en: 'Amount (₹)', ta: 'தொகை (₹)', hi: 'राशि (₹)' },
  sendCode: { en: 'Send code', ta: 'குறியீடு அனுப்பு', hi: 'कोड भेजें' },
  otpLabel: { en: '6-digit code from the SMS', ta: 'SMS-இல் வந்த 6 இலக்கக் குறியீடு', hi: 'SMS में आया 6 अंकों का कोड' },
  confirmPay: { en: 'Confirm payment', ta: 'பணம் செலுத்தலை உறுதிசெய்', hi: 'भुगतान की पुष्टि करें' },
  convertDigits: { en: 'Change to 0–9', ta: '0–9 ஆக மாற்று', hi: '0–9 में बदलें' },
  smsTitle: { en: 'Simulated SMS', ta: 'மாதிரி SMS', hi: 'डेमो SMS' },
  protectedTitle: { en: 'Protected actions', ta: 'பாதுகாக்கப்பட்ட செயல்கள்', hi: 'सुरक्षित कार्य' },
  protectedHint: {
    en: 'These need your passkey. If something looks wrong, a guardian must approve too.',
    ta: 'இவற்றுக்கு உங்கள் கடவுச்சாவி தேவை. ஏதாவது தவறாகத் தெரிந்தால், பாதுகாவலரும் ஒப்புதல் தர வேண்டும்.',
    hi: 'इनके लिए आपकी पासकी चाहिए। कुछ गड़बड़ लगे तो अभिभावक की मंज़ूरी भी चाहिए।',
  },
  newPhone: { en: 'New phone number', ta: 'புதிய தொலைபேசி எண்', hi: 'नया फ़ोन नंबर' },
  newLimit: { en: 'New limit (₹)', ta: 'புதிய வரம்பு (₹)', hi: 'नई सीमा (₹)' },
  guardiansTitle: { en: 'Your guardians', ta: 'உங்கள் பாதுகாவலர்கள்', hi: 'आपके अभिभावक' },
  noGuardians: {
    en: 'Invite someone you trust. They can stop a scam even when you can’t.',
    ta: 'நீங்கள் நம்பும் ஒருவரை அழையுங்கள். உங்களால் முடியாதபோதும் அவர் மோசடியை நிறுத்த முடியும்.',
    hi: 'किसी भरोसेमंद व्यक्ति को आमंत्रित करें। जब आप न कर पाएँ, तब भी वे धोखा रोक सकते हैं।',
  },
  invite: { en: 'Invite a guardian', ta: 'பாதுகாவலரை அழை', hi: 'अभिभावक को आमंत्रित करें' },
  inviteReady: {
    en: 'Send this link to your guardian. It works once, for 24 hours.',
    ta: 'இந்த இணைப்பை உங்கள் பாதுகாவலருக்கு அனுப்புங்கள். இது 24 மணி நேரத்திற்கு, ஒரு முறை மட்டுமே செல்லும்.',
    hi: 'यह लिंक अपने अभिभावक को भेजें। यह 24 घंटे में सिर्फ़ एक बार चलेगा।',
  },
  copy: { en: 'Copy link', ta: 'இணைப்பை நகலெடு', hi: 'लिंक कॉपी करें' },
  copied: { en: 'Copied', ta: 'நகலெடுக்கப்பட்டது', hi: 'कॉपी हो गया' },
  signalsTitle: { en: 'Simulated scam signals (demo)', ta: 'மாதிரி மோசடி அறிகுறிகள் (டெமோ)', hi: 'नकली धोखा संकेत (डेमो)' },
  signalsHint: {
    en: 'In real use these come from the phone. Switch them on to see how the app reacts.',
    ta: 'உண்மையில் இவை தொலைபேசியிலிருந்து வரும். செயலி எப்படிச் செயல்படுகிறது என்று பார்க்க இவற்றை இயக்குங்கள்.',
    hi: 'असल में ये फ़ोन से आते हैं। ऐप कैसे प्रतिक्रिया देता है, यह देखने के लिए इन्हें चालू करें।',
  },
  deviceKey: { en: 'Device key for the phone app', ta: 'தொலைபேசிச் செயலிக்கான சாதனச் சாவி', hi: 'फ़ोन ऐप के लिए डिवाइस कुंजी' },
  signOut: { en: 'Sign out', ta: 'வெளியேறு', hi: 'साइन आउट' },
  pausedTitle: { en: 'Paused for your safety', ta: 'உங்கள் பாதுகாப்புக்காக நிறுத்தப்பட்டது', hi: 'आपकी सुरक्षा के लिए रोका गया' },
  scamWarning: {
    en: 'No real police officer, bank or courier will ever ask you to do this on a call.',
    ta: 'உண்மையான காவல்துறை அதிகாரி, வங்கி அல்லது கூரியர் யாரும் அழைப்பில் இதைச் செய்யச் சொல்ல மாட்டார்கள்.',
    hi: 'असली पुलिस, बैंक या कूरियर वाले कभी भी कॉल पर यह करने को नहीं कहते।',
  },
  whyPaused: { en: 'Why we paused', ta: 'ஏன் நிறுத்தினோம்', hi: 'हमने क्यों रोका' },
  askedGuardians: {
    en: 'We’ve asked {names} to check. Stay calm. You don’t have to do anything.',
    ta: '{names} அவர்களைச் சரிபார்க்கக் கேட்டுள்ளோம். அமைதியாக இருங்கள். நீங்கள் எதுவும் செய்ய வேண்டியதில்லை.',
    hi: 'हमने {names} से जाँचने को कहा है। शांत रहिए। आपको कुछ नहीं करना है।',
  },
  waitingTime: {
    en: 'Unlocks in {time} unless you cancel.',
    ta: 'நீங்கள் ரத்து செய்யாவிட்டால் {time}-இல் திறக்கும்.',
    hi: 'रद्द न करने पर {time} में खुलेगा।',
  },
  approvedBy: {
    en: '{name} approved. Finish with your passkey.',
    ta: '{name} ஒப்புதல் அளித்தார். உங்கள் கடவுச்சாவியுடன் முடியுங்கள்.',
    hi: '{name} ने मंज़ूरी दी। अपनी पासकी से पूरा करें।',
  },
  readyNow: {
    en: 'The waiting time is over. Finish with your passkey if you still want this.',
    ta: 'காத்திருப்பு நேரம் முடிந்தது. இன்னும் வேண்டுமென்றால் உங்கள் கடவுச்சாவியுடன் முடியுங்கள்.',
    hi: 'इंतज़ार का समय पूरा हुआ। अगर अब भी चाहिए तो अपनी पासकी से पूरा करें।',
  },
  finish: { en: 'Finish with my passkey', ta: 'என் கடவுச்சாவியுடன் முடி', hi: 'मेरी पासकी से पूरा करें' },
  cancelThis: { en: 'Cancel this', ta: 'இதை ரத்து செய்', hi: 'इसे रद्द करें' },
  close: { en: 'Close', ta: 'மூடு', hi: 'बंद करें' },
  cancelled: { en: 'Cancelled. Nothing was changed.', ta: 'ரத்து செய்யப்பட்டது. எதுவும் மாற்றப்படவில்லை.', hi: 'रद्द किया गया। कुछ नहीं बदला।' },
  expired: { en: 'This request timed out. Nothing was changed.', ta: 'இந்தக் கோரிக்கையின் நேரம் முடிந்தது. எதுவும் மாற்றப்படவில்லை.', hi: 'इस अनुरोध का समय खत्म हो गया। कुछ नहीं बदला।' },
  done_add_device: { en: 'Done. Enter code {pairingCode} on the new device.', ta: 'முடிந்தது. புதிய சாதனத்தில் {pairingCode} குறியீட்டை உள்ளிடுங்கள்.', hi: 'हो गया। नए डिवाइस पर कोड {pairingCode} डालें।' },
  done_show_otp: { en: 'Your payment OTP is {otp}. Never read it out to anyone.', ta: 'உங்கள் பணம் செலுத்தும் OTP {otp}. இதை யாரிடமும் சொல்லாதீர்கள்.', hi: 'आपका भुगतान OTP {otp} है। इसे किसी को न बताएँ।' },
  done_change_phone: { en: 'Done. Your phone number is now {phone}.', ta: 'முடிந்தது. உங்கள் தொலைபேசி எண் இப்போது {phone}.', hi: 'हो गया। आपका फ़ोन नंबर अब {phone} है।' },
  done_raise_limit: { en: 'Done. Your transfer limit is now ₹{transferLimit}.', ta: 'முடிந்தது. உங்கள் பரிமாற்ற வரம்பு இப்போது ₹{transferLimit}.', hi: 'हो गया। आपकी ट्रांसफ़र सीमा अब ₹{transferLimit} है।' },
  signedIn: { en: 'You’re signed in.', ta: 'நீங்கள் உள்நுழைந்துவிட்டீர்கள்.', hi: 'आप साइन इन हो गए।' },
  accountCreated: { en: 'Your account is ready. Your passkey is your key.', ta: 'உங்கள் கணக்கு தயார். உங்கள் கடவுச்சாவியே உங்கள் சாவி.', hi: 'आपका खाता तैयार है। आपकी पासकी ही आपकी चाबी है।' },
  paymentDone: { en: 'Paid ₹{amount} to {payee}.', ta: '{payee}-க்கு ₹{amount} செலுத்தப்பட்டது.', hi: '{payee} को ₹{amount} का भुगतान हो गया।' },
  codeSent: { en: 'We sent a 6-digit code by SMS. Type it below.', ta: 'SMS மூலம் 6 இலக்கக் குறியீட்டை அனுப்பியுள்ளோம். கீழே தட்டச்சு செய்யுங்கள்.', hi: 'हमने SMS से 6 अंकों का कोड भेजा है। नीचे टाइप करें।' },
  digitsFixed: { en: 'Changed to 0–9. Tap “Confirm payment”.', ta: '0–9 ஆக மாற்றப்பட்டது. “பணம் செலுத்தலை உறுதிசெய்” என்பதைத் தட்டுங்கள்.', hi: '0–9 में बदल दिया। “भुगतान की पुष्टि करें” दबाइए।' },
  recoverTitle: { en: 'Get back into your account', ta: 'உங்கள் கணக்கிற்குத் திரும்புங்கள்', hi: 'अपने खाते में वापस आएँ' },
  recoverIntro: {
    en: 'Your guardians confirm it’s really you. No SMS codes, no security questions.',
    ta: 'இது உண்மையில் நீங்கள்தான் என்று உங்கள் பாதுகாவலர்கள் உறுதிசெய்வார்கள். SMS குறியீடுகளோ பாதுகாப்புக் கேள்விகளோ இல்லை.',
    hi: 'आपके अभिभावक पुष्टि करते हैं कि यह सच में आप हैं। न SMS कोड, न सुरक्षा प्रश्न।',
  },
  accountName: { en: 'Account name', ta: 'கணக்குப் பெயர்', hi: 'खाते का नाम' },
  askGuardians: { en: 'Ask my guardians', ta: 'என் பாதுகாவலர்களைக் கேள்', hi: 'मेरे अभिभावकों से पूछें' },
  recoveryProgress: { en: '{approvals} of {required} guardians approved.', ta: '{required} பாதுகாவலர்களில் {approvals} பேர் ஒப்புதல் அளித்தனர்.', hi: '{required} में से {approvals} अभिभावकों ने मंज़ूरी दी।' },
  recoveryWindow: {
    en: 'Approved. For safety, your old devices can cancel this for {time}.',
    ta: 'ஒப்புதல் கிடைத்தது. பாதுகாப்புக்காக, உங்கள் பழைய சாதனங்கள் {time} வரை இதை ரத்து செய்யலாம்.',
    hi: 'मंज़ूरी मिल गई। सुरक्षा के लिए, आपके पुराने डिवाइस {time} तक इसे रद्द कर सकते हैं।',
  },
  recoveryReady: { en: 'All set. Create a new passkey on this phone.', ta: 'எல்லாம் தயார். இந்தத் தொலைபேசியில் புதிய கடவுச்சாவியை உருவாக்குங்கள்.', hi: 'सब तैयार है। इस फ़ोन पर नई पासकी बनाइए।' },
  newPasskey: { en: 'Create a new passkey', ta: 'புதிய கடவுச்சாவியை உருவாக்கு', hi: 'नई पासकी बनाएँ' },
  recoveryDenied: { en: 'A guardian said no, so recovery was stopped.', ta: 'ஒரு பாதுகாவலர் வேண்டாம் என்றார், அதனால் மீட்பு நிறுத்தப்பட்டது.', hi: 'एक अभिभावक ने मना किया, इसलिए रिकवरी रोक दी गई।' },
  recoveryCancelled: { en: 'Recovery was cancelled from a signed-in device.', ta: 'உள்நுழைந்த சாதனத்திலிருந்து மீட்பு ரத்து செய்யப்பட்டது.', hi: 'साइन-इन डिवाइस से रिकवरी रद्द कर दी गई।' },
  back: { en: 'Back', ta: 'பின்செல்', hi: 'वापस' },
  recoveryAlert: { en: 'Someone is trying to recover your account on a new phone.', ta: 'யாரோ புதிய தொலைபேசியில் உங்கள் கணக்கை மீட்டெடுக்க முயல்கிறார்கள்.', hi: 'कोई नए फ़ोन पर आपका खाता वापस पाने की कोशिश कर रहा है।' },
  recoveryAlertNext: { en: 'If this isn’t you, cancel now.', ta: 'இது நீங்கள் இல்லையென்றால், இப்போதே ரத்து செய்யுங்கள்.', hi: 'अगर यह आप नहीं हैं, तो अभी रद्द करें।' },
  cancelRecovery: { en: 'Cancel recovery', ta: 'மீட்பை ரத்து செய்', hi: 'रिकवरी रद्द करें' },

  // Guardian app
  gTitle: { en: 'Guardian', ta: 'பாதுகாவலர்', hi: 'अभिभावक' },
  gIntro: {
    en: 'You protect someone you love. You never see their account. You only say yes or no when something looks risky.',
    ta: 'நீங்கள் நேசிக்கும் ஒருவரைப் பாதுகாக்கிறீர்கள். அவர்களின் கணக்கை நீங்கள் பார்க்க முடியாது. ஏதாவது ஆபத்தாகத் தெரிந்தால் மட்டும் ஆம் அல்லது இல்லை என்கிறீர்கள்.',
    hi: 'आप किसी अपने की रक्षा करते हैं। आप उनका खाता कभी नहीं देखते। कुछ जोखिम भरा लगे तभी हाँ या ना कहते हैं।',
  },
  gInvitedBy: { en: '{name} asked you to be their guardian.', ta: '{name} உங்களைத் தங்கள் பாதுகாவலராக இருக்கக் கேட்டுள்ளார்.', hi: '{name} ने आपको अपना अभिभावक बनने को कहा है।' },
  gAccept: { en: 'Become a guardian', ta: 'பாதுகாவலராகு', hi: 'अभिभावक बनें' },
  gAcceptExisting: { en: 'Accept invite', ta: 'அழைப்பை ஏற்றுக்கொள்', hi: 'निमंत्रण स्वीकार करें' },
  gSignIn: { en: 'Sign in as guardian', ta: 'பாதுகாவலராக உள்நுழை', hi: 'अभिभावक के रूप में साइन इन करें' },
  gGuarding: { en: 'You protect: {names}', ta: 'நீங்கள் பாதுகாப்பவர்: {names}', hi: 'आप इनकी रक्षा करते हैं: {names}' },
  gNoRequests: { en: 'Nothing needs you right now. Requests appear here the moment they happen.', ta: 'இப்போது உங்கள் உதவி தேவையில்லை. கோரிக்கைகள் வந்தவுடன் இங்கே தோன்றும்.', hi: 'अभी आपकी ज़रूरत नहीं है। अनुरोध आते ही यहाँ दिखेंगे।' },
  gRequestTitle: { en: '{name} needs you', ta: '{name}-க்கு உங்கள் உதவி தேவை', hi: '{name} को आपकी ज़रूरत है' },
  gWants: { en: 'Wants to: {action}', ta: 'செய்ய விரும்புவது: {action}', hi: 'करना चाहते हैं: {action}' },
  gWhatWeSee: { en: 'What we noticed', ta: 'நாங்கள் கவனித்தது', hi: 'हमने क्या देखा' },
  gAdvice: { en: 'Before you approve, call {name} yourself on a number you know.', ta: 'ஒப்புதல் தருவதற்கு முன், உங்களுக்குத் தெரிந்த எண்ணில் {name}-ஐ நீங்களே அழையுங்கள்.', hi: 'मंज़ूरी देने से पहले, अपने जाने-पहचाने नंबर पर {name} को खुद फ़ोन करें।' },
  gRecoveryAdvice: { en: 'Only approve if {name} asked you in person or on a call you made.', ta: '{name} நேரிலோ நீங்கள் செய்த அழைப்பிலோ கேட்டிருந்தால் மட்டும் ஒப்புதல் அளியுங்கள்.', hi: 'सिर्फ़ तभी मंज़ूरी दें जब {name} ने आपसे खुद या आपकी की हुई कॉल पर कहा हो।' },
  gApprove: { en: 'Approve', ta: 'ஒப்புதல் அளி', hi: 'मंज़ूरी दें' },
  gDeny: { en: 'Deny', ta: 'மறு', hi: 'मना करें' },
  gApproved: { en: 'You approved. {name} can now finish.', ta: 'நீங்கள் ஒப்புதல் அளித்தீர்கள். {name} இப்போது முடிக்கலாம்.', hi: 'आपने मंज़ूरी दी। {name} अब पूरा कर सकते हैं।' },
  gDenied: { en: 'You said no. It was stopped.', ta: 'நீங்கள் வேண்டாம் என்றீர்கள். அது நிறுத்தப்பட்டது.', hi: 'आपने मना किया। इसे रोक दिया गया।' },
  gNewRequest: { en: '{name} needs you. Please check.', ta: '{name}-க்கு உங்கள் உதவி தேவை. சரிபாருங்கள்.', hi: '{name} को आपकी ज़रूरत है। कृपया देखें।' },
  gTimeLeft: { en: 'Answer within {time}, or a safety wait starts.', ta: '{time}-க்குள் பதிலளியுங்கள், இல்லையெனில் பாதுகாப்புக் காத்திருப்பு தொடங்கும்.', hi: '{time} में जवाब दें, नहीं तो सुरक्षा इंतज़ार शुरू होगा।' },
  gInCooloff: { en: 'In a safety wait. You can still answer.', ta: 'பாதுகாப்புக் காத்திருப்பில் உள்ளது. நீங்கள் இன்னும் பதிலளிக்கலாம்.', hi: 'सुरक्षा इंतज़ार में है। आप अब भी जवाब दे सकते हैं।' },
  gWelcome: { en: 'You’re now a guardian for {name}.', ta: 'இப்போது நீங்கள் {name}-இன் பாதுகாவலர்.', hi: 'अब आप {name} के अभिभावक हैं।' },
};

// Failure explanations: one sentence on what happened, one on what to do next.
// Codes that come from the browser (digits, passkey prompt errors) can be
// specific; codes from the server stay generic so they never help an attacker.
const MSG = {
  otp_native_digits: {
    en: ['The code was typed in {script} digits, but it needs 0–9 digits.', 'Tap “Change to 0–9” and we’ll fix it for you.'],
    ta: ['குறியீடு {script} எண்களில் தட்டச்சு செய்யப்பட்டுள்ளது, ஆனால் 0–9 எண்கள் தேவை.', '“0–9 ஆக மாற்று” என்பதைத் தட்டுங்கள், நாங்கள் சரிசெய்கிறோம்.'],
    hi: ['कोड {script} अंकों में टाइप हुआ है, लेकिन 0–9 अंक चाहिए।', '“0–9 में बदलें” दबाइए, हम ठीक कर देंगे।'],
  },
  otp_expired: {
    en: ['This code has expired. Codes work for 2 minutes.', 'Tap “Send code” to get a new one.'],
    ta: ['இந்தக் குறியீட்டின் நேரம் முடிந்துவிட்டது. குறியீடுகள் 2 நிமிடங்கள் மட்டுமே செல்லும்.', 'புதிய குறியீட்டைப் பெற “குறியீடு அனுப்பு” என்பதைத் தட்டுங்கள்.'],
    hi: ['इस कोड का समय खत्म हो गया है। कोड सिर्फ़ 2 मिनट चलते हैं।', 'नया कोड पाने के लिए “कोड भेजें” दबाइए।'],
  },
  otp_wrong: {
    en: ['That code didn’t match.', 'Check the SMS and type the 6 digits again.'],
    ta: ['அந்தக் குறியீடு பொருந்தவில்லை.', 'SMS-ஐப் பார்த்து 6 எண்களை மீண்டும் தட்டச்சு செய்யுங்கள்.'],
    hi: ['वह कोड मेल नहीं खाया।', 'SMS देखकर 6 अंक फिर से टाइप कीजिए।'],
  },
  otp_too_many: {
    en: ['Too many wrong codes, so this payment was stopped.', 'Start the payment again to get a new code.'],
    ta: ['பல தவறான குறியீடுகள், அதனால் இந்தப் பணப் பரிமாற்றம் நிறுத்தப்பட்டது.', 'புதிய குறியீட்டைப் பெற மீண்டும் தொடங்குங்கள்.'],
    hi: ['बहुत सारे गलत कोड, इसलिए यह भुगतान रोक दिया गया।', 'नया कोड पाने के लिए भुगतान फिर से शुरू कीजिए।'],
  },
  webauthn_not_allowed: {
    en: ['The passkey check was cancelled or took too long.', 'Tap the button again and use your fingerprint or screen lock.'],
    ta: ['கடவுச்சாவி சரிபார்ப்பு ரத்து செய்யப்பட்டது அல்லது நேரம் கடந்தது.', 'பொத்தானை மீண்டும் தட்டி, கைரேகை அல்லது திரைப் பூட்டைப் பயன்படுத்துங்கள்.'],
    hi: ['पासकी जाँच रद्द हो गई या समय निकल गया।', 'बटन फिर दबाइए और फ़िंगरप्रिंट या स्क्रीन लॉक इस्तेमाल कीजिए।'],
  },
  webauthn_invalid_state: {
    en: ['This device already has a passkey for this account.', 'Use “Sign in with my passkey” instead.'],
    ta: ['இந்தச் சாதனத்தில் ஏற்கனவே இந்தக் கணக்கிற்கான கடவுச்சாவி உள்ளது.', '“என் கடவுச்சாவியுடன் உள்நுழை” என்பதைப் பயன்படுத்துங்கள்.'],
    hi: ['इस डिवाइस पर इस खाते की पासकी पहले से है।', '“मेरी पासकी से साइन इन करें” इस्तेमाल कीजिए।'],
  },
  webauthn_security: {
    en: ['This page’s address isn’t allowed to use passkeys.', 'Open the app from its official https link and try again.'],
    ta: ['இந்தப் பக்கத்தின் முகவரியில் கடவுச்சாவிகளைப் பயன்படுத்த முடியாது.', 'அதிகாரப்பூர்வ https இணைப்பிலிருந்து திறந்து மீண்டும் முயலுங்கள்.'],
    hi: ['इस पेज के पते पर पासकी इस्तेमाल नहीं हो सकती।', 'आधिकारिक https लिंक से खोलकर फिर कोशिश कीजिए।'],
  },
  webauthn_not_supported: {
    en: ['This browser or device can’t use passkeys.', 'Use an up-to-date phone or computer with a fingerprint, face or screen lock.'],
    ta: ['இந்த உலாவி அல்லது சாதனம் கடவுச்சாவிகளை ஆதரிக்கவில்லை.', 'கைரேகை, முகம் அல்லது திரைப் பூட்டு உள்ள புதுப்பிக்கப்பட்ட சாதனத்தைப் பயன்படுத்துங்கள்.'],
    hi: ['यह ब्राउज़र या डिवाइस पासकी नहीं चला सकता।', 'फ़िंगरप्रिंट, चेहरा या स्क्रीन लॉक वाला अपडेटेड डिवाइस इस्तेमाल कीजिए।'],
  },
  passkey_unknown: {
    en: ['We couldn’t sign you in with that passkey.', 'Try again, or choose “I lost my phone” to get help from your guardians.'],
    ta: ['அந்தக் கடவுச்சாவியால் உங்களை உள்நுழைய வைக்க முடியவில்லை.', 'மீண்டும் முயலுங்கள், அல்லது பாதுகாவலர்களின் உதவிக்கு “என் தொலைபேசி தொலைந்தது” என்பதைத் தேர்ந்தெடுங்கள்.'],
    hi: ['उस पासकी से आपको साइन इन नहीं कर सके।', 'फिर कोशिश कीजिए, या अभिभावकों की मदद के लिए “मेरा फ़ोन खो गया” चुनिए।'],
  },
  wrong_role_guardian: {
    en: ['That is a guardian passkey, not an account passkey.', 'Choose your own account passkey.'],
    ta: ['அது பாதுகாவலர் கடவுச்சாவி, கணக்குக் கடவுச்சாவி அல்ல.', 'உங்கள் சொந்தக் கணக்குக் கடவுச்சாவியைத் தேர்ந்தெடுங்கள்.'],
    hi: ['यह अभिभावक की पासकी है, खाते की नहीं।', 'अपने खाते की पासकी चुनिए।'],
  },
  wrong_role_user: {
    en: ['That is an account passkey, not a guardian passkey.', 'Choose the passkey you made as a guardian.'],
    ta: ['அது கணக்குக் கடவுச்சாவி, பாதுகாவலர் கடவுச்சாவி அல்ல.', 'பாதுகாவலராக நீங்கள் உருவாக்கிய கடவுச்சாவியைத் தேர்ந்தெடுங்கள்.'],
    hi: ['यह खाते की पासकी है, अभिभावक की नहीं।', 'अभिभावक के रूप में बनाई गई पासकी चुनिए।'],
  },
  verification_failed: {
    en: ['The passkey check didn’t go through.', 'Try again.'],
    ta: ['கடவுச்சாவி சரிபார்ப்பு வெற்றிபெறவில்லை.', 'மீண்டும் முயலுங்கள்.'],
    hi: ['पासकी जाँच पूरी नहीं हुई।', 'फिर कोशिश कीजिए।'],
  },
  name_taken: {
    en: ['That name is already used.', 'Add something to make it yours, like “Amma Chennai”.'],
    ta: ['அந்தப் பெயர் ஏற்கனவே பயன்பாட்டில் உள்ளது.', '“அம்மா சென்னை” போல ஏதாவது சேர்த்து உங்களுடையதாக்குங்கள்.'],
    hi: ['यह नाम पहले से इस्तेमाल में है।', '“अम्मा चेन्नई” जैसा कुछ जोड़कर इसे अपना बनाइए।'],
  },
  name_required: {
    en: ['Please type a name of at least 2 letters.', 'Then tap the button again.'],
    ta: ['குறைந்தது 2 எழுத்துகள் கொண்ட பெயரைத் தட்டச்சு செய்யுங்கள்.', 'பிறகு பொத்தானை மீண்டும் தட்டுங்கள்.'],
    hi: ['कम से कम 2 अक्षरों का नाम टाइप कीजिए।', 'फिर बटन दोबारा दबाइए।'],
  },
  phone_invalid: {
    en: ['That isn’t a 10-digit mobile number.', 'Type it without +91, like 98400 12345.'],
    ta: ['அது 10 இலக்க மொபைல் எண் அல்ல.', '+91 இல்லாமல், 98400 12345 போலத் தட்டச்சு செய்யுங்கள்.'],
    hi: ['यह 10 अंकों का मोबाइल नंबर नहीं है।', '+91 के बिना, 98400 12345 जैसा टाइप कीजिए।'],
  },
  limit_invalid: {
    en: ['That limit isn’t allowed.', 'Choose an amount between ₹1,000 and ₹10,00,000.'],
    ta: ['அந்த வரம்பு அனுமதிக்கப்படவில்லை.', '₹1,000 முதல் ₹10,00,000 வரையிலான தொகையைத் தேர்ந்தெடுங்கள்.'],
    hi: ['यह सीमा मान्य नहीं है।', '₹1,000 से ₹10,00,000 के बीच की राशि चुनिए।'],
  },
  invite_invalid: {
    en: ['This invite link has expired or was already used.', 'Ask for a new invite link.'],
    ta: ['இந்த அழைப்பு இணைப்பு காலாவதியானது அல்லது ஏற்கனவே பயன்படுத்தப்பட்டது.', 'புதிய அழைப்பு இணைப்பைக் கேளுங்கள்.'],
    hi: ['यह निमंत्रण लिंक पुराना हो गया है या पहले इस्तेमाल हो चुका है।', 'नया निमंत्रण लिंक माँगिए।'],
  },
  guardian_denied: {
    en: ['{name} said no, so this was stopped.', 'If someone on a call asked you to do this, hang up. It was a scam.'],
    ta: ['{name} வேண்டாம் என்றார், அதனால் இது நிறுத்தப்பட்டது.', 'அழைப்பில் யாராவது இதைச் செய்யச் சொன்னால், அழைப்பைத் துண்டியுங்கள். அது ஒரு மோசடி.'],
    hi: ['{name} ने मना किया, इसलिए इसे रोक दिया गया।', 'अगर कॉल पर किसी ने यह करने को कहा, तो कॉल काट दीजिए। वह धोखा था।'],
  },
  cooloff: {
    en: ['No guardian answered, so this waits {time} for safety.', 'You can cancel it any time. We’ve alerted your other devices.'],
    ta: ['எந்தப் பாதுகாவலரும் பதிலளிக்கவில்லை, அதனால் பாதுகாப்புக்காக இது {time} காத்திருக்கும்.', 'எப்போது வேண்டுமானாலும் ரத்து செய்யலாம். உங்கள் மற்ற சாதனங்களுக்கு எச்சரிக்கை அனுப்பியுள்ளோம்.'],
    hi: ['किसी अभिभावक ने जवाब नहीं दिया, इसलिए सुरक्षा के लिए यह {time} रुकेगा।', 'आप कभी भी रद्द कर सकते हैं। आपके दूसरे डिवाइसों को सूचना भेज दी गई है।'],
  },
  paused: {
    en: ['Paused for your safety. No real police officer or bank will ask you to do this on a call.', 'We’ve asked {names} to check.'],
    ta: ['உங்கள் பாதுகாப்புக்காக நிறுத்தப்பட்டது. உண்மையான காவல்துறையோ வங்கியோ அழைப்பில் இதைச் செய்யச் சொல்லாது.', '{names} அவர்களைச் சரிபார்க்கக் கேட்டுள்ளோம்.'],
    hi: ['आपकी सुरक्षा के लिए रोका गया। असली पुलिस या बैंक कभी कॉल पर यह करने को नहीं कहते।', 'हमने {names} से जाँचने को कहा है।'],
  },
  recovery_waiting: {
    en: ['If this account has guardians, we’ve asked them to approve.', 'Keep this page open. If you never added guardians, visit your branch with an ID.'],
    ta: ['இந்தக் கணக்கிற்குப் பாதுகாவலர்கள் இருந்தால், ஒப்புதல் தரக் கேட்டுள்ளோம்.', 'இந்தப் பக்கத்தைத் திறந்தே வையுங்கள். பாதுகாவலர்களைச் சேர்க்கவில்லை என்றால், அடையாள அட்டையுடன் உங்கள் கிளைக்குச் செல்லுங்கள்.'],
    hi: ['अगर इस खाते के अभिभावक हैं, तो हमने उनसे मंज़ूरी माँगी है।', 'यह पेज खुला रखें। अगर आपने अभिभावक नहीं जोड़े, तो पहचान पत्र लेकर अपनी शाखा जाएँ।'],
  },
  not_signed_in: {
    en: ['You’re signed out.', 'Sign in with your passkey.'],
    ta: ['நீங்கள் வெளியேறியுள்ளீர்கள்.', 'உங்கள் கடவுச்சாவியுடன் உள்நுழையுங்கள்.'],
    hi: ['आप साइन आउट हैं।', 'अपनी पासकी से साइन इन कीजिए।'],
  },
  challenge_missing: {
    en: ['That took too long.', 'Try again.'],
    ta: ['அதிக நேரம் ஆனது.', 'மீண்டும் முயலுங்கள்.'],
    hi: ['बहुत देर हो गई।', 'फिर कोशिश कीजिए।'],
  },
  not_ready: {
    en: ['This step isn’t ready yet.', 'Wait a moment and try again.'],
    ta: ['இந்தப் படி இன்னும் தயாராகவில்லை.', 'சிறிது நேரம் காத்திருந்து மீண்டும் முயலுங்கள்.'],
    hi: ['यह कदम अभी तैयार नहीं है।', 'थोड़ा रुककर फिर कोशिश कीजिए।'],
  },
  network: {
    en: ['We couldn’t reach the server.', 'Check the internet connection and try again.'],
    ta: ['சர்வரை அடைய முடியவில்லை.', 'இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயலுங்கள்.'],
    hi: ['सर्वर तक नहीं पहुँच सके।', 'इंटरनेट कनेक्शन जाँचकर फिर कोशिश कीजिए।'],
  },
};

const SCRIPT_NAMES = {
  tamil: { en: 'Tamil', ta: 'தமிழ்', hi: 'तमिल' },
  devanagari: { en: 'Devanagari', ta: 'தேவநாகரி', hi: 'देवनागरी' },
};

const KEY = 'saathi.lang';
let current = (() => {
  try { return LANGS[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : 'en'; } catch { return 'en'; }
})();
const listeners = new Set();

export const lang = () => current;

export function setLang(code) {
  if (!LANGS[code]) return;
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* private mode */ }
  document.documentElement.lang = code;
  applyStatic();
  for (const fn of listeners) fn(code);
}

export const onLangChange = (fn) => listeners.add(fn);

const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

/** Interface string. Falls back to English if a translation is missing. */
export function t(key, vars) {
  const entry = UI[key];
  if (!entry) return key;
  return fill(entry[current] || entry.en, vars);
}

/** Picks the current language out of a {en, ta, hi} object (from catalog.js). */
export const pick = (obj, vars) => fill((obj && (obj[current] || obj.en)) || '', vars);

/** Failure / status explanation: { what, next } or null for unknown codes. */
export function explain(code, vars = {}) {
  const base = code?.startsWith('not_ready_') ? 'not_ready' : code;
  const entry = MSG[base];
  if (!entry) return null;
  const v = { ...vars };
  if (v.script) v.script = SCRIPT_NAMES[v.script]?.[current] || v.script;
  const [what, next] = entry[current] || entry.en;
  return { what: fill(what, v), next: fill(next, v) };
}

/** Sets text on every [data-i18n] element; [data-i18n-attr="placeholder"] targets an attribute. */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const attr = el.dataset.i18nAttr;
    const text = t(el.dataset.i18n);
    if (attr) el.setAttribute(attr, text);
    else el.textContent = text;
  }
}
