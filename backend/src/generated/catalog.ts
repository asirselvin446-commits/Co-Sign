// GENERATED FILE. Do not edit by hand.
// Source: shared/catalog.json. Regenerate with `pnpm catalog:gen`.

export const LANGUAGES = ["en","ta","hi"] as const;
export type Lang = (typeof LANGUAGES)[number];

export interface ErrorText { cause: string; next: string }
export interface ErrorEntry {
  http: number;
  tier: 'public' | 'detailed';
  generic: string | null;
  origin: 'client' | 'server' | 'both';
  params: readonly string[];
  text: Record<Lang, ErrorText>;
}

export const ERROR_CATALOG = {
  "PASSKEY_CANCELLED": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "You closed the passkey prompt before it finished.",
        "next": "Tap Try again and confirm with your fingerprint, face or screen lock."
      },
      "ta": {
        "cause": "பாஸ்கீ சாளரம் முடிவதற்குள் நீங்கள் அதை மூடிவிட்டீர்கள்.",
        "next": "மீண்டும் முயல் என்பதைத் தட்டி, கைரேகை, முகம் அல்லது திரைப் பூட்டு மூலம் உறுதிசெய்யுங்கள்."
      },
      "hi": {
        "cause": "पासकी वाली विंडो पूरी होने से पहले आपने उसे बंद कर दिया।",
        "next": "फिर से कोशिश करें पर टैप करें और फ़िंगरप्रिंट, चेहरे या स्क्रीन लॉक से पुष्टि करें।"
      }
    }
  },
  "PASSKEY_TIMED_OUT": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "The passkey prompt waited too long and closed.",
        "next": "Tap Try again and confirm within a minute."
      },
      "ta": {
        "cause": "பாஸ்கீ சாளரம் நீண்ட நேரம் காத்திருந்து மூடப்பட்டது.",
        "next": "மீண்டும் முயல் என்பதைத் தட்டி, ஒரு நிமிடத்திற்குள் உறுதிசெய்யுங்கள்."
      },
      "hi": {
        "cause": "पासकी वाली विंडो बहुत देर तक इंतज़ार करके बंद हो गई।",
        "next": "फिर से कोशिश करें पर टैप करें और एक मिनट के अंदर पुष्टि करें।"
      }
    }
  },
  "NO_SCREEN_LOCK": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "This phone has no screen lock or fingerprint set up, so it cannot confirm it is really you.",
        "next": "Open your phone Settings, set a PIN, pattern or fingerprint, then come back."
      },
      "ta": {
        "cause": "இந்தத் தொலைபேசியில் திரைப் பூட்டு அல்லது கைரேகை அமைக்கப்படவில்லை, அதனால் இது நீங்கள்தான் என்பதை உறுதிசெய்ய முடியாது.",
        "next": "தொலைபேசி அமைப்புகளைத் திறந்து PIN, பேட்டர்ன் அல்லது கைரேகையை அமைத்துவிட்டுத் திரும்பி வாருங்கள்."
      },
      "hi": {
        "cause": "इस फ़ोन में स्क्रीन लॉक या फ़िंगरप्रिंट सेट नहीं है, इसलिए यह पक्का नहीं कर सकता कि यह आप ही हैं।",
        "next": "फ़ोन की सेटिंग खोलें, PIN, पैटर्न या फ़िंगरप्रिंट सेट करें, फिर वापस आएँ।"
      }
    }
  },
  "SCREEN_LOCK_CANCELLED": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "You closed the fingerprint or PIN check, so nothing was sent.",
        "next": "Tap the button again and confirm with your fingerprint, face or phone PIN."
      },
      "ta": {
        "cause": "கைரேகை அல்லது PIN சரிபார்ப்பை மூடிவிட்டீர்கள், அதனால் எதுவும் அனுப்பப்படவில்லை.",
        "next": "பொத்தானை மீண்டும் தட்டி, கைரேகை, முகம் அல்லது தொலைபேசி PIN மூலம் உறுதிசெய்யுங்கள்."
      },
      "hi": {
        "cause": "आपने फ़िंगरप्रिंट या PIN जाँच बंद कर दी, इसलिए कुछ नहीं भेजा गया।",
        "next": "बटन फिर से टैप करें और फ़िंगरप्रिंट, चेहरे या फ़ोन PIN से पुष्टि करें।"
      }
    }
  },
  "SCREEN_LOCK_LOCKED_OUT": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "Too many tries, so your phone has paused the fingerprint check for now.",
        "next": "Wait a minute and try again, or unlock with your phone PIN."
      },
      "ta": {
        "cause": "பல முறை முயன்றதால், உங்கள் தொலைபேசி கைரேகை சரிபார்ப்பைத் தற்காலிகமாக நிறுத்தியுள்ளது.",
        "next": "ஒரு நிமிடம் காத்திருந்து மீண்டும் முயலுங்கள், அல்லது தொலைபேசி PIN மூலம் திறவுங்கள்."
      },
      "hi": {
        "cause": "बहुत ज़्यादा कोशिशों के कारण फ़ोन ने अभी फ़िंगरप्रिंट जाँच रोक दी है।",
        "next": "एक मिनट रुककर फिर कोशिश करें, या फ़ोन PIN से अनलॉक करें।"
      }
    }
  },
  "PASSKEY_NOT_ON_DEVICE": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "This phone could not find your Co-Sign passkey.",
        "next": "Your passkey is kept in Google Password Manager. Tap Open passkey settings and check that Google is turned on, then try again. On a new phone, sign in on your usual phone or tap I lost my phone."
      },
      "ta": {
        "cause": "இந்தத் தொலைபேசியால் உங்கள் Co-Sign பாஸ்கீயைக் கண்டுபிடிக்க முடியவில்லை.",
        "next": "உங்கள் பாஸ்கீ Google கடவுச்சொல் நிர்வாகியில் உள்ளது. பாஸ்கீ அமைப்புகளைத் திற என்பதைத் தட்டி, Google இயக்கத்தில் உள்ளதா எனப் பார்த்து, மீண்டும் முயலுங்கள். புதிய தொலைபேசி என்றால், உங்கள் வழக்கமான தொலைபேசியில் உள்நுழையுங்கள் அல்லது என் தொலைபேசி தொலைந்தது என்பதைத் தட்டுங்கள்."
      },
      "hi": {
        "cause": "यह फ़ोन आपकी Co-Sign पासकी नहीं ढूँढ पाया।",
        "next": "आपकी पासकी Google पासवर्ड मैनेजर में रखी है। पासकी सेटिंग खोलें पर टैप करें और देखें कि Google चालू है, फिर से कोशिश करें। नया फ़ोन हो तो अपने रोज़ वाले फ़ोन से साइन इन करें या मेरा फ़ोन खो गया पर टैप करें।"
      }
    }
  },
  "CREDENTIAL_ALREADY_REGISTERED": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "This phone already has a passkey for this account.",
        "next": "Tap Sign in instead of creating a new account."
      },
      "ta": {
        "cause": "இந்தக் கணக்கிற்கான பாஸ்கீ ஏற்கனவே இந்தத் தொலைபேசியில் உள்ளது.",
        "next": "புதிய கணக்கை உருவாக்குவதற்குப் பதிலாக உள்நுழை என்பதைத் தட்டுங்கள்."
      },
      "hi": {
        "cause": "इस फ़ोन में इस खाते की पासकी पहले से है।",
        "next": "नया खाता बनाने के बजाय साइन इन पर टैप करें।"
      }
    }
  },
  "PASSKEY_UNSUPPORTED": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "This phone cannot use passkeys yet.",
        "next": "Update your phone software and Google Play services, or use another phone."
      },
      "ta": {
        "cause": "இந்தத் தொலைபேசியில் இன்னும் பாஸ்கீயைப் பயன்படுத்த முடியாது.",
        "next": "தொலைபேசி மென்பொருளையும் Google Play சேவைகளையும் புதுப்பியுங்கள், அல்லது வேறு தொலைபேசியைப் பயன்படுத்துங்கள்."
      },
      "hi": {
        "cause": "यह फ़ोन अभी पासकी इस्तेमाल नहीं कर सकता।",
        "next": "फ़ोन का सॉफ़्टवेयर और Google Play सेवाएँ अपडेट करें, या दूसरा फ़ोन इस्तेमाल करें।"
      }
    }
  },
  "PASSKEY_FAILED": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "The passkey prompt did not work this time.",
        "next": "Tap Try again. If it keeps happening, restart your phone."
      },
      "ta": {
        "cause": "இந்த முறை பாஸ்கீ சாளரம் வேலை செய்யவில்லை.",
        "next": "மீண்டும் முயல் என்பதைத் தட்டுங்கள். தொடர்ந்து நடந்தால், தொலைபேசியை மறுதொடக்கம் செய்யுங்கள்."
      },
      "hi": {
        "cause": "इस बार पासकी वाली विंडो ने काम नहीं किया।",
        "next": "फिर से कोशिश करें पर टैप करें। ऐसा बार-बार हो तो फ़ोन रीस्टार्ट करें।"
      }
    }
  },
  "CODE_NON_ASCII_DIGITS": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "both",
    "params": [],
    "text": {
      "en": {
        "cause": "The code was typed in Tamil or Hindi digits.",
        "next": "Tap Convert to change it to 0 to 9 digits and send it again."
      },
      "ta": {
        "cause": "குறியீடு தமிழ் அல்லது இந்தி எண்களில் தட்டச்சு செய்யப்பட்டது.",
        "next": "0 முதல் 9 வரையிலான எண்களாக மாற்ற மாற்று என்பதைத் தட்டி மீண்டும் அனுப்புங்கள்."
      },
      "hi": {
        "cause": "कोड तमिल या हिंदी अंकों में टाइप किया गया था।",
        "next": "उसे 0 से 9 वाले अंकों में बदलने के लिए बदलें पर टैप करें और फिर से भेजें।"
      }
    }
  },
  "CODE_EXPIRED": {
    "http": 410,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This code has expired.",
        "next": "Ask the person who shared it to create a new one."
      },
      "ta": {
        "cause": "இந்தக் குறியீட்டின் காலம் முடிந்துவிட்டது.",
        "next": "அதைப் பகிர்ந்தவரிடம் புதிய குறியீட்டை உருவாக்கச் சொல்லுங்கள்."
      },
      "hi": {
        "cause": "इस कोड की समय-सीमा खत्म हो गई है।",
        "next": "जिसने इसे भेजा था, उससे नया कोड बनाने को कहें।"
      }
    }
  },
  "CODE_INVALID": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This code is not correct.",
        "next": "Check each digit and try again."
      },
      "ta": {
        "cause": "இந்தக் குறியீடு சரியானது அல்ல.",
        "next": "ஒவ்வொரு எண்ணையும் சரிபார்த்து மீண்டும் முயலுங்கள்."
      },
      "hi": {
        "cause": "यह कोड सही नहीं है।",
        "next": "हर अंक जाँचें और फिर से कोशिश करें।"
      }
    }
  },
  "TOO_MANY_ATTEMPTS": {
    "http": 429,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [
      "wait"
    ],
    "text": {
      "en": {
        "cause": "There were too many tries in a short time.",
        "next": "Wait {wait} and try again."
      },
      "ta": {
        "cause": "குறுகிய நேரத்தில் அதிக முறை முயற்சிக்கப்பட்டது.",
        "next": "{wait} காத்திருந்து மீண்டும் முயலுங்கள்."
      },
      "hi": {
        "cause": "कम समय में बहुत ज़्यादा बार कोशिश की गई।",
        "next": "{wait} रुकें और फिर से कोशिश करें।"
      }
    }
  },
  "NETWORK_ERROR": {
    "http": 503,
    "tier": "public",
    "generic": null,
    "origin": "client",
    "params": [],
    "text": {
      "en": {
        "cause": "We could not reach Co-Sign. Your internet may be off or slow.",
        "next": "Check mobile data or Wi-Fi and tap Try again."
      },
      "ta": {
        "cause": "Co-Sign-ஐ அணுக முடியவில்லை. இணையம் இல்லாமலோ மெதுவாகவோ இருக்கலாம்.",
        "next": "மொபைல் டேட்டா அல்லது வைஃபையைச் சரிபார்த்து மீண்டும் முயல் என்பதைத் தட்டுங்கள்."
      },
      "hi": {
        "cause": "Co-Sign तक नहीं पहुँच पाए। आपका इंटरनेट बंद या धीमा हो सकता है।",
        "next": "मोबाइल डेटा या वाई-फ़ाई जाँचें और फिर से कोशिश करें पर टैप करें।"
      }
    }
  },
  "GUARDIAN_DENIED": {
    "http": 403,
    "tier": "detailed",
    "generic": "ACTION_NOT_COMPLETED",
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "Your guardian said no to this action.",
        "next": "Call your guardian yourself on a number you already know before trying again."
      },
      "ta": {
        "cause": "உங்கள் பாதுகாவலர் இந்தச் செயலுக்கு மறுப்புத் தெரிவித்தார்.",
        "next": "மீண்டும் முயல்வதற்கு முன், உங்களுக்கு ஏற்கனவே தெரிந்த எண்ணில் நீங்களே உங்கள் பாதுகாவலரை அழையுங்கள்."
      },
      "hi": {
        "cause": "आपके संरक्षक ने इस काम के लिए मना कर दिया।",
        "next": "फिर से कोशिश करने से पहले, अपने संरक्षक को ख़ुद ऐसे नंबर पर कॉल करें जो आपको पहले से पता है।"
      }
    }
  },
  "COOLOFF_ACTIVE": {
    "http": 423,
    "tier": "detailed",
    "generic": "ACTION_NOT_COMPLETED",
    "origin": "server",
    "params": [
      "until"
    ],
    "text": {
      "en": {
        "cause": "This action is paused for your safety until {until}.",
        "next": "If anyone is pressuring you, hang up now. You can cancel this action at any time."
      },
      "ta": {
        "cause": "உங்கள் பாதுகாப்பிற்காக இந்தச் செயல் {until} வரை நிறுத்தி வைக்கப்பட்டுள்ளது.",
        "next": "யாராவது உங்களை அவசரப்படுத்தினால், இப்போதே அழைப்பைத் துண்டியுங்கள். இந்தச் செயலை எப்போது வேண்டுமானாலும் ரத்து செய்யலாம்."
      },
      "hi": {
        "cause": "आपकी सुरक्षा के लिए यह काम {until} तक रोका गया है।",
        "next": "अगर कोई आप पर दबाव डाल रहा है, तो अभी कॉल काट दें। आप इस काम को कभी भी रद्द कर सकते हैं।"
      }
    }
  },
  "RECOVERY_PENDING": {
    "http": 409,
    "tier": "detailed",
    "generic": "ACTION_NOT_COMPLETED",
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "Someone has asked to move this account to a new phone.",
        "next": "If this was not you, tap Cancel recovery now."
      },
      "ta": {
        "cause": "இந்தக் கணக்கைப் புதிய தொலைபேசிக்கு மாற்ற ஒருவர் கோரியுள்ளார்.",
        "next": "இது நீங்கள் இல்லையென்றால், இப்போதே மீட்பை ரத்துசெய் என்பதைத் தட்டுங்கள்."
      },
      "hi": {
        "cause": "किसी ने इस खाते को नए फ़ोन पर ले जाने का अनुरोध किया है।",
        "next": "अगर यह आप नहीं थे, तो अभी रिकवरी रद्द करें पर टैप करें।"
      }
    }
  },
  "SIGN_IN_FAILED": {
    "http": 401,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "We could not sign you in with that passkey.",
        "next": "Try again, or tap I lost my phone."
      },
      "ta": {
        "cause": "அந்தப் பாஸ்கீ மூலம் உங்களை உள்நுழைய வைக்க முடியவில்லை.",
        "next": "மீண்டும் முயலுங்கள், அல்லது என் தொலைபேசி தொலைந்தது என்பதைத் தட்டுங்கள்."
      },
      "hi": {
        "cause": "उस पासकी से आपको साइन इन नहीं कर पाए।",
        "next": "फिर से कोशिश करें, या मेरा फ़ोन खो गया पर टैप करें।"
      }
    }
  },
  "SESSION_EXPIRED": {
    "http": 401,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "You were signed out to keep your account safe.",
        "next": "Sign in again with your passkey."
      },
      "ta": {
        "cause": "உங்கள் கணக்கின் பாதுகாப்பிற்காக நீங்கள் வெளியேற்றப்பட்டீர்கள்.",
        "next": "உங்கள் பாஸ்கீ மூலம் மீண்டும் உள்நுழையுங்கள்."
      },
      "hi": {
        "cause": "आपके खाते की सुरक्षा के लिए आपको साइन आउट कर दिया गया।",
        "next": "अपनी पासकी से फिर से साइन इन करें।"
      }
    }
  },
  "DEVICE_REVOKED": {
    "http": 401,
    "tier": "detailed",
    "generic": "SESSION_EXPIRED",
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This phone was removed from your account.",
        "next": "Sign in again, or recover your account with your guardians."
      },
      "ta": {
        "cause": "இந்தத் தொலைபேசி உங்கள் கணக்கிலிருந்து நீக்கப்பட்டது.",
        "next": "மீண்டும் உள்நுழையுங்கள், அல்லது பாதுகாவலர்கள் உதவியுடன் கணக்கை மீட்டெடுங்கள்."
      },
      "hi": {
        "cause": "यह फ़ोन आपके खाते से हटा दिया गया है।",
        "next": "फिर से साइन इन करें, या संरक्षकों की मदद से अपना खाता वापस पाएँ।"
      }
    }
  },
  "NOT_ALLOWED": {
    "http": 403,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This action is not allowed here.",
        "next": "Use a phone that is already set up for your account."
      },
      "ta": {
        "cause": "இந்தச் செயல் இங்கே அனுமதிக்கப்படவில்லை.",
        "next": "உங்கள் கணக்கிற்கு ஏற்கனவே அமைக்கப்பட்ட தொலைபேசியைப் பயன்படுத்துங்கள்."
      },
      "hi": {
        "cause": "यह काम यहाँ से करने की अनुमति नहीं है।",
        "next": "ऐसा फ़ोन इस्तेमाल करें जो आपके खाते के लिए पहले से सेट है।"
      }
    }
  },
  "INVALID_INPUT": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "Some details were missing or not in the right format.",
        "next": "Check what you entered and try again."
      },
      "ta": {
        "cause": "சில விவரங்கள் இல்லை அல்லது சரியான வடிவத்தில் இல்லை.",
        "next": "நீங்கள் உள்ளிட்டதைச் சரிபார்த்து மீண்டும் முயலுங்கள்."
      },
      "hi": {
        "cause": "कुछ जानकारी छूट गई है या सही रूप में नहीं है।",
        "next": "आपने जो भरा है उसे जाँचें और फिर से कोशिश करें।"
      }
    }
  },
  "NOT_FOUND": {
    "http": 404,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "We could not find what you asked for.",
        "next": "Go back and try again."
      },
      "ta": {
        "cause": "நீங்கள் கேட்டதைக் கண்டுபிடிக்க முடியவில்லை.",
        "next": "பின்சென்று மீண்டும் முயலுங்கள்."
      },
      "hi": {
        "cause": "आपने जो माँगा वह हमें नहीं मिला।",
        "next": "वापस जाएँ और फिर से कोशिश करें।"
      }
    }
  },
  "STEPUP_REQUIRED": {
    "http": 428,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This change needs an extra safety check.",
        "next": "Tap Continue to confirm with your passkey."
      },
      "ta": {
        "cause": "இந்த மாற்றத்திற்குக் கூடுதல் பாதுகாப்புச் சோதனை தேவை.",
        "next": "உங்கள் பாஸ்கீ மூலம் உறுதிசெய்ய தொடர் என்பதைத் தட்டுங்கள்."
      },
      "hi": {
        "cause": "इस बदलाव के लिए एक अतिरिक्त सुरक्षा जाँच चाहिए।",
        "next": "अपनी पासकी से पुष्टि करने के लिए आगे बढ़ें पर टैप करें।"
      }
    }
  },
  "HANDLE_TAKEN": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "That account name is already in use.",
        "next": "Choose a different account name."
      },
      "ta": {
        "cause": "அந்தக் கணக்குப் பெயர் ஏற்கனவே பயன்பாட்டில் உள்ளது.",
        "next": "வேறு கணக்குப் பெயரைத் தேர்ந்தெடுங்கள்."
      },
      "hi": {
        "cause": "यह खाता नाम पहले से इस्तेमाल में है।",
        "next": "कोई दूसरा खाता नाम चुनें।"
      }
    }
  },
  "GUARDIAN_LIMIT_REACHED": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "You already have the most guardians allowed, which is 5.",
        "next": "Remove a guardian before inviting a new one."
      },
      "ta": {
        "cause": "அனுமதிக்கப்பட்ட அதிகபட்சமான 5 பாதுகாவலர்கள் ஏற்கனவே உங்களிடம் உள்ளனர்.",
        "next": "புதியவரை அழைப்பதற்கு முன் ஒரு பாதுகாவலரை நீக்குங்கள்."
      },
      "hi": {
        "cause": "आपके पास पहले से अधिकतम 5 संरक्षक हैं।",
        "next": "नया संरक्षक जोड़ने से पहले किसी एक को हटाएँ।"
      }
    }
  },
  "INVITE_INVALID": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This invite is not valid or has already been used.",
        "next": "Ask the person to send you a new invite."
      },
      "ta": {
        "cause": "இந்த அழைப்பு செல்லாது அல்லது ஏற்கனவே பயன்படுத்தப்பட்டது.",
        "next": "புதிய அழைப்பை அனுப்பும்படி அந்த நபரிடம் கேளுங்கள்."
      },
      "hi": {
        "cause": "यह निमंत्रण मान्य नहीं है या पहले ही इस्तेमाल हो चुका है।",
        "next": "उस व्यक्ति से नया निमंत्रण भेजने को कहें।"
      }
    }
  },
  "CANNOT_GUARD_SELF": {
    "http": 400,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "You cannot be your own guardian.",
        "next": "Send the invite to someone you trust."
      },
      "ta": {
        "cause": "நீங்களே உங்கள் பாதுகாவலராக இருக்க முடியாது.",
        "next": "நீங்கள் நம்பும் ஒருவருக்கு அழைப்பை அனுப்புங்கள்."
      },
      "hi": {
        "cause": "आप अपने ही संरक्षक नहीं बन सकते।",
        "next": "निमंत्रण किसी ऐसे व्यक्ति को भेजें जिस पर आपको भरोसा है।"
      }
    }
  },
  "ALREADY_GUARDIAN": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "You are already a guardian for this person.",
        "next": "Nothing else is needed. You will get their requests here."
      },
      "ta": {
        "cause": "நீங்கள் ஏற்கனவே இவருக்குப் பாதுகாவலராக இருக்கிறீர்கள்.",
        "next": "வேறு எதுவும் தேவையில்லை. அவர்களின் கோரிக்கைகள் இங்கே வரும்."
      },
      "hi": {
        "cause": "आप पहले से इस व्यक्ति के संरक्षक हैं।",
        "next": "और कुछ करने की ज़रूरत नहीं है। उनके अनुरोध यहीं आएँगे।"
      }
    }
  },
  "REQUEST_EXPIRED": {
    "http": 410,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This request has expired.",
        "next": "Start the action again if you still need it."
      },
      "ta": {
        "cause": "இந்தக் கோரிக்கையின் காலம் முடிந்துவிட்டது.",
        "next": "இன்னும் தேவைப்பட்டால், செயலை மீண்டும் தொடங்குங்கள்."
      },
      "hi": {
        "cause": "इस अनुरोध की समय-सीमा खत्म हो गई है।",
        "next": "अगर अब भी ज़रूरत है, तो काम फिर से शुरू करें।"
      }
    }
  },
  "REQUEST_ALREADY_DECIDED": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This request has already been answered.",
        "next": "No action is needed from you."
      },
      "ta": {
        "cause": "இந்தக் கோரிக்கைக்கு ஏற்கனவே பதில் அளிக்கப்பட்டது.",
        "next": "நீங்கள் எதுவும் செய்ய வேண்டியதில்லை."
      },
      "hi": {
        "cause": "इस अनुरोध का जवाब पहले ही दिया जा चुका है।",
        "next": "आपको कुछ करने की ज़रूरत नहीं है।"
      }
    }
  },
  "ACTION_NOT_COMPLETED": {
    "http": 403,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This action could not be completed.",
        "next": "Open Co-Sign on your usual phone to see why."
      },
      "ta": {
        "cause": "இந்தச் செயலை முடிக்க முடியவில்லை.",
        "next": "காரணத்தை அறிய உங்கள் வழக்கமான தொலைபேசியில் Co-Sign-ஐத் திறவுங்கள்."
      },
      "hi": {
        "cause": "यह काम पूरा नहीं हो सका।",
        "next": "वजह जानने के लिए अपने रोज़ वाले फ़ोन पर Co-Sign खोलें।"
      }
    }
  },
  "RECOVERY_NOT_COMPLETED": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This recovery could not be completed.",
        "next": "Ask your guardians to help you start again."
      },
      "ta": {
        "cause": "இந்த மீட்பை முடிக்க முடியவில்லை.",
        "next": "மீண்டும் தொடங்க உங்கள் பாதுகாவலர்களின் உதவியைக் கேளுங்கள்."
      },
      "hi": {
        "cause": "यह रिकवरी पूरी नहीं हो सकी।",
        "next": "फिर से शुरू करने के लिए अपने संरक्षकों से मदद माँगें।"
      }
    }
  },
  "CONSENT_REQUIRED": {
    "http": 403,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "You have not agreed to safety checks on this phone yet.",
        "next": "Open Settings, then Safety checks, and choose what to allow."
      },
      "ta": {
        "cause": "இந்தத் தொலைபேசியில் பாதுகாப்புச் சோதனைகளுக்கு நீங்கள் இன்னும் ஒப்புதல் அளிக்கவில்லை.",
        "next": "அமைப்புகளில் பாதுகாப்புச் சோதனைகள் பகுதியைத் திறந்து, எதை அனுமதிப்பது எனத் தேர்ந்தெடுங்கள்."
      },
      "hi": {
        "cause": "आपने इस फ़ोन पर सुरक्षा जाँच की अनुमति अभी नहीं दी है।",
        "next": "सेटिंग में सुरक्षा जाँच खोलें और चुनें कि किसकी अनुमति देनी है।"
      }
    }
  },
  "PROTECTION_OFF": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "Family protection is not switched on for their phone, so it cannot be paused or locked from here.",
        "next": "Call them, and ask them to open Co-Sign and turn on family protection."
      },
      "ta": {
        "cause": "அவரது போனில் குடும்பப் பாதுகாப்பு இயக்கப்படவில்லை. அதனால் இங்கிருந்து அதை நிறுத்தவோ பூட்டவோ முடியாது.",
        "next": "அவரை அழைத்து, Co-Sign-ஐத் திறந்து குடும்பப் பாதுகாப்பை இயக்கச் சொல்லுங்கள்."
      },
      "hi": {
        "cause": "उनके फ़ोन पर पारिवारिक सुरक्षा चालू नहीं है, इसलिए उसे यहाँ से रोका या लॉक नहीं किया जा सकता।",
        "next": "उन्हें कॉल करें और Co-Sign खोलकर पारिवारिक सुरक्षा चालू करने को कहें।"
      }
    }
  },
  "INTERNAL_ERROR": {
    "http": 500,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "Something went wrong on our side.",
        "next": "Try again in a few minutes."
      },
      "ta": {
        "cause": "எங்கள் பக்கத்தில் ஏதோ தவறு நடந்துவிட்டது.",
        "next": "சில நிமிடங்கள் கழித்து மீண்டும் முயலுங்கள்."
      },
      "hi": {
        "cause": "हमारी तरफ़ से कुछ गड़बड़ हो गई।",
        "next": "कुछ मिनट बाद फिर से कोशिश करें।"
      }
    }
  },
  "SIGNIN_BLOCKED_FAKE_SITE": {
    "http": 422,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "This looks like a fake website pretending to be a bank or a well-known company, so your guardian was not asked to sign you in.",
        "next": "Close this page. Do not type any password. Call your guardian on a number you know."
      },
      "ta": {
        "cause": "இது வங்கி அல்லது பிரபல நிறுவனம் போல நடிக்கும் போலி இணையதளம் போலத் தெரிகிறது. அதனால் உங்களை உள்நுழைய வைக்க உங்கள் பாதுகாவலரிடம் கேட்கப்படவில்லை.",
        "next": "இந்தப் பக்கத்தை மூடுங்கள். எந்தக் கடவுச்சொல்லையும் தட்டச்சு செய்யாதீர்கள். உங்களுக்குத் தெரிந்த எண்ணில் உங்கள் பாதுகாவலரை அழையுங்கள்."
      },
      "hi": {
        "cause": "यह किसी बैंक या जानी-मानी कंपनी होने का दिखावा करने वाली नकली वेबसाइट लगती है, इसलिए आपके संरक्षक से साइन-इन करवाने को नहीं कहा गया।",
        "next": "यह पेज बंद करें। कोई पासवर्ड न डालें। किसी जाने-पहचाने नंबर पर अपने संरक्षक को कॉल करें।"
      }
    }
  },
  "SIGNIN_EXPIRED": {
    "http": 410,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "Your guardian did not answer in time.",
        "next": "Try again, or call your guardian on a number you know."
      },
      "ta": {
        "cause": "உங்கள் பாதுகாவலர் நேரத்தில் பதிலளிக்கவில்லை.",
        "next": "மீண்டும் முயலுங்கள், அல்லது உங்களுக்குத் தெரிந்த எண்ணில் உங்கள் பாதுகாவலரை அழையுங்கள்."
      },
      "hi": {
        "cause": "आपके संरक्षक ने समय पर जवाब नहीं दिया।",
        "next": "फिर से कोशिश करें, या किसी जाने-पहचाने नंबर पर अपने संरक्षक को कॉल करें।"
      }
    }
  },
  "SIGNIN_SHOW_REFUSED_ON_CALL": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "You are on a call with a number that is not in your contacts, so the password cannot be shown now. Scammers ask people to read passwords out.",
        "next": "Hang up first. Then try again."
      },
      "ta": {
        "cause": "உங்கள் தொடர்புகளில் இல்லாத எண்ணுடன் நீங்கள் அழைப்பில் இருக்கிறீர்கள், அதனால் இப்போது கடவுச்சொல்லைக் காட்ட முடியாது. மோசடிக்காரர்கள் கடவுச்சொல்லைப் படிக்கச் சொல்வார்கள்.",
        "next": "முதலில் அழைப்பைத் துண்டியுங்கள். பிறகு மீண்டும் முயலுங்கள்."
      },
      "hi": {
        "cause": "आप ऐसे नंबर से कॉल पर हैं जो आपके संपर्कों में नहीं है, इसलिए अभी पासवर्ड नहीं दिखाया जा सकता। धोखेबाज़ लोगों से पासवर्ड पढ़कर सुनाने को कहते हैं।",
        "next": "पहले कॉल काटें। फिर से कोशिश करें।"
      }
    }
  },
  "SIGNIN_NO_GUARDIAN": {
    "http": 409,
    "tier": "public",
    "generic": null,
    "origin": "server",
    "params": [],
    "text": {
      "en": {
        "cause": "You do not have a guardian yet, so nobody can be asked to sign you in.",
        "next": "Open Co-Sign, go to Guardians and invite someone you trust."
      },
      "ta": {
        "cause": "உங்களுக்கு இன்னும் பாதுகாவலர் இல்லை, அதனால் உங்களை உள்நுழைய வைக்க யாரிடமும் கேட்க முடியாது.",
        "next": "Co-Sign-ஐத் திறந்து, பாதுகாவலர்கள் பகுதிக்குச் சென்று, நீங்கள் நம்பும் ஒருவரை அழையுங்கள்."
      },
      "hi": {
        "cause": "आपका अभी कोई संरक्षक नहीं है, इसलिए किसी से साइन-इन करवाने को नहीं कहा जा सकता।",
        "next": "Co-Sign खोलें, संरक्षक में जाएँ और किसी भरोसेमंद व्यक्ति को आमंत्रित करें।"
      }
    }
  }
} as const satisfies Record<string, ErrorEntry>;
export type ErrorCode = keyof typeof ERROR_CATALOG;

