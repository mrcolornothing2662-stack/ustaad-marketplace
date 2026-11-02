export type SupportedLanguage = "EN" | "HI" | "PA";

export interface TranslatedMessage {
  title: string;
  body: string;
}

export const notificationTemplates: Record<
  string,
  Record<SupportedLanguage, (vars?: Record<string, string | number>) => TranslatedMessage>
> = {
  BOOKING_REQUEST: {
    EN: () => ({
      title: "New booking request",
      body: "You have received a new booking request from a customer.",
    }),
    HI: () => ({
      title: "नया बुकिंग अनुरोध",
      body: "आपको एक ग्राहक से नया बुकिंग अनुरोध प्राप्त हुआ है।",
    }),
    PA: () => ({
      title: "ਨਵੀਂ ਬੁਕਿੰਗ ਬੇਨਤੀ",
      body: "ਤੁਹਾਨੂੰ ਇੱਕ ਗਾਹਕ ਵੱਲੋਂ ਨਵੀਂ ਬੁਕਿੰਗ ਬੇਨਤੀ ਪ੍ਰਾਪਤ ਹੋਈ ਹੈ।",
    }),
  },
  BOOKING_ACCEPTED: {
    EN: () => ({
      title: "Booking accepted",
      body: "Worker accepted your request. Please confirm booking to proceed.",
    }),
    HI: () => ({
      title: "बुकिंग स्वीकार की गई",
      body: "उस्ताद ने आपका अनुरोध स्वीकार कर लिया है। कृपया पुष्टि करें।",
    }),
    PA: () => ({
      title: "ਬੁਕਿੰਗ ਸਵੀਕਾਰ ਕੀਤੀ ਗਈ",
      body: "ਉਸਤਾਦ ਨੇ ਤੁਹਾਡੀ ਬੇਨਤੀ ਸਵੀਕਾਰ ਕਰ ਲਈ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਪੁਸ਼ਟੀ ਕਰੋ।",
    }),
  },
  BOOKING_REJECTED: {
    EN: () => ({
      title: "Booking declined",
      body: "Worker was unavailable to take this request.",
    }),
    HI: () => ({
      title: "बुकिंग अस्वीकार",
      body: "उस्ताद इस अनुरोध को स्वीकार करने में असमर्थ रहे।",
    }),
    PA: () => ({
      title: "ਬੁਕਿੰਗ ਅਸਵੀਕਾਰ",
      body: "ਉਸਤਾਦ ਇਸ ਬੇਨਤੀ ਨੂੰ ਸਵੀਕਾਰ ਕਰਨ ਵਿੱਚ ਅਸਮਰੱਥ ਰਹੇ।",
    }),
  },
  BOOKING_CONFIRMED: {
    EN: (v) => ({
      title: "Booking Confirmed",
      body: v?.workerName
        ? `Booking confirmed with ${v.workerName} for ₹${v.price ?? ""}. Chat is now available.`
        : "Booking is confirmed. Chat is now available.",
    }),
    HI: (v) => ({
      title: "बुकिंग पक्की हो गई",
      body: v?.workerName
        ? `${v.workerName} के साथ ₹${v.price ?? ""} में बुकिंग पक्की हो गई है। चैट अब उपलब्ध है।`
        : "बुकिंग पक्की हो गई है। चैट अब उपलब्ध है।",
    }),
    PA: (v) => ({
      title: "ਬੁਕਿੰਗ ਪੱਕੀ ਹੋ ਗਈ",
      body: v?.workerName
        ? `${v.workerName} ਨਾਲ ₹${v.price ?? ""} ਵਿੱਚ ਬੁਕਿੰਗ ਪੱਕੀ ਹੋ ਗਈ ਹੈ। ਗੱਲਬਾਤ ਹੁਣ ਉਪਲਬਧ ਹੈ।`
        : "ਬੁਕਿੰਗ ਪੱਕੀ ਹੋ ਗਈ ਹੈ। ਗੱਲਬਾਤ ਹੁਣ ਉਪਲਬਧ ਹੈ।",
    }),
  },
  WORKER_ON_THE_WAY: {
    EN: () => ({
      title: "Worker on the way",
      body: "Worker has started traveling to your job location.",
    }),
    HI: () => ({
      title: "उस्ताद रास्ते में हैं",
      body: "उस्ताद आपके पते के लिए निकल चुके हैं।",
    }),
    PA: () => ({
      title: "ਉਸਤਾਦ ਰਸਤੇ ਵਿੱਚ ਹਨ",
      body: "ਉਸਤਾਦ ਤੁਹਾਡੇ ਪਤੇ ਲਈ ਰਵਾਨਾ ਹੋ ਚੁੱਕੇ ਹਨ।",
    }),
  },
  JOB_STARTED: {
    EN: () => ({
      title: "Job started",
      body: "Start OTP verified. Work is now in progress.",
    }),
    HI: () => ({
      title: "काम शुरू हो गया",
      body: "ओटीपी सत्यापित हुआ। काम प्रगति पर है।",
    }),
    PA: () => ({
      title: "ਕੰਮ ਸ਼ੁਰੂ ਹੋ ਗਿਆ",
      body: "ਓਟੀਪੀ ਪ੍ਰਮਾਣਿਤ ਹੋਇਆ। ਕੰਮ ਚੱਲ ਰਿਹਾ ਹੈ।",
    }),
  },
  WORK_COMPLETED: {
    EN: () => ({
      title: "Work completed",
      body: "Worker submitted completion. Please inspect, sign and confirm.",
    }),
    HI: () => ({
      title: "काम पूरा हुआ",
      body: "उस्ताद ने काम पूरा कर दिया है। कृपया जांचें, हस्ताक्षर करें और पुष्टि करें।",
    }),
    PA: () => ({
      title: "ਕੰਮ ਪੂਰਾ ਹੋਇਆ",
      body: "ਉਸਤਾਦ ਨੇ ਕੰਮ ਮੁਕੰਮਲ ਕਰ ਦਿੱਤਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਜਾਂਚ ਕਰੋ, ਦਸਤਖਤ ਕਰੋ ਅਤੇ ਪੁਸ਼ਟੀ ਕਰੋ।",
    }),
  },
  PAYMENT_CONFIRMATION: {
    EN: (v) => ({
      title: "Payment confirmed",
      body: `Direct payment of ₹${v?.amount ?? ""} settled between parties.`,
    }),
    HI: (v) => ({
      title: "भुगतान की पुष्टि",
      body: `दोनों पक्षों के बीच ₹${v?.amount ?? ""} का सीधा भुगतान पूरा हुआ।`,
    }),
    PA: (v) => ({
      title: "ਭੁਗਤਾਨ ਦੀ ਪੁਸ਼ਟੀ",
      body: `ਦੋਵਾਂ ਧਿਰਾਂ ਵਿਚਕਾਰ ₹${v?.amount ?? ""} ਦਾ ਸਿੱਧਾ ਭੁਗਤਾਨ ਮੁਕੰਮਲ ਹੋਇਆ।`,
    }),
  },
  PAYMENT_SETTLED: {
    EN: (v) => ({
      title: "Payment confirmed",
      body: `Direct payment of ₹${v?.amount ?? ""} settled between parties.`,
    }),
    HI: (v) => ({
      title: "भुगतान की पुष्टि",
      body: `दोनों पक्षों के बीच ₹${v?.amount ?? ""} का सीधा भुगतान पूरा हुआ।`,
    }),
    PA: (v) => ({
      title: "ਭੁਗਤਾਨ ਦੀ ਪੁਸ਼ਟੀ",
      body: `ਦੋਵਾਂ ਧਿਰਾਂ ਵਿਚਕਾਰ ₹${v?.amount ?? ""} ਦਾ ਸਿੱਧਾ ਭੁਗਤਾਨ ਮੁਕੰਮਲ ਹੋਇਆ।`,
    }),
  },
  NEW_REVIEW: {
    EN: (v) => ({
      title: "New review received",
      body: `Customer left a ${v?.rating ?? "5"}★ review for your service.`,
    }),
    HI: (v) => ({
      title: "नई समीक्षा प्राप्त हुई",
      body: `ग्राहक ने आपकी सेवा के लिए ${v?.rating ?? "5"}★ समीक्षा दी है।`,
    }),
    PA: (v) => ({
      title: "ਨਵੀਂ ਸਮੀਖਿਆ ਪ੍ਰਾਪਤ ਹੋਈ",
      body: `ਗਾਹਕ ਨੇ ਤੁਹਾਡੀ ਸੇਵਾ ਲਈ ${v?.rating ?? "5"}★ ਸਮੀਖਿਆ ਦਿੱਤੀ ਹੈ।`,
    }),
  },
  VERIFICATION_UPDATE: {
    EN: (v) => ({
      title: "DigiLocker verification update",
      body: `Your identity verification status is now: ${v?.status ?? ""}.`,
    }),
    HI: (v) => ({
      title: "डिजिलॉकर सत्यापन अपडेट",
      body: `आपकी पहचान सत्यापन स्थिति अब: ${v?.status ?? ""} है।`,
    }),
    PA: (v) => ({
      title: "ਡਿਜੀਲੌਕਰ ਪ੍ਰਮਾਣੀਕਰਨ ਅੱਪਡੇਟ",
      body: `ਤੁਹਾਡੀ ਪਛਾਣ ਪ੍ਰਮਾਣੀਕਰਨ ਸਥਿਤੀ ਹੁਣ: ${v?.status ?? ""} ਹੈ।`,
    }),
  },
  DISPUTE_UPDATE: {
    EN: () => ({
      title: "Dispute resolution update",
      body: "Administrator has reviewed and updated your dispute.",
    }),
    HI: () => ({
      title: "विवाद समाधान अपडेट",
      body: "प्रशासक ने आपके विवाद की समीक्षा कर स्थिति अपडेट की है।",
    }),
    PA: () => ({
      title: "ਵਿਵਾਦ ਨਿਪਟਾਰਾ ਅੱਪਡੇਟ",
      body: "ਪ੍ਰਸ਼ਾਸਕ ਨੇ ਤੁਹਾਡੇ ਵਿਵਾਦ ਦੀ ਸਮੀਖਿਆ ਕਰਕੇ ਸਥਿਤੀ ਅੱਪਡੇਟ ਕੀਤੀ ਹੈ।",
    }),
  },
};

export function getLocalizedNotification(
  event: string,
  lang: string = "EN",
  vars?: Record<string, string | number>,
): TranslatedMessage {
  const normalized = (lang.toUpperCase() as SupportedLanguage) || "EN";
  const t = notificationTemplates[event];
  if (!t) {
    return { title: "Ustaad Notification", body: event };
  }
  const generator = t[normalized] || t["EN"];
  return generator(vars);
}

export const getNotificationText = getLocalizedNotification;

