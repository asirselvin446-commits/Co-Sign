// GENERATED FILE. Do not edit by hand.
// Source: shared/catalog.json. Regenerate with `pnpm catalog:gen`.

// ignore_for_file: lines_longer_than_80_chars, constant_identifier_names

const List<String> kCatalogLanguages = <String>['en', 'ta', 'hi'];

class ErrorText {
  const ErrorText(this.cause, this.next);
  final String cause;
  final String next;
}

class ErrorEntry {
  const ErrorEntry({
    required this.code,
    required this.http,
    required this.tier,
    required this.generic,
    required this.origin,
    required this.params,
    required this.text,
  });
  final String code;
  final int http;
  final String tier;
  final String? generic;
  final String origin;
  final List<String> params;
  final Map<String, ErrorText> text;
}

class ErrorCodes {
  ErrorCodes._();
  static const String PASSKEY_CANCELLED = 'PASSKEY_CANCELLED';
  static const String PASSKEY_TIMED_OUT = 'PASSKEY_TIMED_OUT';
  static const String NO_SCREEN_LOCK = 'NO_SCREEN_LOCK';
  static const String SCREEN_LOCK_CANCELLED = 'SCREEN_LOCK_CANCELLED';
  static const String SCREEN_LOCK_LOCKED_OUT = 'SCREEN_LOCK_LOCKED_OUT';
  static const String PASSKEY_NOT_ON_DEVICE = 'PASSKEY_NOT_ON_DEVICE';
  static const String CREDENTIAL_ALREADY_REGISTERED = 'CREDENTIAL_ALREADY_REGISTERED';
  static const String PASSKEY_UNSUPPORTED = 'PASSKEY_UNSUPPORTED';
  static const String PASSKEY_FAILED = 'PASSKEY_FAILED';
  static const String CODE_NON_ASCII_DIGITS = 'CODE_NON_ASCII_DIGITS';
  static const String CODE_EXPIRED = 'CODE_EXPIRED';
  static const String CODE_INVALID = 'CODE_INVALID';
  static const String TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS';
  static const String NETWORK_ERROR = 'NETWORK_ERROR';
  static const String GUARDIAN_DENIED = 'GUARDIAN_DENIED';
  static const String COOLOFF_ACTIVE = 'COOLOFF_ACTIVE';
  static const String RECOVERY_PENDING = 'RECOVERY_PENDING';
  static const String SIGN_IN_FAILED = 'SIGN_IN_FAILED';
  static const String SESSION_EXPIRED = 'SESSION_EXPIRED';
  static const String DEVICE_REVOKED = 'DEVICE_REVOKED';
  static const String NOT_ALLOWED = 'NOT_ALLOWED';
  static const String INVALID_INPUT = 'INVALID_INPUT';
  static const String NOT_FOUND = 'NOT_FOUND';
  static const String STEPUP_REQUIRED = 'STEPUP_REQUIRED';
  static const String HANDLE_TAKEN = 'HANDLE_TAKEN';
  static const String GUARDIAN_LIMIT_REACHED = 'GUARDIAN_LIMIT_REACHED';
  static const String INVITE_INVALID = 'INVITE_INVALID';
  static const String CANNOT_GUARD_SELF = 'CANNOT_GUARD_SELF';
  static const String ALREADY_GUARDIAN = 'ALREADY_GUARDIAN';
  static const String REQUEST_EXPIRED = 'REQUEST_EXPIRED';
  static const String REQUEST_ALREADY_DECIDED = 'REQUEST_ALREADY_DECIDED';
  static const String ACTION_NOT_COMPLETED = 'ACTION_NOT_COMPLETED';
  static const String RECOVERY_NOT_COMPLETED = 'RECOVERY_NOT_COMPLETED';
  static const String CONSENT_REQUIRED = 'CONSENT_REQUIRED';
  static const String PROTECTION_OFF = 'PROTECTION_OFF';
  static const String INTERNAL_ERROR = 'INTERNAL_ERROR';
  static const String SIGNIN_BLOCKED_FAKE_SITE = 'SIGNIN_BLOCKED_FAKE_SITE';
  static const String SIGNIN_EXPIRED = 'SIGNIN_EXPIRED';
  static const String SIGNIN_SHOW_REFUSED_ON_CALL = 'SIGNIN_SHOW_REFUSED_ON_CALL';
  static const String SIGNIN_NO_GUARDIAN = 'SIGNIN_NO_GUARDIAN';
}

