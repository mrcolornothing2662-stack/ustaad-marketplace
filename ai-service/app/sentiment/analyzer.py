class DeterministicSentimentAnalyzer:
    # English positive and negative terms
    positive_en = {
        "great", "excellent", "good", "professional", "helpful", "fast",
        "recommend", "clean", "punctual", "polite", "honest", "expert", "perfect"
    }
    negative_en = {
        "bad", "late", "poor", "rude", "broken", "awful", "avoid",
        "worst", "dirty", "unprofessional", "cheated", "damaged", "scam"
    }

    # Hindi terms (Devanagari script)
    positive_hi_dev = {
        "अच्छा", "उत्कृष्ट", "बढ़िया", "शानदार", "कुशल", "समय", "संतुष्ट",
        "धन्यवाद", "मेहनती", "ईमानदार", "सर्वोत्तम", "सराहनीय"
    }
    negative_hi_dev = {
        "खराब", "देर", "घटिया", "बकवास", "बेकार", "गलत", "धोखा",
        "अधूरा", "चोर", "लूट", "गंदा", "लापरवाह", "बुरा"
    }

    # Hinglish terms (Romanized Hindi)
    positive_hi_rom = {
        "accha", "achha", "achhi", "badhiya", "badiya", "shandar", "mast",
        "sahi", "behtareen", "behtar", "samay", "kushal", "dhanyawad", "imandar"
    }
    negative_hi_rom = {
        "kharab", "bekar", "bakwas", "deri", "chor", "dhokha", "ghatiya",
        "lutera", "bura", "faltu", "adhura", "fraud", "laaparwah"
    }

    # Punjabi terms (Gurmukhi script)
    positive_pa_gur = {
        "ਵਧੀਆ", "ਚੰਗਾ", "ਸ਼ਾਨਦਾਰ", "ਕੁਸ਼ਲ", "ਸਮੇਂ", "ਧੰਨਵਾਦ", "ਇਮਾਨਦਾਰ",
        "ਮਿਹਨਤੀ", "ਸੰਤੁਸ਼ਟ", "ਉੱਤਮ"
    }
    negative_pa_gur = {
        "ਖਰਾਬ", "ਦੇਰ", "ਬੇਕਾਰ", "ਲੁੱਟ", "ਗਲਤ", "ਧੋਖਾ", "ਗੰਦਾ", "ਚੋਰ", "ਅਧੂਰਾ", "ਮਾੜਾ"
    }

    # Romanized Punjabi terms
    positive_pa_rom = {
        "vadiya", "vadia", "changa", "changaa", "siraa", "shandar", "dhannwad",
        "bahut changa", "imandar", "sirra", "sahi"
    }
    negative_pa_rom = {
        "kharab", "bekar", "maada", "manda", "deri", "lutt", "thagg", "dhokha"
    }

    def analyze(self, text: str, language: str = "en") -> dict[str, str | float]:
        cleaned = text.lower().replace(".", " ").replace(",", " ").replace("!", " ")
        words = set(cleaned.split())

        all_positive = (
            self.positive_en
            | self.positive_hi_dev
            | self.positive_hi_rom
            | self.positive_pa_gur
            | self.positive_pa_rom
        )
        all_negative = (
            self.negative_en
            | self.negative_hi_dev
            | self.negative_hi_rom
            | self.negative_pa_gur
            | self.negative_pa_rom
        )

        pos_matches = words & all_positive
        neg_matches = words & all_negative

        delta = len(pos_matches) - len(neg_matches)
        score = max(0.05, min(0.95, 0.5 + delta * 0.15))

        label = "POSITIVE" if score > 0.55 else "NEGATIVE" if score < 0.45 else "NEUTRAL"

        return {
            "label": label,
            "score": round(score, 2),
            "language": language,
            "modelVersion": "deterministic-v3-trilingual",
        }