export const RISK_RULE_DEFAULTS = {
  "call_unknown_number": {
    "weight": 40,
    "reasons": {
      "en": "You are on a phone call with a number that is not in your contacts.",
      "ta": "உங்கள் தொடர்புகளில் இல்லாத எண்ணுடன் நீங்கள் இப்போது தொலைபேசியில் பேசுகிறீர்கள்.",
      "hi": "आप अभी ऐसे नंबर से फ़ोन पर बात कर रहे हैं जो आपके संपर्कों में नहीं है।"
    }
  },
  "remote_access_app": {
    "weight": 30,
    "reasons": {
      "en": "An app that lets someone else control your phone is installed or running.",
      "ta": "வேறொருவர் உங்கள் தொலைபேசியைக் கட்டுப்படுத்த உதவும் செயலி நிறுவப்பட்டுள்ளது அல்லது இயங்குகிறது.",
      "hi": "ऐसा ऐप इंस्टॉल है या चल रहा है जिससे कोई और आपका फ़ोन चला सकता है।"
    }
  },
  "screen_capture": {
    "weight": 30,
    "reasons": {
      "en": "Your screen is being recorded or shared.",
      "ta": "உங்கள் திரை பதிவு செய்யப்படுகிறது அல்லது பகிரப்படுகிறது.",
      "hi": "आपकी स्क्रीन रिकॉर्ड या शेयर की जा रही है।"
    }
  },
  "sim_changed_72h": {
    "weight": 30,
    "reasons": {
      "en": "The SIM card in this phone changed in the last 3 days.",
      "ta": "கடந்த 3 நாட்களில் இந்தத் தொலைபேசியின் சிம் கார்டு மாற்றப்பட்டுள்ளது.",
      "hi": "पिछले 3 दिनों में इस फ़ोन का सिम कार्ड बदला गया है।"
    }
  },
  "code_pasted": {
    "weight": 15,
    "reasons": {
      "en": "A code was pasted instead of typed. This often happens when someone else sends it to you.",
      "ta": "குறியீடு தட்டச்சு செய்யப்படாமல் ஒட்டப்பட்டது. வேறொருவர் அனுப்பும்போது பொதுவாக இப்படி நடக்கும்.",
      "hi": "कोड टाइप करने के बजाय पेस्ट किया गया। ऐसा अक्सर तब होता है जब कोई और उसे भेजता है।"
    }
  },
  "new_device_24h": {
    "weight": 20,
    "reasons": {
      "en": "This phone was added to your account less than a day ago.",
      "ta": "இந்தத் தொலைபேசி ஒரு நாளுக்குள் உங்கள் கணக்கில் சேர்க்கப்பட்டது.",
      "hi": "यह फ़ोन एक दिन से कम समय पहले आपके खाते में जोड़ा गया था।"
    }
  },
  "late_night": {
    "weight": 10,
    "reasons": {
      "en": "It is between midnight and 5 a.m., when scams are more common.",
      "ta": "இது நள்ளிரவு முதல் அதிகாலை 5 மணி வரையிலான நேரம். இந்த நேரத்தில் மோசடிகள் அதிகம்.",
      "hi": "अभी आधी रात से सुबह 5 बजे के बीच का समय है, जब धोखाधड़ी ज़्यादा होती है।"
    }
  },
  "repeated_failures": {
    "weight": 15,
    "reasons": {
      "en": "There were 3 or more failed attempts in the last 15 minutes.",
      "ta": "கடந்த 15 நிமிடங்களில் 3 அல்லது அதற்கு மேற்பட்ட முயற்சிகள் தோல்வியடைந்தன.",
      "hi": "पिछले 15 मिनट में 3 या उससे ज़्यादा बार कोशिश नाकाम हुई।"
    }
  },
  "integrity_failed": {
    "weight": 40,
    "reasons": {
      "en": "This phone or app did not pass Google's safety check.",
      "ta": "இந்தத் தொலைபேசி அல்லது செயலி Google பாதுகாப்புச் சோதனையில் தேறவில்லை.",
      "hi": "यह फ़ोन या ऐप Google की सुरक्षा जाँच में पास नहीं हुआ।"
    }
  },
  "recent_family_alert": {
    "weight": 30,
    "reasons": {
      "en": "Family protection saw a warning sign on this phone in the last 30 minutes.",
      "ta": "கடந்த 30 நிமிடங்களில் இந்தத் தொலைபேசியில் குடும்பப் பாதுகாப்பு ஓர் எச்சரிக்கை அறிகுறியைக் கண்டது.",
      "hi": "पिछले 30 मिनट में फ़ैमिली प्रोटेक्शन ने इस फ़ोन पर एक चेतावनी का संकेत देखा।"
    }
  }
} as const;
export type RiskRuleKey = keyof typeof RISK_RULE_DEFAULTS;