const Map<String, ErrorEntry> kErrorCatalog = <String, ErrorEntry>{
  'PASSKEY_CANCELLED': ErrorEntry(
    code: 'PASSKEY_CANCELLED',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You closed the passkey prompt before it finished.", "Tap Try again and confirm with your fingerprint, face or screen lock."),
      'ta': ErrorText("பாஸ்கீ சாளரம் முடிவதற்குள் நீங்கள் அதை மூடிவிட்டீர்கள்.", "மீண்டும் முயல் என்பதைத் தட்டி, கைரேகை, முகம் அல்லது திரைப் பூட்டு மூலம் உறுதிசெய்யுங்கள்."),
      'hi': ErrorText("पासकी वाली विंडो पूरी होने से पहले आपने उसे बंद कर दिया।", "फिर से कोशिश करें पर टैप करें और फ़िंगरप्रिंट, चेहरे या स्क्रीन लॉक से पुष्टि करें।"),
    },
  ),
  'PASSKEY_TIMED_OUT': ErrorEntry(
    code: 'PASSKEY_TIMED_OUT',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("The passkey prompt waited too long and closed.", "Tap Try again and confirm within a minute."),
      'ta': ErrorText("பாஸ்கீ சாளரம் நீண்ட நேரம் காத்திருந்து மூடப்பட்டது.", "மீண்டும் முயல் என்பதைத் தட்டி, ஒரு நிமிடத்திற்குள் உறுதிசெய்யுங்கள்."),
      'hi': ErrorText("पासकी वाली विंडो बहुत देर तक इंतज़ार करके बंद हो गई।", "फिर से कोशिश करें पर टैप करें और एक मिनट के अंदर पुष्टि करें।"),
    },
  ),
  'NO_SCREEN_LOCK': ErrorEntry(
    code: 'NO_SCREEN_LOCK',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This phone has no screen lock or fingerprint set up, so it cannot confirm it is really you.", "Open your phone Settings, set a PIN, pattern or fingerprint, then come back."),
      'ta': ErrorText("இந்தத் தொலைபேசியில் திரைப் பூட்டு அல்லது கைரேகை அமைக்கப்படவில்லை, அதனால் இது நீங்கள்தான் என்பதை உறுதிசெய்ய முடியாது.", "தொலைபேசி அமைப்புகளைத் திறந்து PIN, பேட்டர்ன் அல்லது கைரேகையை அமைத்துவிட்டுத் திரும்பி வாருங்கள்."),
      'hi': ErrorText("इस फ़ोन में स्क्रीन लॉक या फ़िंगरप्रिंट सेट नहीं है, इसलिए यह पक्का नहीं कर सकता कि यह आप ही हैं।", "फ़ोन की सेटिंग खोलें, PIN, पैटर्न या फ़िंगरप्रिंट सेट करें, फिर वापस आएँ।"),
    },
  ),
  'SCREEN_LOCK_CANCELLED': ErrorEntry(
    code: 'SCREEN_LOCK_CANCELLED',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You closed the fingerprint or PIN check, so nothing was sent.", "Tap the button again and confirm with your fingerprint, face or phone PIN."),
      'ta': ErrorText("கைரேகை அல்லது PIN சரிபார்ப்பை மூடிவிட்டீர்கள், அதனால் எதுவும் அனுப்பப்படவில்லை.", "பொத்தானை மீண்டும் தட்டி, கைரேகை, முகம் அல்லது தொலைபேசி PIN மூலம் உறுதிசெய்யுங்கள்."),
      'hi': ErrorText("आपने फ़िंगरप्रिंट या PIN जाँच बंद कर दी, इसलिए कुछ नहीं भेजा गया।", "बटन फिर से टैप करें और फ़िंगरप्रिंट, चेहरे या फ़ोन PIN से पुष्टि करें।"),
    },
  ),
  'SCREEN_LOCK_LOCKED_OUT': ErrorEntry(
    code: 'SCREEN_LOCK_LOCKED_OUT',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Too many tries, so your phone has paused the fingerprint check for now.", "Wait a minute and try again, or unlock with your phone PIN."),
      'ta': ErrorText("பல முறை முயன்றதால், உங்கள் தொலைபேசி கைரேகை சரிபார்ப்பைத் தற்காலிகமாக நிறுத்தியுள்ளது.", "ஒரு நிமிடம் காத்திருந்து மீண்டும் முயலுங்கள், அல்லது தொலைபேசி PIN மூலம் திறவுங்கள்."),
      'hi': ErrorText("बहुत ज़्यादा कोशिशों के कारण फ़ोन ने अभी फ़िंगरप्रिंट जाँच रोक दी है।", "एक मिनट रुककर फिर कोशिश करें, या फ़ोन PIN से अनलॉक करें।"),
    },
  ),
  'PASSKEY_NOT_ON_DEVICE': ErrorEntry(
    code: 'PASSKEY_NOT_ON_DEVICE',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("No Co-Sign passkey was found on this phone.", "Sign in on your usual phone, or tap I lost my phone to recover with your guardians."),
      'ta': ErrorText("இந்தத் தொலைபேசியில் Co-Sign பாஸ்கீ எதுவும் இல்லை.", "உங்கள் வழக்கமான தொலைபேசியில் உள்நுழையுங்கள், அல்லது பாதுகாவலர்களின் உதவியுடன் மீட்க என் தொலைபேசி தொலைந்தது என்பதைத் தட்டுங்கள்."),
      'hi': ErrorText("इस फ़ोन पर कोई Co-Sign पासकी नहीं मिली।", "अपने रोज़ वाले फ़ोन से साइन इन करें, या संरक्षकों की मदद से खाता वापस पाने के लिए मेरा फ़ोन खो गया पर टैप करें।"),
    },
  ),
  'CREDENTIAL_ALREADY_REGISTERED': ErrorEntry(
    code: 'CREDENTIAL_ALREADY_REGISTERED',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This phone already has a passkey for this account.", "Tap Sign in instead of creating a new account."),
      'ta': ErrorText("இந்தக் கணக்கிற்கான பாஸ்கீ ஏற்கனவே இந்தத் தொலைபேசியில் உள்ளது.", "புதிய கணக்கை உருவாக்குவதற்குப் பதிலாக உள்நுழை என்பதைத் தட்டுங்கள்."),
      'hi': ErrorText("इस फ़ोन में इस खाते की पासकी पहले से है।", "नया खाता बनाने के बजाय साइन इन पर टैप करें।"),
    },
  ),
  'PASSKEY_UNSUPPORTED': ErrorEntry(
    code: 'PASSKEY_UNSUPPORTED',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This phone cannot use passkeys yet.", "Update your phone software and Google Play services, or use another phone."),
      'ta': ErrorText("இந்தத் தொலைபேசியில் இன்னும் பாஸ்கீயைப் பயன்படுத்த முடியாது.", "தொலைபேசி மென்பொருளையும் Google Play சேவைகளையும் புதுப்பியுங்கள், அல்லது வேறு தொலைபேசியைப் பயன்படுத்துங்கள்."),
      'hi': ErrorText("यह फ़ोन अभी पासकी इस्तेमाल नहीं कर सकता।", "फ़ोन का सॉफ़्टवेयर और Google Play सेवाएँ अपडेट करें, या दूसरा फ़ोन इस्तेमाल करें।"),
    },
  ),
  'PASSKEY_FAILED': ErrorEntry(
    code: 'PASSKEY_FAILED',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("The passkey prompt did not work this time.", "Tap Try again. If it keeps happening, restart your phone."),
      'ta': ErrorText("இந்த முறை பாஸ்கீ சாளரம் வேலை செய்யவில்லை.", "மீண்டும் முயல் என்பதைத் தட்டுங்கள். தொடர்ந்து நடந்தால், தொலைபேசியை மறுதொடக்கம் செய்யுங்கள்."),
      'hi': ErrorText("इस बार पासकी वाली विंडो ने काम नहीं किया।", "फिर से कोशिश करें पर टैप करें। ऐसा बार-बार हो तो फ़ोन रीस्टार्ट करें।"),
    },
  ),
  'CODE_NON_ASCII_DIGITS': ErrorEntry(
    code: 'CODE_NON_ASCII_DIGITS',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'both',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("The code was typed in Tamil or Hindi digits.", "Tap Convert to change it to 0 to 9 digits and send it again."),
      'ta': ErrorText("குறியீடு தமிழ் அல்லது இந்தி எண்களில் தட்டச்சு செய்யப்பட்டது.", "0 முதல் 9 வரையிலான எண்களாக மாற்ற மாற்று என்பதைத் தட்டி மீண்டும் அனுப்புங்கள்."),
      'hi': ErrorText("कोड तमिल या हिंदी अंकों में टाइप किया गया था।", "उसे 0 से 9 वाले अंकों में बदलने के लिए बदलें पर टैप करें और फिर से भेजें।"),
    },
  ),
  'CODE_EXPIRED': ErrorEntry(
    code: 'CODE_EXPIRED',
    http: 410,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This code has expired.", "Ask the person who shared it to create a new one."),
      'ta': ErrorText("இந்தக் குறியீட்டின் காலம் முடிந்துவிட்டது.", "அதைப் பகிர்ந்தவரிடம் புதிய குறியீட்டை உருவாக்கச் சொல்லுங்கள்."),
      'hi': ErrorText("इस कोड की समय-सीमा खत्म हो गई है।", "जिसने इसे भेजा था, उससे नया कोड बनाने को कहें।"),
    },
  ),
  'CODE_INVALID': ErrorEntry(
    code: 'CODE_INVALID',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This code is not correct.", "Check each digit and try again."),
      'ta': ErrorText("இந்தக் குறியீடு சரியானது அல்ல.", "ஒவ்வொரு எண்ணையும் சரிபார்த்து மீண்டும் முயலுங்கள்."),
      'hi': ErrorText("यह कोड सही नहीं है।", "हर अंक जाँचें और फिर से कोशिश करें।"),
    },
  ),
  'TOO_MANY_ATTEMPTS': ErrorEntry(
    code: 'TOO_MANY_ATTEMPTS',
    http: 429,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>['wait'],
    text: <String, ErrorText>{
      'en': ErrorText("There were too many tries in a short time.", "Wait {wait} and try again."),
      'ta': ErrorText("குறுகிய நேரத்தில் அதிக முறை முயற்சிக்கப்பட்டது.", "{wait} காத்திருந்து மீண்டும் முயலுங்கள்."),
      'hi': ErrorText("कम समय में बहुत ज़्यादा बार कोशिश की गई।", "{wait} रुकें और फिर से कोशिश करें।"),
    },
  ),
  'NETWORK_ERROR': ErrorEntry(
    code: 'NETWORK_ERROR',
    http: 503,
    tier: 'public',
    generic: null,
    origin: 'client',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("We could not reach Co-Sign. Your internet may be off or slow.", "Check mobile data or Wi-Fi and tap Try again."),
      'ta': ErrorText("Co-Sign-ஐ அணுக முடியவில்லை. இணையம் இல்லாமலோ மெதுவாகவோ இருக்கலாம்.", "மொபைல் டேட்டா அல்லது வைஃபையைச் சரிபார்த்து மீண்டும் முயல் என்பதைத் தட்டுங்கள்."),
      'hi': ErrorText("Co-Sign तक नहीं पहुँच पाए। आपका इंटरनेट बंद या धीमा हो सकता है।", "मोबाइल डेटा या वाई-फ़ाई जाँचें और फिर से कोशिश करें पर टैप करें।"),
    },
  ),
  'GUARDIAN_DENIED': ErrorEntry(
    code: 'GUARDIAN_DENIED',
    http: 403,
    tier: 'detailed',
    generic: 'ACTION_NOT_COMPLETED',
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Your guardian said no to this action.", "Call your guardian yourself on a number you already know before trying again."),
      'ta': ErrorText("உங்கள் பாதுகாவலர் இந்தச் செயலுக்கு மறுப்புத் தெரிவித்தார்.", "மீண்டும் முயல்வதற்கு முன், உங்களுக்கு ஏற்கனவே தெரிந்த எண்ணில் நீங்களே உங்கள் பாதுகாவலரை அழையுங்கள்."),
      'hi': ErrorText("आपके संरक्षक ने इस काम के लिए मना कर दिया।", "फिर से कोशिश करने से पहले, अपने संरक्षक को ख़ुद ऐसे नंबर पर कॉल करें जो आपको पहले से पता है।"),
    },
  ),
  'COOLOFF_ACTIVE': ErrorEntry(
    code: 'COOLOFF_ACTIVE',
    http: 423,
    tier: 'detailed',
    generic: 'ACTION_NOT_COMPLETED',
    origin: 'server',
    params: <String>['until'],
    text: <String, ErrorText>{
      'en': ErrorText("This action is paused for your safety until {until}.", "If anyone is pressuring you, hang up now. You can cancel this action at any time."),
      'ta': ErrorText("உங்கள் பாதுகாப்பிற்காக இந்தச் செயல் {until} வரை நிறுத்தி வைக்கப்பட்டுள்ளது.", "யாராவது உங்களை அவசரப்படுத்தினால், இப்போதே அழைப்பைத் துண்டியுங்கள். இந்தச் செயலை எப்போது வேண்டுமானாலும் ரத்து செய்யலாம்."),
      'hi': ErrorText("आपकी सुरक्षा के लिए यह काम {until} तक रोका गया है।", "अगर कोई आप पर दबाव डाल रहा है, तो अभी कॉल काट दें। आप इस काम को कभी भी रद्द कर सकते हैं।"),
    },
  ),
  'RECOVERY_PENDING': ErrorEntry(
    code: 'RECOVERY_PENDING',
    http: 409,
    tier: 'detailed',
    generic: 'ACTION_NOT_COMPLETED',
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Someone has asked to move this account to a new phone.", "If this was not you, tap Cancel recovery now."),
      'ta': ErrorText("இந்தக் கணக்கைப் புதிய தொலைபேசிக்கு மாற்ற ஒருவர் கோரியுள்ளார்.", "இது நீங்கள் இல்லையென்றால், இப்போதே மீட்பை ரத்துசெய் என்பதைத் தட்டுங்கள்."),
      'hi': ErrorText("किसी ने इस खाते को नए फ़ोन पर ले जाने का अनुरोध किया है।", "अगर यह आप नहीं थे, तो अभी रिकवरी रद्द करें पर टैप करें।"),
    },
  ),
  'SIGN_IN_FAILED': ErrorEntry(
    code: 'SIGN_IN_FAILED',
    http: 401,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("We could not sign you in with that passkey.", "Try again, or tap I lost my phone."),
      'ta': ErrorText("அந்தப் பாஸ்கீ மூலம் உங்களை உள்நுழைய வைக்க முடியவில்லை.", "மீண்டும் முயலுங்கள், அல்லது என் தொலைபேசி தொலைந்தது என்பதைத் தட்டுங்கள்."),
      'hi': ErrorText("उस पासकी से आपको साइन इन नहीं कर पाए।", "फिर से कोशिश करें, या मेरा फ़ोन खो गया पर टैप करें।"),
    },
  ),
  'SESSION_EXPIRED': ErrorEntry(
    code: 'SESSION_EXPIRED',
    http: 401,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You were signed out to keep your account safe.", "Sign in again with your passkey."),
      'ta': ErrorText("உங்கள் கணக்கின் பாதுகாப்பிற்காக நீங்கள் வெளியேற்றப்பட்டீர்கள்.", "உங்கள் பாஸ்கீ மூலம் மீண்டும் உள்நுழையுங்கள்."),
      'hi': ErrorText("आपके खाते की सुरक्षा के लिए आपको साइन आउट कर दिया गया।", "अपनी पासकी से फिर से साइन इन करें।"),
    },
  ),
  'DEVICE_REVOKED': ErrorEntry(
    code: 'DEVICE_REVOKED',
    http: 401,
    tier: 'detailed',
    generic: 'SESSION_EXPIRED',
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This phone was removed from your account.", "Sign in again, or recover your account with your guardians."),
      'ta': ErrorText("இந்தத் தொலைபேசி உங்கள் கணக்கிலிருந்து நீக்கப்பட்டது.", "மீண்டும் உள்நுழையுங்கள், அல்லது பாதுகாவலர்கள் உதவியுடன் கணக்கை மீட்டெடுங்கள்."),
      'hi': ErrorText("यह फ़ोन आपके खाते से हटा दिया गया है।", "फिर से साइन इन करें, या संरक्षकों की मदद से अपना खाता वापस पाएँ।"),
    },
  ),
  'NOT_ALLOWED': ErrorEntry(
    code: 'NOT_ALLOWED',
    http: 403,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This action is not allowed here.", "Use a phone that is already set up for your account."),
      'ta': ErrorText("இந்தச் செயல் இங்கே அனுமதிக்கப்படவில்லை.", "உங்கள் கணக்கிற்கு ஏற்கனவே அமைக்கப்பட்ட தொலைபேசியைப் பயன்படுத்துங்கள்."),
      'hi': ErrorText("यह काम यहाँ से करने की अनुमति नहीं है।", "ऐसा फ़ोन इस्तेमाल करें जो आपके खाते के लिए पहले से सेट है।"),
    },
  ),
  'INVALID_INPUT': ErrorEntry(
    code: 'INVALID_INPUT',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Some details were missing or not in the right format.", "Check what you entered and try again."),
      'ta': ErrorText("சில விவரங்கள் இல்லை அல்லது சரியான வடிவத்தில் இல்லை.", "நீங்கள் உள்ளிட்டதைச் சரிபார்த்து மீண்டும் முயலுங்கள்."),
      'hi': ErrorText("कुछ जानकारी छूट गई है या सही रूप में नहीं है।", "आपने जो भरा है उसे जाँचें और फिर से कोशिश करें।"),
    },
  ),
  'NOT_FOUND': ErrorEntry(
    code: 'NOT_FOUND',
    http: 404,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("We could not find what you asked for.", "Go back and try again."),
      'ta': ErrorText("நீங்கள் கேட்டதைக் கண்டுபிடிக்க முடியவில்லை.", "பின்சென்று மீண்டும் முயலுங்கள்."),
      'hi': ErrorText("आपने जो माँगा वह हमें नहीं मिला।", "वापस जाएँ और फिर से कोशिश करें।"),
    },
  ),
  'STEPUP_REQUIRED': ErrorEntry(
    code: 'STEPUP_REQUIRED',
    http: 428,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This change needs an extra safety check.", "Tap Continue to confirm with your passkey."),
      'ta': ErrorText("இந்த மாற்றத்திற்குக் கூடுதல் பாதுகாப்புச் சோதனை தேவை.", "உங்கள் பாஸ்கீ மூலம் உறுதிசெய்ய தொடர் என்பதைத் தட்டுங்கள்."),
      'hi': ErrorText("इस बदलाव के लिए एक अतिरिक्त सुरक्षा जाँच चाहिए।", "अपनी पासकी से पुष्टि करने के लिए आगे बढ़ें पर टैप करें।"),
    },
  ),
  'HANDLE_TAKEN': ErrorEntry(
    code: 'HANDLE_TAKEN',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("That account name is already in use.", "Choose a different account name."),
      'ta': ErrorText("அந்தக் கணக்குப் பெயர் ஏற்கனவே பயன்பாட்டில் உள்ளது.", "வேறு கணக்குப் பெயரைத் தேர்ந்தெடுங்கள்."),
      'hi': ErrorText("यह खाता नाम पहले से इस्तेमाल में है।", "कोई दूसरा खाता नाम चुनें।"),
    },
  ),
  'GUARDIAN_LIMIT_REACHED': ErrorEntry(
    code: 'GUARDIAN_LIMIT_REACHED',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You already have the most guardians allowed, which is 5.", "Remove a guardian before inviting a new one."),
      'ta': ErrorText("அனுமதிக்கப்பட்ட அதிகபட்சமான 5 பாதுகாவலர்கள் ஏற்கனவே உங்களிடம் உள்ளனர்.", "புதியவரை அழைப்பதற்கு முன் ஒரு பாதுகாவலரை நீக்குங்கள்."),
      'hi': ErrorText("आपके पास पहले से अधिकतम 5 संरक्षक हैं।", "नया संरक्षक जोड़ने से पहले किसी एक को हटाएँ।"),
    },
  ),
  'INVITE_INVALID': ErrorEntry(
    code: 'INVITE_INVALID',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This invite is not valid or has already been used.", "Ask the person to send you a new invite."),
      'ta': ErrorText("இந்த அழைப்பு செல்லாது அல்லது ஏற்கனவே பயன்படுத்தப்பட்டது.", "புதிய அழைப்பை அனுப்பும்படி அந்த நபரிடம் கேளுங்கள்."),
      'hi': ErrorText("यह निमंत्रण मान्य नहीं है या पहले ही इस्तेमाल हो चुका है।", "उस व्यक्ति से नया निमंत्रण भेजने को कहें।"),
    },
  ),
  'CANNOT_GUARD_SELF': ErrorEntry(
    code: 'CANNOT_GUARD_SELF',
    http: 400,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You cannot be your own guardian.", "Send the invite to someone you trust."),
      'ta': ErrorText("நீங்களே உங்கள் பாதுகாவலராக இருக்க முடியாது.", "நீங்கள் நம்பும் ஒருவருக்கு அழைப்பை அனுப்புங்கள்."),
      'hi': ErrorText("आप अपने ही संरक्षक नहीं बन सकते।", "निमंत्रण किसी ऐसे व्यक्ति को भेजें जिस पर आपको भरोसा है।"),
    },
  ),
  'ALREADY_GUARDIAN': ErrorEntry(
    code: 'ALREADY_GUARDIAN',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You are already a guardian for this person.", "Nothing else is needed. You will get their requests here."),
      'ta': ErrorText("நீங்கள் ஏற்கனவே இவருக்குப் பாதுகாவலராக இருக்கிறீர்கள்.", "வேறு எதுவும் தேவையில்லை. அவர்களின் கோரிக்கைகள் இங்கே வரும்."),
      'hi': ErrorText("आप पहले से इस व्यक्ति के संरक्षक हैं।", "और कुछ करने की ज़रूरत नहीं है। उनके अनुरोध यहीं आएँगे।"),
    },
  ),
  'REQUEST_EXPIRED': ErrorEntry(
    code: 'REQUEST_EXPIRED',
    http: 410,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This request has expired.", "Start the action again if you still need it."),
      'ta': ErrorText("இந்தக் கோரிக்கையின் காலம் முடிந்துவிட்டது.", "இன்னும் தேவைப்பட்டால், செயலை மீண்டும் தொடங்குங்கள்."),
      'hi': ErrorText("इस अनुरोध की समय-सीमा खत्म हो गई है।", "अगर अब भी ज़रूरत है, तो काम फिर से शुरू करें।"),
    },
  ),
  'REQUEST_ALREADY_DECIDED': ErrorEntry(
    code: 'REQUEST_ALREADY_DECIDED',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This request has already been answered.", "No action is needed from you."),
      'ta': ErrorText("இந்தக் கோரிக்கைக்கு ஏற்கனவே பதில் அளிக்கப்பட்டது.", "நீங்கள் எதுவும் செய்ய வேண்டியதில்லை."),
      'hi': ErrorText("इस अनुरोध का जवाब पहले ही दिया जा चुका है।", "आपको कुछ करने की ज़रूरत नहीं है।"),
    },
  ),
  'ACTION_NOT_COMPLETED': ErrorEntry(
    code: 'ACTION_NOT_COMPLETED',
    http: 403,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This action could not be completed.", "Open Co-Sign on your usual phone to see why."),
      'ta': ErrorText("இந்தச் செயலை முடிக்க முடியவில்லை.", "காரணத்தை அறிய உங்கள் வழக்கமான தொலைபேசியில் Co-Sign-ஐத் திறவுங்கள்."),
      'hi': ErrorText("यह काम पूरा नहीं हो सका।", "वजह जानने के लिए अपने रोज़ वाले फ़ोन पर Co-Sign खोलें।"),
    },
  ),
  'RECOVERY_NOT_COMPLETED': ErrorEntry(
    code: 'RECOVERY_NOT_COMPLETED',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This recovery could not be completed.", "Ask your guardians to help you start again."),
      'ta': ErrorText("இந்த மீட்பை முடிக்க முடியவில்லை.", "மீண்டும் தொடங்க உங்கள் பாதுகாவலர்களின் உதவியைக் கேளுங்கள்."),
      'hi': ErrorText("यह रिकवरी पूरी नहीं हो सकी।", "फिर से शुरू करने के लिए अपने संरक्षकों से मदद माँगें।"),
    },
  ),
  'CONSENT_REQUIRED': ErrorEntry(
    code: 'CONSENT_REQUIRED',
    http: 403,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You have not agreed to safety checks on this phone yet.", "Open Settings, then Safety checks, and choose what to allow."),
      'ta': ErrorText("இந்தத் தொலைபேசியில் பாதுகாப்புச் சோதனைகளுக்கு நீங்கள் இன்னும் ஒப்புதல் அளிக்கவில்லை.", "அமைப்புகளில் பாதுகாப்புச் சோதனைகள் பகுதியைத் திறந்து, எதை அனுமதிப்பது எனத் தேர்ந்தெடுங்கள்."),
      'hi': ErrorText("आपने इस फ़ोन पर सुरक्षा जाँच की अनुमति अभी नहीं दी है।", "सेटिंग में सुरक्षा जाँच खोलें और चुनें कि किसकी अनुमति देनी है।"),
    },
  ),
  'PROTECTION_OFF': ErrorEntry(
    code: 'PROTECTION_OFF',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Family protection is not switched on for their phone, so it cannot be paused or locked from here.", "Call them, and ask them to open Co-Sign and turn on family protection."),
      'ta': ErrorText("அவரது போனில் குடும்பப் பாதுகாப்பு இயக்கப்படவில்லை. அதனால் இங்கிருந்து அதை நிறுத்தவோ பூட்டவோ முடியாது.", "அவரை அழைத்து, Co-Sign-ஐத் திறந்து குடும்பப் பாதுகாப்பை இயக்கச் சொல்லுங்கள்."),
      'hi': ErrorText("उनके फ़ोन पर पारिवारिक सुरक्षा चालू नहीं है, इसलिए उसे यहाँ से रोका या लॉक नहीं किया जा सकता।", "उन्हें कॉल करें और Co-Sign खोलकर पारिवारिक सुरक्षा चालू करने को कहें।"),
    },
  ),
  'INTERNAL_ERROR': ErrorEntry(
    code: 'INTERNAL_ERROR',
    http: 500,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Something went wrong on our side.", "Try again in a few minutes."),
      'ta': ErrorText("எங்கள் பக்கத்தில் ஏதோ தவறு நடந்துவிட்டது.", "சில நிமிடங்கள் கழித்து மீண்டும் முயலுங்கள்."),
      'hi': ErrorText("हमारी तरफ़ से कुछ गड़बड़ हो गई।", "कुछ मिनट बाद फिर से कोशिश करें।"),
    },
  ),
  'SIGNIN_BLOCKED_FAKE_SITE': ErrorEntry(
    code: 'SIGNIN_BLOCKED_FAKE_SITE',
    http: 422,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This looks like a fake website pretending to be a bank or a well-known company, so your guardian was not asked to sign you in.", "Close this page. Do not type any password. Call your guardian on a number you know."),
      'ta': ErrorText("இது வங்கி அல்லது பிரபல நிறுவனம் போல நடிக்கும் போலி இணையதளம் போலத் தெரிகிறது. அதனால் உங்களை உள்நுழைய வைக்க உங்கள் பாதுகாவலரிடம் கேட்கப்படவில்லை.", "இந்தப் பக்கத்தை மூடுங்கள். எந்தக் கடவுச்சொல்லையும் தட்டச்சு செய்யாதீர்கள். உங்களுக்குத் தெரிந்த எண்ணில் உங்கள் பாதுகாவலரை அழையுங்கள்."),
      'hi': ErrorText("यह किसी बैंक या जानी-मानी कंपनी होने का दिखावा करने वाली नकली वेबसाइट लगती है, इसलिए आपके संरक्षक से साइन-इन करवाने को नहीं कहा गया।", "यह पेज बंद करें। कोई पासवर्ड न डालें। किसी जाने-पहचाने नंबर पर अपने संरक्षक को कॉल करें।"),
    },
  ),
  'SIGNIN_EXPIRED': ErrorEntry(
    code: 'SIGNIN_EXPIRED',
    http: 410,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Your guardian did not answer in time.", "Try again, or call your guardian on a number you know."),
      'ta': ErrorText("உங்கள் பாதுகாவலர் நேரத்தில் பதிலளிக்கவில்லை.", "மீண்டும் முயலுங்கள், அல்லது உங்களுக்குத் தெரிந்த எண்ணில் உங்கள் பாதுகாவலரை அழையுங்கள்."),
      'hi': ErrorText("आपके संरक्षक ने समय पर जवाब नहीं दिया।", "फिर से कोशिश करें, या किसी जाने-पहचाने नंबर पर अपने संरक्षक को कॉल करें।"),
    },
  ),
  'SIGNIN_SHOW_REFUSED_ON_CALL': ErrorEntry(
    code: 'SIGNIN_SHOW_REFUSED_ON_CALL',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You are on a call with a number that is not in your contacts, so the password cannot be shown now. Scammers ask people to read passwords out.", "Hang up first. Then try again."),
      'ta': ErrorText("உங்கள் தொடர்புகளில் இல்லாத எண்ணுடன் நீங்கள் அழைப்பில் இருக்கிறீர்கள், அதனால் இப்போது கடவுச்சொல்லைக் காட்ட முடியாது. மோசடிக்காரர்கள் கடவுச்சொல்லைப் படிக்கச் சொல்வார்கள்.", "முதலில் அழைப்பைத் துண்டியுங்கள். பிறகு மீண்டும் முயலுங்கள்."),
      'hi': ErrorText("आप ऐसे नंबर से कॉल पर हैं जो आपके संपर्कों में नहीं है, इसलिए अभी पासवर्ड नहीं दिखाया जा सकता। धोखेबाज़ लोगों से पासवर्ड पढ़कर सुनाने को कहते हैं।", "पहले कॉल काटें। फिर से कोशिश करें।"),
    },
  ),
  'SIGNIN_NO_GUARDIAN': ErrorEntry(
    code: 'SIGNIN_NO_GUARDIAN',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("You do not have a guardian yet, so nobody can be asked to sign you in.", "Open Co-Sign, go to Guardians and invite someone you trust."),
      'ta': ErrorText("உங்களுக்கு இன்னும் பாதுகாவலர் இல்லை, அதனால் உங்களை உள்நுழைய வைக்க யாரிடமும் கேட்க முடியாது.", "Co-Sign-ஐத் திறந்து, பாதுகாவலர்கள் பகுதிக்குச் சென்று, நீங்கள் நம்பும் ஒருவரை அழையுங்கள்."),
      'hi': ErrorText("आपका अभी कोई संरक्षक नहीं है, इसलिए किसी से साइन-इन करवाने को नहीं कहा जा सकता।", "Co-Sign खोलें, संरक्षक में जाएँ और किसी भरोसेमंद व्यक्ति को आमंत्रित करें।"),
    },
  ),
};

