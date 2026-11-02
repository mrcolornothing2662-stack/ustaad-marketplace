def rank(values: dict[str, float]) -> dict:
    weights = {"serviceMatch": .30, "trustScore": .25, "distanceScore": .15, "availabilityScore": .10, "ratingScore": .10, "responseRate": .05, "completionRate": .05}
    return {"rankingScore": round(sum(max(0, min(100, values.get(k, 0))) * w for k, w in weights.items()), 1), "formulaVersion": "ranking-v1"}