export const MONITOR_RULES = {
  "payment_screen_during_call": {
    "weight": 70,
    "reasons": {
      "en": "A payment PIN screen was opened while on a call with an unknown number.",
      "ta": "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது பணம் செலுத்தும் PIN திரை திறக்கப்பட்டது.",
      "hi": "किसी अनजान नंबर से कॉल के दौरान पेमेंट PIN वाली स्क्रीन खोली गई।"
    }
  },
  "login_screen_during_call": {
    "weight": 60,
    "reasons": {
      "en": "A bank, payment or email sign-in screen was opened while on a call with an unknown number.",
      "ta": "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது வங்கி, பணம் செலுத்தும் அல்லது மின்னஞ்சல் உள்நுழைவுத் திரை திறக்கப்பட்டது.",
      "hi": "किसी अनजान नंबर से कॉल के दौरान बैंक, पेमेंट या ईमेल की साइन-इन स्क्रीन खोली गई।"
    }
  },
  "otp_during_call": {
    "weight": 60,
    "reasons": {
      "en": "A one-time code arrived while on a call with an unknown number. Scammers ask people to read these out.",
      "ta": "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது ஒருமுறைக் குறியீடு வந்தது. மோசடிக்காரர்கள் இதைப் படிக்கச் சொல்வார்கள்.",
      "hi": "किसी अनजान नंबर से कॉल के दौरान एक बार वाला कोड आया। धोखेबाज़ ऐसे कोड पढ़कर सुनाने को कहते हैं।"
    }
  },
  "sensitive_app_during_call": {
    "weight": 50,
    "reasons": {
      "en": "A bank or payment app was opened while on a call with an unknown number.",
      "ta": "தெரியாத எண்ணுடன் அழைப்பில் இருக்கும்போது வங்கி அல்லது பணம் செலுத்தும் செயலி திறக்கப்பட்டது.",
      "hi": "किसी अनजान नंबर से कॉल के दौरान बैंक या पेमेंट ऐप खोला गया।"
    }
  },
  "remote_access_active": {
    "weight": 40,
    "reasons": {
      "en": "An app that lets someone else control this phone is in use.",
      "ta": "வேறொருவர் இந்தத் தொலைபேசியைக் கட்டுப்படுத்த உதவும் செயலி பயன்பாட்டில் உள்ளது.",
      "hi": "ऐसा ऐप इस्तेमाल हो रहा है जिससे कोई और इस फ़ोन को चला सकता है।"
    }
  },
  "remote_access_during_call": {
    "weight": 30,
    "reasons": {
      "en": "The screen-control app is being used during a call with an unknown number.",
      "ta": "தெரியாத எண்ணுடனான அழைப்பின்போது திரையைக் கட்டுப்படுத்தும் செயலி பயன்படுத்தப்படுகிறது.",
      "hi": "अनजान नंबर से कॉल के दौरान स्क्रीन चलाने वाला ऐप इस्तेमाल हो रहा है।"
    }
  },
  "new_login_alert": {
    "weight": 30,
    "reasons": {
      "en": "An app reported a new sign-in to one of this person's accounts.",
      "ta": "இவரின் கணக்குகளில் ஒன்றில் புதிய உள்நுழைவு நடந்ததாக ஒரு செயலி தெரிவித்தது.",
      "hi": "एक ऐप ने बताया कि इनके किसी खाते में नया साइन-इन हुआ है।"
    }
  },
  "login_alert_during_call": {
    "weight": 30,
    "reasons": {
      "en": "The new sign-in happened during a call with an unknown number.",
      "ta": "அந்தப் புதிய உள்நுழைவு தெரியாத எண்ணுடனான அழைப்பின்போது நடந்தது.",
      "hi": "यह नया साइन-इन किसी अनजान नंबर से कॉल के दौरान हुआ।"
    }
  },
  "unusual_debit": {
    "weight": 30,
    "reasons": {
      "en": "Money left an account in an amount much larger than usual for this person.",
      "ta": "இவருக்கு வழக்கத்தை விட மிக அதிகமான தொகை கணக்கிலிருந்து சென்றுள்ளது.",
      "hi": "इनके खाते से आम तौर से बहुत ज़्यादा रकम निकली है।"
    }
  },
  "long_unknown_call": {
    "weight": 30,
    "reasons": {
      "en": "A call with an unknown, hidden or foreign number has lasted more than 15 minutes.",
      "ta": "தெரியாத, மறைக்கப்பட்ட அல்லது வெளிநாட்டு எண்ணுடனான அழைப்பு 15 நிமிடங்களுக்கு மேல் நீடிக்கிறது.",
      "hi": "अनजान, छिपे हुए या विदेशी नंबर से कॉल 15 मिनट से ज़्यादा चल रही है।"
    }
  },
  "large_debit": {
    "weight": 20,
    "reasons": {
      "en": "A bank or payment app reported a large amount leaving an account.",
      "ta": "ஒரு கணக்கிலிருந்து பெரிய தொகை சென்றதாக வங்கி அல்லது பணம் செலுத்தும் செயலி தெரிவித்தது.",
      "hi": "बैंक या पेमेंट ऐप ने बताया कि खाते से बड़ी रकम निकली है।"
    }
  },
  "very_long_unknown_call": {
    "weight": 20,
    "reasons": {
      "en": "The call has gone on for more than 45 minutes. Fake 'arrest' and 'police' scams keep people on long calls.",
      "ta": "அழைப்பு 45 நிமிடங்களுக்கு மேல் நீடிக்கிறது. போலி 'கைது', 'காவல்துறை' மோசடிகள் மக்களை நீண்ட நேரம் அழைப்பில் வைத்திருக்கும்.",
      "hi": "कॉल 45 मिनट से ज़्यादा चल रही है। नकली 'गिरफ़्तारी' और 'पुलिस' वाले धोखेबाज़ लोगों को लंबी कॉल पर रखते हैं।"
    }
  },
  "repeated_unknown_caller": {
    "weight": 20,
    "reasons": {
      "en": "The same unknown number has called three or more times in two hours.",
      "ta": "அதே தெரியாத எண் இரண்டு மணி நேரத்தில் மூன்று முறை அல்லது அதற்கு மேல் அழைத்துள்ளது.",
      "hi": "एक ही अनजान नंबर से दो घंटे में तीन या ज़्यादा बार कॉल आई है।"
    }
  },
  "hidden_or_international_caller": {
    "weight": 15,
    "reasons": {
      "en": "The caller's number is hidden or from another country.",
      "ta": "அழைப்பவரின் எண் மறைக்கப்பட்டுள்ளது அல்லது வேறு நாட்டைச் சேர்ந்தது.",
      "hi": "कॉल करने वाले का नंबर छिपा है या किसी दूसरे देश का है।"
    }
  },
  "late_night_activity": {
    "weight": 10,
    "reasons": {
      "en": "This happened between midnight and 5 a.m.",
      "ta": "இது நள்ளிரவு முதல் அதிகாலை 5 மணிக்குள் நடந்தது.",
      "hi": "यह आधी रात से सुबह 5 बजे के बीच हुआ।"
    }
  },
  "chat_after_otp": {
    "weight": 40,
    "reasons": {
      "en": "A chat app was opened right after a one-time code arrived. Scammers ask people to send them the code.",
      "ta": "ஒருமுறைக் குறியீடு வந்தவுடன் ஒரு அரட்டைச் செயலி திறக்கப்பட்டது. மோசடிக்காரர்கள் அந்தக் குறியீட்டை அனுப்பச் சொல்வார்கள்.",
      "hi": "एक बार वाला कोड आते ही चैट ऐप खोला गया। धोखेबाज़ लोगों से यह कोड भेजने को कहते हैं।"
    }
  },
  "otp_shared_during_call": {
    "weight": 30,
    "reasons": {
      "en": "This happened during a call with an unknown number, which is how code-sharing scams work.",
      "ta": "இது தெரியாத எண்ணுடனான அழைப்பின்போது நடந்தது. குறியீட்டைப் பகிரவைக்கும் மோசடிகள் இப்படித்தான் நடக்கின்றன.",
      "hi": "यह किसी अनजान नंबर से कॉल के दौरान हुआ। कोड शेयर करवाने वाली धोखाधड़ी ऐसे ही होती है।"
    }
  },
  "screen_share_started": {
    "weight": 40,
    "reasons": {
      "en": "Screen sharing was started. Whoever is watching can see codes, PINs and passwords.",
      "ta": "திரைப் பகிர்வு தொடங்கப்பட்டது. பார்ப்பவர் குறியீடுகள், PIN மற்றும் கடவுச்சொற்களைப் பார்க்க முடியும்.",
      "hi": "स्क्रीन शेयरिंग शुरू की गई। देखने वाला कोड, PIN और पासवर्ड देख सकता है।"
    }
  },
  "screen_share_during_call": {
    "weight": 30,
    "reasons": {
      "en": "Screen sharing was started during a call with an unknown number.",
      "ta": "தெரியாத எண்ணுடனான அழைப்பின்போது திரைப் பகிர்வு தொடங்கப்பட்டது.",
      "hi": "किसी अनजान नंबर से कॉल के दौरान स्क्रीन शेयरिंग शुरू की गई।"
    }
  },
  "remote_access_installed": {
    "weight": 40,
    "reasons": {
      "en": "A remote-control app was just installed. Scammers use these apps to take over phones.",
      "ta": "இப்போதுதான் ஒரு தொலைக் கட்டுப்பாட்டுச் செயலி நிறுவப்பட்டது. மோசடிக்காரர்கள் போன்களைக் கைப்பற்ற இவற்றைப் பயன்படுத்துவார்கள்.",
      "hi": "अभी एक रिमोट-कंट्रोल ऐप इंस्टॉल किया गया। धोखेबाज़ फ़ोन पर कब्ज़ा करने के लिए ऐसे ऐप इस्तेमाल करते हैं।"
    }
  },
  "sideloaded_app_installed": {
    "weight": 30,
    "reasons": {
      "en": "An app was installed from outside the Play Store. Fake bank apps are spread this way.",
      "ta": "Play Store-க்கு வெளியிலிருந்து ஒரு செயலி நிறுவப்பட்டது. போலி வங்கிச் செயலிகள் இப்படித்தான் பரப்பப்படுகின்றன.",
      "hi": "Play Store के बाहर से एक ऐप इंस्टॉल किया गया। नकली बैंक ऐप इसी तरह फैलाए जाते हैं।"
    }
  },
  "install_during_call": {
    "weight": 30,
    "reasons": {
      "en": "The app was installed during a call with an unknown number.",
      "ta": "தெரியாத எண்ணுடனான அழைப்பின்போது அந்தச் செயலி நிறுவப்பட்டது.",
      "hi": "यह ऐप किसी अनजान नंबर से कॉल के दौरान इंस्टॉल किया गया।"
    }
  },
  "new_accessibility_app": {
    "weight": 40,
    "reasons": {
      "en": "An app was given permission to read and control the screen.",
      "ta": "ஒரு செயலிக்குத் திரையைப் படிக்கவும் கட்டுப்படுத்தவும் அனுமதி வழங்கப்பட்டது.",
      "hi": "एक ऐप को स्क्रीन पढ़ने और चलाने की अनुमति दी गई।"
    }
  },
  "new_device_admin_app": {
    "weight": 40,
    "reasons": {
      "en": "An app was made a device administrator, which lets it lock or erase the phone.",
      "ta": "ஒரு செயலி சாதன நிர்வாகியாக்கப்பட்டது. இதனால் அது போனைப் பூட்டவோ அழிக்கவோ முடியும்.",
      "hi": "एक ऐप को डिवाइस एडमिन बनाया गया, जिससे वह फ़ोन लॉक या मिटा सकता है।"
    }
  },
  "access_granted_during_call": {
    "weight": 30,
    "reasons": {
      "en": "The permission was given during a call with an unknown number.",
      "ta": "அந்த அனுமதி தெரியாத எண்ணுடனான அழைப்பின்போது வழங்கப்பட்டது.",
      "hi": "यह अनुमति किसी अनजान नंबर से कॉल के दौरान दी गई।"
    }
  },
  "repeated_unlock_failures": {
    "weight": 40,
    "reasons": {
      "en": "The wrong screen-lock PIN or pattern was entered 3 or more times. Someone else may be trying to get into the phone.",
      "ta": "திரைப் பூட்டின் தவறான PIN அல்லது வடிவம் 3 அல்லது அதற்கு மேல் முறை உள்ளிடப்பட்டது. வேறு யாரோ போனைத் திறக்க முயலலாம்.",
      "hi": "स्क्रीन लॉक का गलत PIN या पैटर्न 3 या ज़्यादा बार डाला गया। हो सकता है कोई और फ़ोन खोलने की कोशिश कर रहा हो।"
    }
  },
  "many_unlock_failures": {
    "weight": 20,
    "reasons": {
      "en": "The wrong PIN was entered 5 or more times within a few minutes.",
      "ta": "சில நிமிடங்களுக்குள் தவறான PIN 5 அல்லது அதற்கு மேல் முறை உள்ளிடப்பட்டது.",
      "hi": "कुछ ही मिनटों में गलत PIN 5 या ज़्यादा बार डाला गया।"
    }
  },
  "failed_login_alert": {
    "weight": 30,
    "reasons": {
      "en": "An app reported a failed sign-in or a wrong password or PIN.",
      "ta": "ஒரு செயலி தோல்வியடைந்த உள்நுழைவு அல்லது தவறான கடவுச்சொல் அல்லது PIN பற்றித் தெரிவித்தது.",
      "hi": "एक ऐप ने बताया कि साइन-इन नहीं हो सका या गलत पासवर्ड या PIN डाला गया।"
    }
  },
  "repeated_failed_logins": {
    "weight": 20,
    "reasons": {
      "en": "Several failed sign-ins were reported in a short time.",
      "ta": "குறுகிய நேரத்தில் பல உள்நுழைவுத் தோல்விகள் தெரிவிக்கப்பட்டன.",
      "hi": "थोड़े ही समय में कई बार साइन-इन न हो पाने की सूचना मिली।"
    }
  },
  "guardian_paused": {
    "weight": 0,
    "reasons": {
      "en": "Your guardian paused this phone for a few minutes to keep you safe.",
      "ta": "உங்களைப் பாதுகாக்க உங்கள் பாதுகாவலர் இந்தப் போனைச் சில நிமிடங்கள் நிறுத்தி வைத்துள்ளார்.",
      "hi": "आपकी सुरक्षा के लिए आपके संरक्षक ने इस फ़ोन को कुछ मिनटों के लिए रोका है।"
    }
  },
  "scam_message": {
    "weight": 30,
    "reasons": {
      "en": "A message used words scammers use, such as a blocked account, KYC, a prize or a police case.",
      "ta": "ஒரு செய்தியில் மோசடிக்காரர்கள் பயன்படுத்தும் வார்த்தைகள் இருந்தன: கணக்கு முடக்கம், KYC, பரிசு அல்லது போலீஸ் வழக்கு போன்றவை.",
      "hi": "एक संदेश में धोखेबाज़ों वाले शब्द थे, जैसे खाता बंद, KYC, इनाम या पुलिस केस।"
    }
  },
  "suspicious_link": {
    "weight": 30,
    "reasons": {
      "en": "A message had a risky link: a shortened link, a strange website ending, or a hidden address.",
      "ta": "ஒரு செய்தியில் ஆபத்தான இணைப்பு இருந்தது: சுருக்கப்பட்ட இணைப்பு, விசித்திரமான இணையதள முடிவு, அல்லது மறைக்கப்பட்ட முகவரி.",
      "hi": "एक संदेश में जोखिम भरा लिंक था: छोटा किया गया लिंक, अजीब वेबसाइट या छिपा हुआ पता।"
    }
  },
  "lookalike_bank_link": {
    "weight": 40,
    "reasons": {
      "en": "A message had a link to a fake website made to look like a bank or a well-known company.",
      "ta": "ஒரு செய்தியில் வங்கி அல்லது பிரபல நிறுவனம் போலத் தோற்றமளிக்கும் போலி இணையதள இணைப்பு இருந்தது.",
      "hi": "एक संदेश में ऐसी नकली वेबसाइट का लिंक था जो किसी बैंक या जानी-मानी कंपनी जैसी दिखती है।"
    }
  },
  "apk_link": {
    "weight": 40,
    "reasons": {
      "en": "A message asked to download an app file directly. Fake bank apps are spread this way.",
      "ta": "ஒரு செய்தி ஒரு செயலிக் கோப்பை நேரடியாகப் பதிவிறக்கச் சொன்னது. போலி வங்கிச் செயலிகள் இப்படித்தான் பரப்பப்படுகின்றன.",
      "hi": "एक संदेश में ऐप फ़ाइल सीधे डाउनलोड करने को कहा गया। नकली बैंक ऐप इसी तरह फैलाए जाते हैं।"
    }
  },
  "scam_message_during_call": {
    "weight": 30,
    "reasons": {
      "en": "The message arrived during a call with an unknown number.",
      "ta": "அந்தச் செய்தி தெரியாத எண்ணுடனான அழைப்பின்போது வந்தது.",
      "hi": "यह संदेश किसी अनजान नंबर से कॉल के दौरान आया।"
    }
  },
  "login_after_scam_link": {
    "weight": 60,
    "reasons": {
      "en": "A sign-in page opened a few minutes after a scam message with a link. It may be a fake page.",
      "ta": "இணைப்புடன் கூடிய மோசடிச் செய்தி வந்த சில நிமிடங்களில் ஒரு உள்நுழைவுப் பக்கம் திறக்கப்பட்டது. அது போலிப் பக்கமாக இருக்கலாம்.",
      "hi": "लिंक वाले धोखाधड़ी संदेश के कुछ मिनट बाद एक साइन-इन पेज खुला। यह नकली पेज हो सकता है।"
    }
  },
  "browser_after_scam_link": {
    "weight": 30,
    "reasons": {
      "en": "The web browser was opened a few minutes after a scam message with a link.",
      "ta": "இணைப்புடன் கூடிய மோசடிச் செய்தி வந்த சில நிமிடங்களில் இணைய உலாவி திறக்கப்பட்டது.",
      "hi": "लिंक वाले धोखाधड़ी संदेश के कुछ मिनट बाद वेब ब्राउज़र खोला गया।"
    }
  },
  "phishing_login_page": {
    "weight": 70,
    "reasons": {
      "en": "A password was about to be typed on a fake website that pretends to be a bank or a well-known company.",
      "ta": "வங்கி அல்லது பிரபல நிறுவனம் போல நடிக்கும் போலி இணையதளத்தில் கடவுச்சொல் தட்டச்சு செய்யப்படவிருந்தது.",
      "hi": "किसी बैंक या जानी-मानी कंपनी होने का दिखावा करने वाली नकली वेबसाइट पर पासवर्ड डाला जाने वाला था।"
    }
  }
} as const;
export type MonitorRuleKey = keyof typeof MONITOR_RULES;