const Map<String, Map<String, String>> kRiskReasons = <String, Map<String, String>>{
  'call_unknown_number': <String, String>{'en': "You are on a phone call with a number that is not in your contacts.", 'ta': "உங்கள் தொடர்புகளில் இல்லாத எண்ணுடன் நீங்கள் இப்போது தொலைபேசியில் பேசுகிறீர்கள்.", 'hi': "आप अभी ऐसे नंबर से फ़ोन पर बात कर रहे हैं जो आपके संपर्कों में नहीं है।"},
  'remote_access_app': <String, String>{'en': "An app that lets someone else control your phone is installed or running.", 'ta': "வேறொருவர் உங்கள் தொலைபேசியைக் கட்டுப்படுத்த உதவும் செயலி நிறுவப்பட்டுள்ளது அல்லது இயங்குகிறது.", 'hi': "ऐसा ऐप इंस्टॉल है या चल रहा है जिससे कोई और आपका फ़ोन चला सकता है।"},
  'screen_capture': <String, String>{'en': "Your screen is being recorded or shared.", 'ta': "உங்கள் திரை பதிவு செய்யப்படுகிறது அல்லது பகிரப்படுகிறது.", 'hi': "आपकी स्क्रीन रिकॉर्ड या शेयर की जा रही है।"},
  'sim_changed_72h': <String, String>{'en': "The SIM card in this phone changed in the last 3 days.", 'ta': "கடந்த 3 நாட்களில் இந்தத் தொலைபேசியின் சிம் கார்டு மாற்றப்பட்டுள்ளது.", 'hi': "पिछले 3 दिनों में इस फ़ोन का सिम कार्ड बदला गया है।"},
  'code_pasted': <String, String>{'en': "A code was pasted instead of typed. This often happens when someone else sends it to you.", 'ta': "குறியீடு தட்டச்சு செய்யப்படாமல் ஒட்டப்பட்டது. வேறொருவர் அனுப்பும்போது பொதுவாக இப்படி நடக்கும்.", 'hi': "कोड टाइप करने के बजाय पेस्ट किया गया। ऐसा अक्सर तब होता है जब कोई और उसे भेजता है।"},
  'new_device_24h': <String, String>{'en': "This phone was added to your account less than a day ago.", 'ta': "இந்தத் தொலைபேசி ஒரு நாளுக்குள் உங்கள் கணக்கில் சேர்க்கப்பட்டது.", 'hi': "यह फ़ोन एक दिन से कम समय पहले आपके खाते में जोड़ा गया था।"},
  'late_night': <String, String>{'en': "It is between midnight and 5 a.m., when scams are more common.", 'ta': "இது நள்ளிரவு முதல் அதிகாலை 5 மணி வரையிலான நேரம். இந்த நேரத்தில் மோசடிகள் அதிகம்.", 'hi': "अभी आधी रात से सुबह 5 बजे के बीच का समय है, जब धोखाधड़ी ज़्यादा होती है।"},
  'repeated_failures': <String, String>{'en': "There were 3 or more failed attempts in the last 15 minutes.", 'ta': "கடந்த 15 நிமிடங்களில் 3 அல்லது அதற்கு மேற்பட்ட முயற்சிகள் தோல்வியடைந்தன.", 'hi': "पिछले 15 मिनट में 3 या उससे ज़्यादा बार कोशिश नाकाम हुई।"},
  'integrity_failed': <String, String>{'en': "This phone or app did not pass Google's safety check.", 'ta': "இந்தத் தொலைபேசி அல்லது செயலி Google பாதுகாப்புச் சோதனையில் தேறவில்லை.", 'hi': "यह फ़ोन या ऐप Google की सुरक्षा जाँच में पास नहीं हुआ।"},
  'recent_family_alert': <String, String>{'en': "Family protection saw a warning sign on this phone in the last 30 minutes.", 'ta': "கடந்த 30 நிமிடங்களில் இந்தத் தொலைபேசியில் குடும்பப் பாதுகாப்பு ஓர் எச்சரிக்கை அறிகுறியைக் கண்டது.", 'hi': "पिछले 30 मिनट में फ़ैमिली प्रोटेक्शन ने इस फ़ोन पर एक चेतावनी का संकेत देखा।"},
};

