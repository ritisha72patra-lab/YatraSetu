"""Explainable crowd prediction microservice for the YatraSetu architecture.

The model is deliberately transparent for SIH judging: it returns every factor behind its score.
Replace the weighted baseline with a persisted scikit-learn model after collecting real reports.
"""
from datetime import date
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="YatraSetu crowd prediction", version="1.0.0")

class PredictionInput(BaseModel):
    spot_name: str = "Tourist spot"
    forecast_date: str | None = None
    historical_average: float = Field(ge=0, le=100)
    weekend: bool = False
    holiday: bool = False
    weather_risk: float = Field(default=0, ge=0, le=1)

@app.get('/health')
def health():
    return {"status": "ok", "model": "explainable-weighted-baseline-v1"}

@app.post('/predict')
def predict(data: PredictionInput):
    factors = {"historical_reports": data.historical_average, "weekend": 16 if data.weekend else 0, "holiday_or_festival": 24 if data.holiday else 0, "adverse_weather": round(-14 * data.weather_risk, 1)}
    score = min(100, max(0, sum(factors.values())))
    level = 'High' if score >= 70 else 'Medium' if score >= 40 else 'Low'
    reasons = [f"Recent traveller confirmations set the baseline at {data.historical_average:.0f}%."]
    if data.weekend: reasons.append("Weekend travel demand adds 16 points.")
    if data.holiday: reasons.append("A holiday or festival adds 24 points.")
    if data.weather_risk: reasons.append(f"Weather risk reduces the estimate by {14 * data.weather_risk:.0f} points.")
    return {"spot": data.spot_name, "date": data.forecast_date or str(date.today()), "crowdScore": round(score), "level": level, "factors": factors, "explanation": reasons, "model": "explainable-weighted-baseline-v1"}