export const ACTION_LABELS = {
  "add_device": {
    "en": "Add a new phone",
    "ta": "புதிய தொலைபேசியைச் சேர்த்தல்",
    "hi": "नया फ़ोन जोड़ना"
  },
  "add_passkey": {
    "en": "Add a passkey",
    "ta": "புதிய பாஸ்கீயைச் சேர்த்தல்",
    "hi": "नई पासकी जोड़ना"
  },
  "remove_guardian": {
    "en": "Remove a guardian",
    "ta": "பாதுகாவலரை நீக்குதல்",
    "hi": "संरक्षक को हटाना"
  },
  "change_phone": {
    "en": "Change phone number",
    "ta": "தொலைபேசி எண்ணை மாற்றுதல்",
    "hi": "फ़ोन नंबर बदलना"
  },
  "change_email": {
    "en": "Change email address",
    "ta": "மின்னஞ்சல் முகவரியை மாற்றுதல்",
    "hi": "ईमेल पता बदलना"
  },
  "view_recovery_codes": {
    "en": "Create new recovery codes",
    "ta": "புதிய மீட்புக் குறியீடுகளை உருவாக்குதல்",
    "hi": "नए रिकवरी कोड बनाना"
  },
  "delete_account": {
    "en": "Delete the account",
    "ta": "கணக்கை நீக்குதல்",
    "hi": "खाता हटाना"
  }
} as const;
export type ActionKey = keyof typeof ACTION_LABELS;