/// Monitoring rules: weight and reason per language. Must match the backend engine.
const Map<String, int> kMonitorWeights = <String, int>{
  'payment_screen_during_call': 70,
  'login_screen_during_call': 60,
  'otp_during_call': 60,
  'sensitive_app_during_call': 50,
  'remote_access_active': 40,
  'remote_access_during_call': 30,
  'new_login_alert': 30,
  'login_alert_during_call': 30,
  'unusual_debit': 30,
  'long_unknown_call': 30,
  'large_debit': 20,
  'very_long_unknown_call': 20,
  'repeated_unknown_caller': 20,
  'hidden_or_international_caller': 15,
  'late_night_activity': 10,
  'chat_after_otp': 40,
  'otp_shared_during_call': 30,
  'screen_share_started': 40,
  'screen_share_during_call': 30,
  'remote_access_installed': 40,
  'sideloaded_app_installed': 30,
  'install_during_call': 30,
  'new_accessibility_app': 40,
  'new_device_admin_app': 40,
  'access_granted_during_call': 30,
  'repeated_unlock_failures': 40,
  'many_unlock_failures': 20,
  'failed_login_alert': 30,
  'repeated_failed_logins': 20,
  'guardian_paused': 0,
  'scam_message': 30,
  'suspicious_link': 30,
  'lookalike_bank_link': 40,
  'apk_link': 40,
  'scam_message_during_call': 30,
  'login_after_scam_link': 60,
  'browser_after_scam_link': 30,
  'phishing_login_page': 70,
};

