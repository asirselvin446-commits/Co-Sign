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
  static const String INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS';
  static const String HANDLE_TAKEN = 'HANDLE_TAKEN';
  static const String GUARDIAN_LIMIT_REACHED = 'GUARDIAN_LIMIT_REACHED';
  static const String INVITE_INVALID = 'INVITE_INVALID';
  static const String CANNOT_GUARD_SELF = 'CANNOT_GUARD_SELF';
  static const String ALREADY_GUARDIAN = 'ALREADY_GUARDIAN';
  static const String REQUEST_EXPIRED = 'REQUEST_EXPIRED';
  static const String REQUEST_ALREADY_DECIDED = 'REQUEST_ALREADY_DECIDED';
  static const String IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';
  static const String ACTION_NOT_COMPLETED = 'ACTION_NOT_COMPLETED';
  static const String RECOVERY_NOT_COMPLETED = 'RECOVERY_NOT_COMPLETED';
  static const String CONSENT_REQUIRED = 'CONSENT_REQUIRED';
  static const String INTERNAL_ERROR = 'INTERNAL_ERROR';
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
      'en': ErrorText("This phone has no screen lock or fingerprint set up, so it cannot hold a passkey.", "Open your phone Settings, set a PIN, pattern or fingerprint, then come back."),
      'ta': ErrorText("இந்தத் தொலைபேசியில் திரைப் பூட்டு அல்லது கைரேகை அமைக்கப்படவில்லை, அதனால் பாஸ்கீயைச் சேமிக்க முடியாது.", "தொலைபேசி அமைப்புகளைத் திறந்து PIN, பேட்டர்ன் அல்லது கைரேகையை அமைத்துவிட்டுத் திரும்பி வாருங்கள்."),
      'hi': ErrorText("इस फ़ोन में स्क्रीन लॉक या फ़िंगरप्रिंट सेट नहीं है, इसलिए इसमें पासकी नहीं रखी जा सकती।", "फ़ोन की सेटिंग खोलें, PIN, पैटर्न या फ़िंगरप्रिंट सेट करें, फिर वापस आएँ।"),
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
  'INSUFFICIENT_FUNDS': ErrorEntry(
    code: 'INSUFFICIENT_FUNDS',
    http: 422,
    tier: 'detailed',
    generic: 'ACTION_NOT_COMPLETED',
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("Your balance is too low for this transfer.", "Enter a smaller amount."),
      'ta': ErrorText("இந்தப் பரிமாற்றத்திற்கு உங்கள் இருப்பு போதவில்லை.", "குறைவான தொகையை உள்ளிடுங்கள்."),
      'hi': ErrorText("इस ट्रांसफ़र के लिए आपका बैलेंस कम है।", "कम रकम डालें।"),
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
  'IDEMPOTENCY_CONFLICT': ErrorEntry(
    code: 'IDEMPOTENCY_CONFLICT',
    http: 409,
    tier: 'public',
    generic: null,
    origin: 'server',
    params: <String>[],
    text: <String, ErrorText>{
      'en': ErrorText("This request was already sent with different details.", "Start a new transfer."),
      'ta': ErrorText("இந்தக் கோரிக்கை ஏற்கனவே வேறு விவரங்களுடன் அனுப்பப்பட்டது.", "புதிய பரிமாற்றத்தைத் தொடங்குங்கள்."),
      'hi': ErrorText("यह अनुरोध पहले ही अलग जानकारी के साथ भेजा जा चुका है।", "नया ट्रांसफ़र शुरू करें।"),
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
};

const Map<String, Map<String, String>> kActionLabels = <String, Map<String, String>>{
  'add_device': <String, String>{'en': "Add a new phone", 'ta': "புதிய தொலைபேசியைச் சேர்த்தல்", 'hi': "नया फ़ोन जोड़ना"},
  'add_passkey': <String, String>{'en': "Add a passkey", 'ta': "புதிய பாஸ்கீயைச் சேர்த்தல்", 'hi': "नई पासकी जोड़ना"},
  'remove_guardian': <String, String>{'en': "Remove a guardian", 'ta': "பாதுகாவலரை நீக்குதல்", 'hi': "संरक्षक को हटाना"},
  'change_phone': <String, String>{'en': "Change phone number", 'ta': "தொலைபேசி எண்ணை மாற்றுதல்", 'hi': "फ़ोन नंबर बदलना"},
  'change_email': <String, String>{'en': "Change email address", 'ta': "மின்னஞ்சல் முகவரியை மாற்றுதல்", 'hi': "ईमेल पता बदलना"},
  'raise_transfer_limit': <String, String>{'en': "Raise the daily transfer limit", 'ta': "தினசரி பரிமாற்ற வரம்பை உயர்த்துதல்", 'hi': "रोज़ की ट्रांसफ़र सीमा बढ़ाना"},
  'add_payee': <String, String>{'en': "Add a payee", 'ta': "பணம் பெறுபவரைச் சேர்த்தல்", 'hi': "पैसे पाने वाले को जोड़ना"},
  'transfer_above_limit': <String, String>{'en': "Send money above the daily limit", 'ta': "தினசரி வரம்பை மீறிப் பணம் அனுப்புதல்", 'hi': "रोज़ की सीमा से ज़्यादा पैसे भेजना"},
  'view_recovery_codes': <String, String>{'en': "Create new recovery codes", 'ta': "புதிய மீட்புக் குறியீடுகளை உருவாக்குதல்", 'hi': "नए रिकवरी कोड बनाना"},
  'delete_account': <String, String>{'en': "Delete the account", 'ta': "கணக்கை நீக்குதல்", 'hi': "खाता हटाना"},
};