export const NOTIFICATIONS = {
  "guardian_request": {
    "en": {
      "title": "{name} needs your approval",
      "body": "{action}. Check with them on a number you know before you approve.",
      "actions": {
        "approve": "Approve",
        "deny": "Deny"
      }
    },
    "ta": {
      "title": "{name} உங்கள் ஒப்புதலைக் கேட்கிறார்",
      "body": "{action}. ஒப்புதல் அளிப்பதற்கு முன், உங்களுக்குத் தெரிந்த எண்ணில் அவரிடம் உறுதிசெய்யுங்கள்.",
      "actions": {
        "approve": "அனுமதி",
        "deny": "மறு"
      }
    },
    "hi": {
      "title": "{name} को आपकी मंज़ूरी चाहिए",
      "body": "{action}। मंज़ूरी देने से पहले, किसी जाने-पहचाने नंबर पर उनसे पुष्टि करें।",
      "actions": {
        "approve": "मंज़ूरी दें",
        "deny": "मना करें"
      }
    }
  },
  "recovery_request": {
    "en": {
      "title": "{name} is moving to a new phone",
      "body": "Only approve if they asked you themselves, on a call you trust."
    },
    "ta": {
      "title": "{name} புதிய தொலைபேசிக்கு மாறுகிறார்",
      "body": "நீங்கள் நம்பும் அழைப்பில் அவரே கேட்டிருந்தால் மட்டுமே ஒப்புதல் அளியுங்கள்."
    },
    "hi": {
      "title": "{name} नए फ़ोन पर जा रहे हैं",
      "body": "मंज़ूरी तभी दें जब उन्होंने ख़ुद, किसी भरोसेमंद कॉल पर, आपसे कहा हो।"
    }
  },
  "recovery_alert": {
    "en": {
      "title": "Someone is moving your account to a new phone",
      "body": "If this is not you, open Co-Sign and tap Cancel recovery."
    },
    "ta": {
      "title": "ஒருவர் உங்கள் கணக்கைப் புதிய தொலைபேசிக்கு மாற்றுகிறார்",
      "body": "இது நீங்கள் இல்லையென்றால், Co-Sign-ஐத் திறந்து மீட்பை ரத்துசெய் என்பதைத் தட்டுங்கள்."
    },
    "hi": {
      "title": "कोई आपका खाता नए फ़ोन पर ले जा रहा है",
      "body": "अगर यह आप नहीं हैं, तो Co-Sign खोलें और रिकवरी रद्द करें पर टैप करें।"
    }
  },
  "cooloff_started": {
    "en": {
      "title": "A safety pause has started",
      "body": "{action} will wait until {until}. You can cancel it any time."
    },
    "ta": {
      "title": "பாதுகாப்பு இடைநிறுத்தம் தொடங்கியது",
      "body": "{action} {until} வரை காத்திருக்கும். எப்போது வேண்டுமானாலும் ரத்து செய்யலாம்."
    },
    "hi": {
      "title": "सुरक्षा के लिए रोक शुरू हुई",
      "body": "{action} {until} तक रुका रहेगा। आप इसे कभी भी रद्द कर सकते हैं।"
    }
  },
  "stepup_resolved": {
    "en": {
      "title": "Your request was answered",
      "body": "Open Co-Sign to see the result."
    },
    "ta": {
      "title": "உங்கள் கோரிக்கைக்குப் பதில் வந்துள்ளது",
      "body": "முடிவைப் பார்க்க Co-Sign-ஐத் திறவுங்கள்."
    },
    "hi": {
      "title": "आपके अनुरोध का जवाब आ गया",
      "body": "नतीजा देखने के लिए Co-Sign खोलें।"
    }
  },
  "guardian_change": {
    "en": {
      "title": "Your guardians are changing",
      "body": "{name} will be {change} in 24 hours. If this is not you, open Co-Sign to cancel."
    },
    "ta": {
      "title": "உங்கள் பாதுகாவலர்கள் மாறுகிறார்கள்",
      "body": "{name} 24 மணி நேரத்தில் {change}. இது நீங்கள் இல்லையென்றால், ரத்து செய்ய Co-Sign-ஐத் திறவுங்கள்."
    },
    "hi": {
      "title": "आपके संरक्षक बदल रहे हैं",
      "body": "{name} 24 घंटे में {change}। अगर यह आप नहीं हैं, तो रद्द करने के लिए Co-Sign खोलें।"
    }
  },
  "new_device": {
    "en": {
      "title": "A new phone was added to your account",
      "body": "If this was not you, open Co-Sign on this phone and remove it."
    },
    "ta": {
      "title": "உங்கள் கணக்கில் புதிய தொலைபேசி சேர்க்கப்பட்டது",
      "body": "இது நீங்கள் இல்லையென்றால், இந்தத் தொலைபேசியில் Co-Sign-ஐத் திறந்து அதை நீக்குங்கள்."
    },
    "hi": {
      "title": "आपके खाते में नया फ़ोन जोड़ा गया",
      "body": "अगर यह आपने नहीं किया, तो इस फ़ोन पर Co-Sign खोलें और उसे हटाएँ।"
    }
  },
  "monitor_alert": {
    "en": {
      "title": "{name} may need help now",
      "body": "{what}. Call them yourself on a number you know.",
      "actions": {
        "pause": "Pause their phone",
        "open": "Open"
      }
    },
    "ta": {
      "title": "{name}-க்கு இப்போது உதவி தேவைப்படலாம்",
      "body": "{what}. உங்களுக்குத் தெரிந்த எண்ணில் நீங்களே அவரை அழையுங்கள்.",
      "actions": {
        "pause": "போனை நிறுத்து",
        "open": "திற"
      }
    },
    "hi": {
      "title": "{name} को अभी मदद की ज़रूरत हो सकती है",
      "body": "{what}। किसी जाने-पहचाने नंबर पर ख़ुद उन्हें कॉल करें।",
      "actions": {
        "pause": "फ़ोन रोकें",
        "open": "खोलें"
      }
    }
  },
  "monitor_paused": {
    "en": {
      "title": "{name}'s phone is paused for safety",
      "body": "{what}. Open Co-Sign to release the pause after you have spoken to them.",
      "actions": {
        "release": "Let them continue",
        "open": "Open"
      }
    },
    "ta": {
      "title": "பாதுகாப்பிற்காக {name}-இன் தொலைபேசி நிறுத்தி வைக்கப்பட்டுள்ளது",
      "body": "{what}. அவரிடம் பேசிய பிறகு இடைநிறுத்தத்தை நீக்க Co-Sign-ஐத் திறவுங்கள்.",
      "actions": {
        "release": "தொடர அனுமதி",
        "open": "திற"
      }
    },
    "hi": {
      "title": "सुरक्षा के लिए {name} का फ़ोन रोका गया है",
      "body": "{what}। उनसे बात करने के बाद रोक हटाने के लिए Co-Sign खोलें।",
      "actions": {
        "release": "आगे बढ़ने दें",
        "open": "खोलें"
      }
    }
  },
  "monitor_release_ask": {
    "en": {
      "title": "{name} is asking to continue",
      "body": "Their phone was paused for safety: {what}. Let them continue only after you have spoken to them.",
      "actions": {
        "release": "Let them continue",
        "open": "Open"
      }
    },
    "ta": {
      "title": "{name} தொடர அனுமதி கேட்கிறார்",
      "body": "பாதுகாப்புக்காக அவரது போன் நிறுத்தப்பட்டது: {what}. அவரிடம் பேசிய பிறகே தொடர அனுமதியுங்கள்.",
      "actions": {
        "release": "தொடர அனுமதி",
        "open": "திற"
      }
    },
    "hi": {
      "title": "{name} आगे बढ़ने की अनुमति माँग रहे हैं",
      "body": "सुरक्षा के लिए उनका फ़ोन रोका गया: {what}। उनसे बात करने के बाद ही अनुमति दें।",
      "actions": {
        "release": "आगे बढ़ने दें",
        "open": "खोलें"
      }
    }
  },
  "monitor_help": {
    "en": {
      "title": "{name} asked you for help",
      "body": "They pressed \"I need help\" in Co-Sign. Call them now on a number you know."
    },
    "ta": {
      "title": "{name} உங்களிடம் உதவி கேட்கிறார்",
      "body": "அவர் Co-Sign-இல் \"எனக்கு உதவி வேண்டும்\" என்பதை அழுத்தினார். உங்களுக்குத் தெரிந்த எண்ணில் இப்போதே அவரை அழையுங்கள்."
    },
    "hi": {
      "title": "{name} ने आपसे मदद माँगी है",
      "body": "उन्होंने Co-Sign में \"मुझे मदद चाहिए\" दबाया। किसी जाने-पहचाने नंबर पर अभी उन्हें कॉल करें।"
    }
  },
  "guardian_started": {
    "en": {
      "title": "{name} is now your guardian",
      "body": "They will be told if something on your phone looks like a scam. If you did not add them, open Co-Sign now and remove them."
    },
    "ta": {
      "title": "{name} இப்போது உங்கள் பாதுகாவலர்",
      "body": "உங்கள் போனில் ஏதாவது மோசடி போலத் தெரிந்தால் அவருக்குத் தெரிவிக்கப்படும். நீங்கள் அவரைச் சேர்க்கவில்லை என்றால், இப்போதே Co-Sign-ஐத் திறந்து அவரை நீக்குங்கள்."
    },
    "hi": {
      "title": "{name} अब आपके संरक्षक हैं",
      "body": "आपके फ़ोन पर कुछ धोखाधड़ी जैसा लगे तो उन्हें बताया जाएगा। अगर आपने उन्हें नहीं जोड़ा, तो अभी Co-Sign खोलें और उन्हें हटाएँ।"
    }
  },
  "guardian_joined": {
    "en": {
      "title": "{name} added a new guardian",
      "body": "{guardian} is now also a guardian for {name}. If that seems wrong, call {name} on a number you know."
    },
    "ta": {
      "title": "{name} புதிய பாதுகாவலரைச் சேர்த்தார்",
      "body": "{guardian} இப்போது {name}-க்கும் பாதுகாவலர். இது தவறாகத் தோன்றினால், உங்களுக்குத் தெரிந்த எண்ணில் {name}-ஐ அழையுங்கள்."
    },
    "hi": {
      "title": "{name} ने एक नया संरक्षक जोड़ा",
      "body": "{guardian} अब {name} के भी संरक्षक हैं। अगर यह गलत लगे, तो किसी जाने-पहचाने नंबर पर {name} को कॉल करें।"
    }
  },
  "guardian_undone": {
    "en": {
      "title": "{name} removed you as a guardian",
      "body": "You will no longer be alerted about their phone. If that seems wrong, call {name} on a number you know."
    },
    "ta": {
      "title": "{name} உங்களைப் பாதுகாவலர் பொறுப்பிலிருந்து நீக்கினார்",
      "body": "அவரது போனைப் பற்றி இனி உங்களுக்குத் தெரிவிக்கப்படாது. இது தவறாகத் தோன்றினால், உங்களுக்குத் தெரிந்த எண்ணில் {name}-ஐ அழையுங்கள்."
    },
    "hi": {
      "title": "{name} ने आपको संरक्षक पद से हटा दिया",
      "body": "अब आपको उनके फ़ोन के बारे में नहीं बताया जाएगा। अगर यह गलत लगे, तो किसी जाने-पहचाने नंबर पर {name} को कॉल करें।"
    }
  },
  "signin_request": {
    "en": {
      "title": "{name} wants to sign in to {app}",
      "body": "{what}Check with them first on a number you know. Co-Sign will fill the password on their phone; they will not see it.",
      "actions": {
        "fill": "Fill password",
        "deny": "Deny"
      }
    },
    "ta": {
      "title": "{name} {app}-இல் உள்நுழைய விரும்புகிறார்",
      "body": "{what}முதலில் உங்களுக்குத் தெரிந்த எண்ணில் அவரிடம் உறுதிசெய்யுங்கள். Co-Sign அவரது போனில் கடவுச்சொல்லை நிரப்பும்; அவருக்கு அது தெரியாது.",
      "actions": {
        "fill": "கடவுச்சொல்லை நிரப்பு",
        "deny": "மறு"
      }
    },
    "hi": {
      "title": "{name} {app} में साइन इन करना चाहते हैं",
      "body": "{what}पहले किसी जाने-पहचाने नंबर पर उनसे पुष्टि करें। Co-Sign उनके फ़ोन पर पासवर्ड भर देगा; उन्हें वह दिखेगा नहीं।",
      "actions": {
        "fill": "पासवर्ड भरें",
        "deny": "मना करें"
      }
    }
  }
} as const;
export type NotificationKey = keyof typeof NOTIFICATIONS;