const Map<String, Map<String, String>> kMonitorReasons = <String, Map<String, String>>{
  'payment_screen_during_call': <String, String>{'en': "A payment PIN screen was opened while on a call with an unknown number.", 'ta': "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது பணம் செலுத்தும் PIN திரை திறக்கப்பட்டது.", 'hi': "किसी अनजान नंबर से कॉल के दौरान पेमेंट PIN वाली स्क्रीन खोली गई।"},
  'login_screen_during_call': <String, String>{'en': "A bank, payment or email sign-in screen was opened while on a call with an unknown number.", 'ta': "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது வங்கி, பணம் செலுத்தும் அல்லது மின்னஞ்சல் உள்நுழைவுத் திரை திறக்கப்பட்டது.", 'hi': "किसी अनजान नंबर से कॉल के दौरान बैंक, पेमेंट या ईमेल की साइन-इन स्क्रीन खोली गई।"},
  'otp_during_call': <String, String>{'en': "A one-time code arrived while on a call with an unknown number. Scammers ask people to read these out.", 'ta': "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது ஒருமுறைக் குறியீடு வந்தது. மோசடிக்காரர்கள் இதைப் படிக்கச் சொல்வார்கள்.", 'hi': "किसी अनजान नंबर से कॉल के दौरान एक बार वाला कोड आया। धोखेबाज़ ऐसे कोड पढ़कर सुनाने को कहते हैं।"},
  'sensitive_app_during_call': <String, String>{'en': "A bank or payment app was opened while on a call with an unknown number.", 'ta': "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது வங்கி அல்லது பணம் செலுத்தும் செயலி திறக்கப்பட்டது.", 'hi': "किसी अनजान नंबर से कॉल के दौरान बैंक या पेमेंट ऐप खोला गया।"},
  'remote_access_active': <String, String>{'en': "An app that lets someone else control this phone is in use.", 'ta': "வேறொருவர் இந்தத் தொலைபேசியைக் கட்டுப்படுத்த உதவும் செயலி பயன்பாட்டில் உள்ளது.", 'hi': "ऐसा ऐप इस्तेमाल हो रहा है जिससे कोई और इस फ़ोन को चला सकता है।"},
  'remote_access_during_call': <String, String>{'en': "The screen-control app is being used during a call with an unknown number.", 'ta': "தெரியாத எண்ணுடனான அழைப்பின்போது திரையைக் கட்டுப்படுத்தும் செயலி பயன்படுத்தப்படுகிறது.", 'hi': "अनजान नंबर से कॉल के दौरान स्क्रीन चलाने वाला ऐप इस्तेमाल हो रहा है।"},
  'new_login_alert': <String, String>{'en': "An app reported a new sign-in to one of this person's accounts.", 'ta': "இவரின் கணக்குகளில் ஒன்றில் புதிய உள்நுழைவு நடந்ததாக ஒரு செயலி தெரிவித்தது.", 'hi': "एक ऐप ने बताया कि इनके किसी खाते में नया साइन-इन हुआ है।"},
  'login_alert_during_call': <String, String>{'en': "The new sign-in happened during a call with an unknown number.", 'ta': "அந்தப் புதிய உள்நுழைவு தெரியாத எண்ணுடனான அழைப்பின்போது நடந்தது.", 'hi': "यह नया साइन-इन किसी अनजान नंबर से कॉल के दौरान हुआ।"},
  'unusual_debit': <String, String>{'en': "Money left an account in an amount much larger than usual for this person.", 'ta': "இவருக்கு வழக்கத்தை விட மிக அதிகமான தொகை கணக்கிலிருந்து சென்றுள்ளது.", 'hi': "इनके खाते से आम तौर से बहुत ज़्यादा रकम निकली है।"},
  'long_unknown_call': <String, String>{'en': "A call with an unknown, hidden or foreign number has lasted more than 15 minutes.", 'ta': "தெரியாத, மறைக்கப்பட்ட அல்லது வெளிநாட்டு எண்ணுடனான அழைப்பு 15 நிமிடங்களுக்கு மேல் நீடிக்கிறது.", 'hi': "अनजान, छिपे हुए या विदेशी नंबर से कॉल 15 मिनट से ज़्यादा चल रही है।"},
  'large_debit': <String, String>{'en': "A bank or payment app reported a large amount leaving an account.", 'ta': "ஒரு கணக்கிலிருந்து பெரிய தொகை சென்றதாக வங்கி அல்லது பணம் செலுத்தும் செயலி தெரிவித்தது.", 'hi': "बैंक या पेमेंट ऐप ने बताया कि खाते से बड़ी रकम निकली है।"},
  'very_long_unknown_call': <String, String>{'en': "The call has gone on for more than 45 minutes. Fake 'arrest' and 'police' scams keep people on long calls.", 'ta': "அழைப்பு 45 நிமிடங்களுக்கு மேல் நீடிக்கிறது. போலி 'கைது', 'காவல்துறை' மோசடிகள் மக்களை நீண்ட நேரம் அழைப்பில் வைத்திருக்கும்.", 'hi': "कॉल 45 मिनट से ज़्यादा चल रही है। नकली 'गिरफ़्तारी' और 'पुलिस' वाले धोखेबाज़ लोगों को लंबी कॉल पर रखते हैं।"},
  'repeated_unknown_caller': <String, String>{'en': "The same unknown number has called three or more times in two hours.", 'ta': "அதே தெரியாத எண் இரண்டு மணி நேரத்தில் மூன்று முறை அல்லது அதற்கு மேல் அழைத்துள்ளது.", 'hi': "एक ही अनजान नंबर से दो घंटे में तीन या ज़्यादा बार कॉल आई है।"},
  'hidden_or_international_caller': <String, String>{'en': "The caller's number is hidden or from another country.", 'ta': "அழைப்பவரின் எண் மறைக்கப்பட்டுள்ளது அல்லது வேறு நாட்டைச் சேர்ந்தது.", 'hi': "कॉल करने वाले का नंबर छिपा है या किसी दूसरे देश का है।"},
  'late_night_activity': <String, String>{'en': "This happened between midnight and 5 a.m.", 'ta': "இது நள்ளிரவு முதல் அதிகாலை 5 மணிக்குள் நடந்தது.", 'hi': "यह आधी रात से सुबह 5 बजे के बीच हुआ।"},
  'chat_after_otp': <String, String>{'en': "A chat app was opened right after a one-time code arrived. Scammers ask people to send them the code.", 'ta': "ஒருமுறைக் குறியீடு வந்தவுடன் ஒரு அரட்டைச் செயலி திறக்கப்பட்டது. மோசடிக்காரர்கள் அந்தக் குறியீட்டை அனுப்பச் சொல்வார்கள்.", 'hi': "एक बार वाला कोड आते ही चैट ऐप खोला गया। धोखेबाज़ लोगों से यह कोड भेजने को कहते हैं।"},
  'otp_shared_during_call': <String, String>{'en': "This happened during a call with an unknown number, which is how code-sharing scams work.", 'ta': "இது தெரியாத எண்ணுடனான அழைப்பின்போது நடந்தது. குறியீட்டைப் பகிரவைக்கும் மோசடிகள் இப்படித்தான் நடக்கின்றன.", 'hi': "यह किसी अनजान नंबर से कॉल के दौरान हुआ। कोड शेयर करवाने वाली धोखाधड़ी ऐसे ही होती है।"},
  'screen_share_started': <String, String>{'en': "Screen sharing was started. Whoever is watching can see codes, PINs and passwords.", 'ta': "திரைப் பகிர்வு தொடங்கப்பட்டது. பார்ப்பவர் குறியீடுகள், PIN மற்றும் கடவுச்சொற்களைப் பார்க்க முடியும்.", 'hi': "स्क्रीन शेयरिंग शुरू की गई। देखने वाला कोड, PIN और पासवर्ड देख सकता है।"},
  'screen_share_during_call': <String, String>{'en': "Screen sharing was started during a call with an unknown number.", 'ta': "தெரியாத எண்ணுடனான அழைப்பின்போது திரைப் பகிர்வு தொடங்கப்பட்டது.", 'hi': "किसी अनजान नंबर से कॉल के दौरान स्क्रीन शेयरिंग शुरू की गई।"},
  'remote_access_installed': <String, String>{'en': "A remote-control app was just installed. Scammers use these apps to take over phones.", 'ta': "இப்போதுதான் ஒரு தொலைக் கட்டுப்பாட்டுச் செயலி நிறுவப்பட்டது. மோசடிக்காரர்கள் போன்களைக் கைப்பற்ற இவற்றைப் பயன்படுத்துவார்கள்.", 'hi': "अभी एक रिमोट-कंट्रोल ऐप इंस्टॉल किया गया। धोखेबाज़ फ़ोन पर कब्ज़ा करने के लिए ऐसे ऐप इस्तेमाल करते हैं।"},
  'sideloaded_app_installed': <String, String>{'en': "An app was installed from outside the Play Store. Fake bank apps are spread this way.", 'ta': "Play Store-க்கு வெளியிலிருந்து ஒரு செயலி நிறுவப்பட்டது. போலி வங்கிச் செயலிகள் இப்படித்தான் பரப்பப்படுகின்றன.", 'hi': "Play Store के बाहर से एक ऐप इंस्टॉल किया गया। नकली बैंक ऐप इसी तरह फैलाए जाते हैं।"},
  'install_during_call': <String, String>{'en': "The app was installed during a call with an unknown number.", 'ta': "தெரியாத எண்ணுடனான அழைப்பின்போது அந்தச் செயலி நிறுவப்பட்டது.", 'hi': "यह ऐप किसी अनजान नंबर से कॉल के दौरान इंस्टॉल किया गया।"},
  'new_accessibility_app': <String, String>{'en': "An app was given permission to read and control the screen.", 'ta': "ஒரு செயலிக்குத் திரையைப் படிக்கவும் கட்டுப்படுத்தவும் அனுமதி வழங்கப்பட்டது.", 'hi': "एक ऐप को स्क्रीन पढ़ने और चलाने की अनुमति दी गई।"},
  'new_device_admin_app': <String, String>{'en': "An app was made a device administrator, which lets it lock or erase the phone.", 'ta': "ஒரு செயலி சாதன நிர்வாகியாக்கப்பட்டது. இதனால் அது போனைப் பூட்டவோ அழிக்கவோ முடியும்.", 'hi': "एक ऐप को डिवाइस एडमिन बनाया गया, जिससे वह फ़ोन लॉक या मिटा सकता है।"},
  'access_granted_during_call': <String, String>{'en': "The permission was given during a call with an unknown number.", 'ta': "அந்த அனுமதி தெரியாத எண்ணுடனான அழைப்பின்போது வழங்கப்பட்டது.", 'hi': "यह अनुमति किसी अनजान नंबर से कॉल के दौरान दी गई।"},
  'repeated_unlock_failures': <String, String>{'en': "The wrong screen-lock PIN or pattern was entered 3 or more times. Someone else may be trying to get into the phone.", 'ta': "திரைப் பூட்டின் தவறான PIN அல்லது வடிவம் 3 அல்லது அதற்கு மேல் முறை உள்ளிடப்பட்டது. வேறு யாரோ போனைத் திறக்க முயலலாம்.", 'hi': "स्क्रीन लॉक का गलत PIN या पैटर्न 3 या ज़्यादा बार डाला गया। हो सकता है कोई और फ़ोन खोलने की कोशिश कर रहा हो।"},
  'many_unlock_failures': <String, String>{'en': "The wrong PIN was entered 5 or more times within a few minutes.", 'ta': "சில நிமிடங்களுக்குள் தவறான PIN 5 அல்லது அதற்கு மேல் முறை உள்ளிடப்பட்டது.", 'hi': "कुछ ही मिनटों में गलत PIN 5 या ज़्यादा बार डाला गया।"},
  'failed_login_alert': <String, String>{'en': "An app reported a failed sign-in or a wrong password or PIN.", 'ta': "ஒரு செயலி தோல்வியடைந்த உள்நுழைவு அல்லது தவறான கடவுச்சொல் அல்லது PIN பற்றித் தெரிவித்தது.", 'hi': "एक ऐप ने बताया कि साइन-इन नहीं हो सका या गलत पासवर्ड या PIN डाला गया।"},
  'repeated_failed_logins': <String, String>{'en': "Several failed sign-ins were reported in a short time.", 'ta': "குறுகிய நேரத்தில் பல உள்நுழைவுத் தோல்விகள் தெரிவிக்கப்பட்டன.", 'hi': "थोड़े ही समय में कई बार साइन-इन न हो पाने की सूचना मिली।"},
  'guardian_paused': <String, String>{'en': "Your guardian paused this phone for a few minutes to keep you safe.", 'ta': "உங்களைப் பாதுகாக்க உங்கள் பாதுகாவலர் இந்தப் போனைச் சில நிமிடங்கள் நிறுத்தி வைத்துள்ளார்.", 'hi': "आपकी सुरक्षा के लिए आपके संरक्षक ने इस फ़ोन को कुछ मिनटों के लिए रोका है।"},
  'scam_message': <String, String>{'en': "A message used words scammers use, such as a blocked account, KYC, a prize or a police case.", 'ta': "ஒரு செய்தியில் மோசடிக்காரர்கள் பயன்படுத்தும் வார்த்தைகள் இருந்தன: கணக்கு முடக்கம், KYC, பரிசு அல்லது போலீஸ் வழக்கு போன்றவை.", 'hi': "एक संदेश में धोखेबाज़ों वाले शब्द थे, जैसे खाता बंद, KYC, इनाम या पुलिस केस।"},
  'suspicious_link': <String, String>{'en': "A message had a risky link: a shortened link, a strange website ending, or a hidden address.", 'ta': "ஒரு செய்தியில் ஆபத்தான இணைப்பு இருந்தது: சுருக்கப்பட்ட இணைப்பு, விசித்திரமான இணையதள முடிவு, அல்லது மறைக்கப்பட்ட முகவரி.", 'hi': "एक संदेश में जोखिम भरा लिंक था: छोटा किया गया लिंक, अजीब वेबसाइट या छिपा हुआ पता।"},
  'lookalike_bank_link': <String, String>{'en': "A message had a link to a fake website made to look like a bank or a well-known company.", 'ta': "ஒரு செய்தியில் வங்கி அல்லது பிரபல நிறுவனம் போலத் தோற்றமளிக்கும் போலி இணையதள இணைப்பு இருந்தது.", 'hi': "एक संदेश में ऐसी नकली वेबसाइट का लिंक था जो किसी बैंक या जानी-मानी कंपनी जैसी दिखती है।"},
  'apk_link': <String, String>{'en': "A message asked to download an app file directly. Fake bank apps are spread this way.", 'ta': "ஒரு செய்தி ஒரு செயலிக் கோப்பை நேரடியாகப் பதிவிறக்கச் சொன்னது. போலி வங்கிச் செயலிகள் இப்படித்தான் பரப்பப்படுகின்றன.", 'hi': "एक संदेश में ऐप फ़ाइल सीधे डाउनलोड करने को कहा गया। नकली बैंक ऐप इसी तरह फैलाए जाते हैं।"},
  'scam_message_during_call': <String, String>{'en': "The message arrived during a call with an unknown number.", 'ta': "அந்தச் செய்தி தெரியாத எண்ணுடனான அழைப்பின்போது வந்தது.", 'hi': "यह संदेश किसी अनजान नंबर से कॉल के दौरान आया।"},
  'login_after_scam_link': <String, String>{'en': "A sign-in page opened a few minutes after a scam message with a link. It may be a fake page.", 'ta': "இணைப்புடன் கூடிய மோசடிச் செய்தி வந்த சில நிமிடங்களில் ஒரு உள்நுழைவுப் பக்கம் திறக்கப்பட்டது. அது போலிப் பக்கமாக இருக்கலாம்.", 'hi': "लिंक वाले धोखाधड़ी संदेश के कुछ मिनट बाद एक साइन-इन पेज खुला। यह नकली पेज हो सकता है।"},
  'browser_after_scam_link': <String, String>{'en': "The web browser was opened a few minutes after a scam message with a link.", 'ta': "இணைப்புடன் கூடிய மோசடிச் செய்தி வந்த சில நிமிடங்களில் இணைய உலாவி திறக்கப்பட்டது.", 'hi': "लिंक वाले धोखाधड़ी संदेश के कुछ मिनट बाद वेब ब्राउज़र खोला गया।"},
  'phishing_login_page': <String, String>{'en': "A password was about to be typed on a fake website that pretends to be a bank or a well-known company.", 'ta': "வங்கி அல்லது பிரபல நிறுவனம் போல நடிக்கும் போலி இணையதளத்தில் கடவுச்சொல் தட்டச்சு செய்யப்படவிருந்தது.", 'hi': "किसी बैंक या जानी-मानी कंपनी होने का दिखावा करने वाली नकली वेबसाइट पर पासवर्ड डाला जाने वाला था।"},
};

