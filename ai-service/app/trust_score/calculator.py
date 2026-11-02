def calculate(values: dict[str, float], penalties: float = 0) -> dict:
    weights = {"identityVerification": .20, "skillVerification": .20, "normalizedRating": .20, "reviewSentiment": .15, "completionRate": .15, "responseRate": .05, "accountStanding": .05}
    components = {key: max(0, min(100, values.get(key, 50))) for key in weights}
    score = max(0, sum(components[k] * w for k, w in weights.items()) - penalties)
    return {"score": round(score, 1), "components": components, "formulaVersion": "explainable-v1"}