export const TERMS = {
  "guardian_added": {
    "en": "added as a guardian",
    "ta": "பாதுகாவலராகச் சேர்க்கப்படுவார்",
    "hi": "संरक्षक के रूप में जोड़े जाएँगे"
  },
  "guardian_removed": {
    "en": "removed as a guardian",
    "ta": "பாதுகாவலர் பொறுப்பிலிருந்து நீக்கப்படுவார்",
    "hi": "संरक्षक पद से हटाए जाएँगे"
  },
  "signin_risky_call": {
    "en": "They are on a call with a number that is not in their contacts.",
    "ta": "அவர் தொடர்புகளில் இல்லாத எண்ணுடன் அழைப்பில் இருக்கிறார்.",
    "hi": "वे ऐसे नंबर से कॉल पर हैं जो उनके संपर्कों में नहीं है।"
  },
  "signin_recent_alert": {
    "en": "Something on their phone looked like a scam in the last 30 minutes.",
    "ta": "கடந்த 30 நிமிடங்களில் அவரது போனில் ஏதோ மோசடி போலத் தெரிந்தது.",
    "hi": "पिछले 30 मिनट में उनके फ़ोन पर कुछ धोखाधड़ी जैसा दिखा।"
  },
  "signin_suspicious_site": {
    "en": "The website has warning signs (a strange address or ending). Make sure it is the real one.",
    "ta": "இந்த இணையதளத்தில் எச்சரிக்கை அறிகுறிகள் உள்ளன (விசித்திரமான முகவரி அல்லது முடிவு). இது உண்மையானதா என்று உறுதிசெய்யுங்கள்.",
    "hi": "इस वेबसाइट में चेतावनी के संकेत हैं (अजीब पता या अंत)। पक्का करें कि यह असली है।"
  },
  "signin_unknown_site": {
    "en": "Co-Sign does not know this website. Make sure it is the one they meant to open.",
    "ta": "Co-Sign-க்கு இந்த இணையதளம் தெரியாது. அவர் திறக்க நினைத்தது இதுதானா என்று உறுதிசெய்யுங்கள்.",
    "hi": "Co-Sign इस वेबसाइट को नहीं जानता। पक्का करें कि वे यही खोलना चाहते थे।"
  }
} as const;