const Map<String, Map<String, String>> kActionLabels = <String, Map<String, String>>{
  'add_device': <String, String>{'en': "Add a new phone", 'ta': "புதிய தொலைபேசியைச் சேர்த்தல்", 'hi': "नया फ़ोन जोड़ना"},
  'add_passkey': <String, String>{'en': "Add a passkey", 'ta': "புதிய பாஸ்கீயைச் சேர்த்தல்", 'hi': "नई पासकी जोड़ना"},
  'remove_guardian': <String, String>{'en': "Remove a guardian", 'ta': "பாதுகாவலரை நீக்குதல்", 'hi': "संरक्षक को हटाना"},
  'change_phone': <String, String>{'en': "Change phone number", 'ta': "தொலைபேசி எண்ணை மாற்றுதல்", 'hi': "फ़ोन नंबर बदलना"},
  'change_email': <String, String>{'en': "Change email address", 'ta': "மின்னஞ்சல் முகவரியை மாற்றுதல்", 'hi': "ईमेल पता बदलना"},
  'view_recovery_codes': <String, String>{'en': "Create new recovery codes", 'ta': "புதிய மீட்புக் குறியீடுகளை உருவாக்குதல்", 'hi': "नए रिकवरी कोड बनाना"},
  'delete_account': <String, String>{'en': "Delete the account", 'ta': "கணக்கை நீக்குதல்", 'hi': "खाता हटाना"},
};
