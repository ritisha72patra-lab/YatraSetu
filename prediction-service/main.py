"""YatraSetu crowd prediction microservice (optimised stack).

Replaces FastAPI+pydantic with Starlette+msgspec (feature 10):
- msgspec is 5-10x faster than pydantic and has tiny wheels (any system).
- Starlette has no pydantic dependency, so `pip install` is ~3x smaller.
- scikit-learn RandomForest (feature 8) trained on historical + weather +
  holiday/festival + time/day signals; explainable output kept for judging.

Endpoints: GET /health, POST /predict
"""
from datetime import date
from pathlib import Path

import msgspec
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

MODEL_PATH = Path(__file__).with_name('model.pkl')
MODEL_VERSION = 'sklearn-rf-v2'

# ---------------------------------------------------------------- validation
class PredictionInput(msgspec.Struct):
    spot_name: str = 'Tourist spot'
    forecast_date: str | None = None
    historical_average: float = 50.0
    weekend: bool = False
    holiday: bool = False
    weather_risk: float = 0.0
    temperature_c: float = 28.0
    aqi: float = 42.0
    day_of_week: int = -1  # 0=Mon..6=Sun, -1 = derive from forecast_date
    month: int = -1        # 1..12, -1 = derive from forecast_date

def _clamp(v, lo, hi):
    try: v = float(v)
    except (TypeError, ValueError): v = lo
    return max(lo, min(hi, v))

def sanitise(d: PredictionInput) -> PredictionInput:
    iso = d.forecast_date or str(date.today())
    try:
        dt = date.fromisoformat(str(iso)[:10])
        iso = dt.isoformat()
        dow = dt.weekday()  # Mon=0
        mon = dt.month
    except ValueError:
        iso, dow, mon = str(date.today()), -1, -1
    return PredictionInput(
        spot_name=str(d.spot_name or 'Tourist spot')[:80],
        forecast_date=iso,
        historical_average=_clamp(d.historical_average, 0, 100),
        weekend=bool(d.weekend or dow >= 5),
        holiday=bool(d.holiday),
        weather_risk=_clamp(d.weather_risk, 0, 1),
        temperature_c=_clamp(d.temperature_c, -10, 55),
        aqi=_clamp(d.aqi, 0, 500),
        day_of_week=int(d.day_of_week) if 0 <= int(d.day_of_week or -1) <= 6 else dow,
        month=int(d.month) if 1 <= int(d.month or -1) <= 12 else mon,
    )

# ------------------------------------------------------------------ model
_model = None
_feature_importance: dict = {}

def load_model():
    global _model, _feature_importance
    if _model is not None:
        return _model
    try:
        import pickle
        if MODEL_PATH.exists():
            with open(MODEL_PATH, 'rb') as f:
                payload = pickle.load(f)
            _model = payload.get('model')
            _feature_importance = payload.get('feature_importance', {})
            print(f'[predict] loaded {MODEL_PATH.name} ({payload.get("version", "?")})')
    except Exception as e:  # sklearn missing or corrupt file -> baseline
        print(f'[predict] model load skipped ({e}); using explainable baseline')
        _model = None
    return _model

def baseline(d: PredictionInput):
    factors = {
        'historical_reports': round(d.historical_average, 1),
        'weekend': 16 if d.weekend else 0,
        'holiday_or_festival': 24 if d.holiday else 0,
        'adverse_weather': round(-14 * d.weather_risk, 1),
        'heat_or_aqi_drag': -6 if (d.temperature_c >= 38 or d.aqi >= 150) else 0,
    }
    return min(100, max(0, sum(factors.values()))), factors

def predict_with_model(d: PredictionInput):
    model = load_model()
    feats = [d.historical_average, 1 if d.weekend else 0, 1 if d.holiday else 0,
             d.weather_risk, d.temperature_c, d.aqi, d.day_of_week if d.day_of_week >= 0 else 2,
             d.month if d.month >= 1 else 10]
    try:
        import numpy as np
        score = float(model.predict(np.array([feats], dtype=float))[0])
    except Exception:
        score, _ = baseline(d)
        return score, {}, 'baseline-fallback'
    return _clamp(score, 0, 100), _feature_importance, MODEL_VERSION

# ------------------------------------------------------------------ routes
async def health(_: Request):
    load_model()
    return JSONResponse({'status': 'ok',
                         'model': MODEL_VERSION if _model is not None else 'explainable-weighted-baseline-v1',
                         'sklearn': _model is not None, 'stack': 'starlette+msgspec'})

async def predict(request: Request):
    try:
        raw = await request.body()
        data = msgspec.json.decode(raw, type=PredictionInput)
    except msgspec.ValidationError as e:
        return JSONResponse({'error': f'Invalid input: {e}', 'code': 'VALIDATION_ERROR'}, status_code=422)
    except Exception:
        return JSONResponse({'error': 'Body must be JSON.', 'code': 'VALIDATION_ERROR'}, status_code=400)
    d = sanitise(data)
    model = load_model()
    if model is not None:
        score, importance, version = predict_with_model(d)
        base, factors = baseline(d)
        reasons = [
            f'ML forecast from {score:.0f}% (history {d.historical_average:.0f}%, '
            f'{"weekend" if d.weekend else "weekday"}{", holiday/festival" if d.holiday else ""}, '
            f'{d.temperature_c:.0f}°C, AQI {d.aqi:.0f}).',
            f'Baseline check: {base:.0f}%.',
        ]
        if d.weather_risk: reasons.append(f'Weather risk lowers turnout (~-{14 * d.weather_risk:.0f} pts).')
        return JSONResponse({'spot': d.spot_name, 'date': d.forecast_date,
                             'crowdScore': round(score), 'level': 'High' if score >= 70 else 'Medium' if score >= 40 else 'Low',
                             'factors': {**factors, 'ml_score': round(score, 1)},
                             'feature_importance': importance, 'explanation': reasons, 'model': version})
    score, factors = baseline(d)
    level = 'High' if score >= 70 else 'Medium' if score >= 40 else 'Low'
    reasons = [f'Recent traveller confirmations set the baseline at {d.historical_average:.0f}%.']
    if d.weekend: reasons.append('Weekend travel demand adds 16 points.')
    if d.holiday: reasons.append('A holiday or festival adds 24 points.')
    if d.weather_risk: reasons.append(f'Weather risk reduces the estimate by {14 * d.weather_risk:.0f} points.')
    if d.temperature_c >= 38 or d.aqi >= 150: reasons.append('Extreme heat/poor AQI trims the estimate by 6 points.')
    return JSONResponse({'spot': d.spot_name, 'date': d.forecast_date, 'crowdScore': round(score),
                         'level': level, 'factors': factors, 'explanation': reasons,
                         'model': 'explainable-weighted-baseline-v1'})

app = Starlette(routes=[Route('/health', health, methods=['GET']), Route('/predict', predict, methods=['POST'])])