/** From shared/link-rules.json: fake-site, risky-link and scam-message rules. */
export const LINK_RULES = {
  "brands": {
    "sbi": {
      "name": "SBI",
      "domains": [
        "onlinesbi.sbi",
        "sbi.co.in",
        "onlinesbi.com",
        "sbiyono.sbi",
        "sbicard.com"
      ],
      "keywords": [
        "sbi",
        "yono",
        "onlinesbi"
      ]
    },
    "hdfc": {
      "name": "HDFC Bank",
      "domains": [
        "hdfcbank.com",
        "hdfc.com",
        "payzapp.in"
      ],
      "keywords": [
        "hdfc",
        "hdfcbank"
      ]
    },
    "icici": {
      "name": "ICICI Bank",
      "domains": [
        "icicibank.com",
        "icicidirect.com"
      ],
      "keywords": [
        "icici",
        "icicibank"
      ]
    },
    "axis": {
      "name": "Axis Bank",
      "domains": [
        "axisbank.com",
        "axis.bank.in"
      ],
      "keywords": [
        "axisbank"
      ]
    },
    "kotak": {
      "name": "Kotak Bank",
      "domains": [
        "kotak.com",
        "kotaksecurities.com"
      ],
      "keywords": [
        "kotak"
      ]
    },
    "pnb": {
      "name": "PNB",
      "domains": [
        "pnbindia.in",
        "netpnb.com",
        "pnb.co.in"
      ],
      "keywords": [
        "pnb",
        "pnbindia"
      ]
    },
    "bob": {
      "name": "Bank of Baroda",
      "domains": [
        "bankofbaroda.in",
        "bobibanking.com",
        "bankofbaroda.com"
      ],
      "keywords": [
        "bankofbaroda",
        "barodabank"
      ]
    },
    "canara": {
      "name": "Canara Bank",
      "domains": [
        "canarabank.com",
        "canarabank.in"
      ],
      "keywords": [
        "canara",
        "canarabank"
      ]
    },
    "indianbank": {
      "name": "Indian Bank",
      "domains": [
        "indianbank.in",
        "indianbank.net.in"
      ],
      "keywords": [
        "indianbank"
      ]
    },
    "union": {
      "name": "Union Bank",
      "domains": [
        "unionbankofindia.co.in",
        "unionbankonline.co.in"
      ],
      "keywords": [
        "unionbank",
        "unionbankofindia"
      ]
    },
    "npci": {
      "name": "UPI / BHIM",
      "domains": [
        "npci.org.in",
        "bhimupi.org.in"
      ],
      "keywords": [
        "npci",
        "bhim",
        "bhimupi"
      ]
    },
    "paytm": {
      "name": "Paytm",
      "domains": [
        "paytm.com",
        "paytm.in",
        "paytmbank.com"
      ],
      "keywords": [
        "paytm"
      ]
    },
    "phonepe": {
      "name": "PhonePe",
      "domains": [
        "phonepe.com"
      ],
      "keywords": [
        "phonepe"
      ]
    },
    "gpay": {
      "name": "Google Pay",
      "domains": [
        "pay.google.com"
      ],
      "keywords": [
        "gpay",
        "googlepay"
      ]
    },
    "google": {
      "name": "Google",
      "domains": [
        "google.com",
        "google.co.in",
        "gmail.com",
        "youtube.com",
        "googleapis.com",
        "gstatic.com",
        "android.com",
        "googleusercontent.com",
        "goo.gl",
        "g.co"
      ],
      "keywords": [
        "google",
        "gmail"
      ]
    },
    "microsoft": {
      "name": "Microsoft",
      "domains": [
        "microsoft.com",
        "live.com",
        "outlook.com",
        "office.com",
        "microsoftonline.com"
      ],
      "keywords": [
        "microsoft",
        "outlook",
        "hotmail"
      ]
    },
    "amazon": {
      "name": "Amazon",
      "domains": [
        "amazon.in",
        "amazon.com",
        "amazonpay.in",
        "amzn.to",
        "amzn.in"
      ],
      "keywords": [
        "amazon",
        "amazonpay"
      ]
    },
    "flipkart": {
      "name": "Flipkart",
      "domains": [
        "flipkart.com",
        "fkrt.it"
      ],
      "keywords": [
        "flipkart"
      ]
    },
    "whatsapp": {
      "name": "WhatsApp",
      "domains": [
        "whatsapp.com",
        "whatsapp.net",
        "wa.me"
      ],
      "keywords": [
        "whatsapp"
      ]
    },
    "meta": {
      "name": "Facebook / Instagram",
      "domains": [
        "facebook.com",
        "fb.com",
        "instagram.com",
        "messenger.com",
        "meta.com"
      ],
      "keywords": [
        "facebook",
        "instagram"
      ]
    },
    "incometax": {
      "name": "Income Tax",
      "domains": [
        "incometax.gov.in",
        "incometaxindia.gov.in"
      ],
      "keywords": [
        "incometax",
        "itrefund"
      ]
    },
    "epfo": {
      "name": "EPFO",
      "domains": [
        "epfindia.gov.in",
        "epfo.gov.in"
      ],
      "keywords": [
        "epfo",
        "epfindia"
      ]
    },
    "uidai": {
      "name": "Aadhaar (UIDAI)",
      "domains": [
        "uidai.gov.in",
        "myaadhaar.uidai.gov.in"
      ],
      "keywords": [
        "uidai",
        "aadhaar",
        "aadhar"
      ]
    },
    "indiapost": {
      "name": "India Post",
      "domains": [
        "indiapost.gov.in",
        "ippbonline.com"
      ],
      "keywords": [
        "indiapost",
        "ippb"
      ]
    },
    "govin": {
      "name": "Government of India",
      "domains": [
        "gov.in",
        "nic.in",
        "india.gov.in"
      ],
      "keywords": []
    }
  },
  "multiPartSuffixes": [
    "co.in",
    "net.in",
    "org.in",
    "gov.in",
    "nic.in",
    "ac.in",
    "edu.in",
    "res.in",
    "firm.in",
    "gen.in",
    "ind.in",
    "bank.in",
    "co.uk",
    "org.uk",
    "com.au",
    "co.jp",
    "com.br",
    "com.sg"
  ],
  "shorteners": [
    "bit.ly",
    "tinyurl.com",
    "cutt.ly",
    "rb.gy",
    "is.gd",
    "t.ly",
    "shorturl.at",
    "rebrand.ly",
    "tiny.cc",
    "ow.ly",
    "s.id",
    "v.gd",
    "shrtco.de",
    "t.co",
    "lnkd.in",
    "bitly.com",
    "u.to",
    "clck.ru"
  ],
  "riskyTlds": [
    "xyz",
    "top",
    "click",
    "buzz",
    "icu",
    "cyou",
    "rest",
    "sbs",
    "cfd",
    "lol",
    "monster",
    "quest",
    "bond",
    "tk",
    "ml",
    "ga",
    "cf",
    "gq",
    "zip",
    "mov",
    "country",
    "kim",
    "work",
    "loan",
    "win",
    "bid",
    "party",
    "review",
    "date",
    "racing",
    "stream",
    "download",
    "fit",
    "gdn",
    "vip",
    "live",
    "shop",
    "online",
    "site",
    "fun",
    "space",
    "pw"
  ],
  "linkTlds": [
    "com",
    "in",
    "net",
    "org",
    "co",
    "info",
    "io",
    "me",
    "app",
    "dev",
    "biz",
    "us",
    "uk",
    "ly",
    "gl",
    "to",
    "it",
    "id",
    "de",
    "ru",
    "cn",
    "sbi",
    "bank",
    "gov",
    "edu",
    "xyz",
    "top",
    "click",
    "buzz",
    "icu",
    "cyou",
    "rest",
    "sbs",
    "cfd",
    "lol",
    "monster",
    "quest",
    "bond",
    "tk",
    "ml",
    "ga",
    "cf",
    "gq",
    "zip",
    "mov",
    "country",
    "kim",
    "work",
    "loan",
    "win",
    "bid",
    "party",
    "review",
    "date",
    "racing",
    "stream",
    "download",
    "fit",
    "gdn",
    "vip",
    "live",
    "shop",
    "online",
    "site",
    "fun",
    "space",
    "pw",
    "link",
    "store",
    "tech",
    "cc",
    "ws"
  ],
  "scamPhrases": {
    "kyc_threat": [
      "kyc",
      "pan card update",
      "pan update",
      "update your pan",
      "aadhaar link",
      "link your aadhaar",
      "re-kyc",
      "ekyc",
      "केवाईसी",
      "पैन अपडेट",
      "கேஒய்சி",
      "பான் அப்டேட்"
    ],
    "account_blocked": [
      "account will be blocked",
      "account has been blocked",
      "account is blocked",
      "account suspended",
      "account will be suspended",
      "account will be closed",
      "card blocked",
      "card will be blocked",
      "sim will be blocked",
      "sim card will be deactivated",
      "deactivated today",
      "खाता बंद",
      "खाता ब्लॉक",
      "कार्ड ब्लॉक",
      "கணக்கு முடக்கப்படும்",
      "கணக்கு தடுக்கப்பட்டது",
      "கணக்கு முடக்கப்பட்டது"
    ],
    "prize_lottery": [
      "you have won",
      "congratulations you",
      "lottery",
      "lucky draw",
      "cash prize",
      "jackpot",
      "kbc",
      "reward points expire",
      "redeem your reward",
      "लॉटरी",
      "इनाम",
      "आपने जीता",
      "லாட்டரி",
      "பரிசு வென்றீர்கள்",
      "நீங்கள் வென்றீர்கள்"
    ],
    "refund": [
      "refund of rs",
      "refund is pending",
      "claim your refund",
      "tax refund",
      "income tax refund",
      "cashback of rs",
      "रिफंड",
      "ரீஃபண்ட்",
      "பணத்தைத் திரும்பப் பெற"
    ],
    "job_offer": [
      "work from home",
      "part time job",
      "part-time job",
      "earn rs",
      "daily income",
      "earn daily",
      "salary per day",
      "like youtube videos",
      "rate hotels",
      "telegram task",
      "घर बैठे कमाएं",
      "पार्ट टाइम जॉब",
      "வீட்டிலிருந்தே சம்பாதி",
      "பகுதி நேர வேலை"
    ],
    "electricity_cut": [
      "electricity will be disconnected",
      "power will be disconnected",
      "electricity connection will be",
      "electricity bill not paid",
      "bijli",
      "बिजली कनेक्शन",
      "बिजली काट",
      "மின் இணைப்பு துண்டிக்கப்படும்",
      "மின்சாரம் துண்டிக்கப்படும்"
    ],
    "parcel_customs": [
      "parcel is on hold",
      "parcel has been held",
      "customs duty",
      "courier is pending",
      "delivery failed",
      "your package could not be delivered",
      "illegal items",
      "पार्सल",
      "பார்சல்"
    ],
    "police_threat": [
      "digital arrest",
      "cbi officer",
      "narcotics",
      "money laundering",
      "arrest warrant",
      "cyber crime department",
      "police case against you",
      "डिजिटल अरेस्ट",
      "गिरफ्तारी",
      "டிஜிட்டல் கைது",
      "கைது வாரண்ட்"
    ],
    "urgent_action": [
      "click the link",
      "click here",
      "click on the link",
      "within 24 hours",
      "immediately",
      "urgent",
      "last date today",
      "verify now",
      "update now",
      "तुरंत",
      "लिंक पर क्लिक",
      "உடனடியாக",
      "இணைப்பைக் கிளிக்"
    ],
    "share_code": [
      "share the otp",
      "share otp",
      "tell the otp",
      "send the otp",
      "forward the code",
      "ओटीपी बताएं",
      "ओटीपी शेयर",
      "ஓடிபியைப் பகிர",
      "ஓடிபி சொல்லுங்கள்"
    ]
  }
} as const;
export type ScamPhraseKind = keyof typeof LINK_RULES.scamPhrases;
