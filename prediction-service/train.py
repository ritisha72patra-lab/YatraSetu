"""Train the sklearn crowd model (feature 8). Runs on any system.

Generates a synthetic-but-sensible dataset encoding domain knowledge
(history baseline, weekend +16, holiday/festival +24, weather -14*risk,
heat/AQI drag, month/day seasonality) plus noise, then fits a
RandomForestRegressor and saves model.pkl + metrics.json.

Usage:
  pip install -r requirements.txt
  python train.py                 # synthetic 4000 rows
  python train.py --rows 8000     # bigger
  # Retrain from real reports CSV (columns: hist,weekend,holiday,wrisk,temp,aqi,dow,month,target):
  python train.py --data reports.csv
"""
import argparse
import json
import pickle
from pathlib import Path

import numpy as np

FEATURES = ['historical_average', 'weekend', 'holiday', 'weather_risk',
            'temperature_c', 'aqi', 'day_of_week', 'month']

def synthetic(n=4000, seed=42):
    rng = np.random.default_rng(seed)
    hist = rng.uniform(5, 95, n)
    weekend = rng.integers(0, 2, n)
    holiday = (rng.random(n) < 0.12).astype(float)
    wrisk = rng.uniform(0, 1, n)
    temp = rng.normal(29, 6, n).clip(5, 45)
    aqi = np.abs(rng.normal(70, 55, n)).clip(10, 400)
    dow = rng.integers(0, 7, n)
    month = rng.integers(1, 13, n)
    # Peak season Oct-Dec & Apr-Jun uplift; monsoon Jul-Sep dip
    season = np.where(np.isin(month, [10, 11, 12, 4, 5, 6]), 6, np.where(np.isin(month, [7, 8, 9]), -5, 0))
    y = (hist + 16 * weekend + 24 * holiday - 14 * wrisk + season
         - 6 * ((temp >= 38) | (aqi >= 150)) + rng.normal(0, 4, n)).clip(0, 100)
    X = np.column_stack([hist, weekend, holiday, wrisk, temp, aqi, dow, month])
    return X, y

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rows', type=int, default=4000)
    ap.add_argument('--data', type=str, default=None)
    args = ap.parse_args()

    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import mean_absolute_error, r2_score

    if args.data:
        import csv
        X, y = [], []
        with open(args.data, newline='') as f:
            for row in csv.DictReader(f):
                X.append([float(row[k]) for k in ['hist', 'weekend', 'holiday', 'wrisk', 'temp', 'aqi', 'dow', 'month']])
                y.append(float(row['target']))
        X, y = np.array(X, float), np.array(y, float)
    else:
        X, y = synthetic(args.rows)

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=120, max_depth=10, min_samples_leaf=4,
                                  random_state=42, n_jobs=-1)
    model.fit(Xtr, ytr)
    pred = model.predict(Xte)
    mae = float(mean_absolute_error(yte, pred))
    r2 = float(r2_score(yte, pred))
    importance = {k: round(float(v), 4) for k, v in zip(FEATURES, model.feature_importances_)}

    out = Path(__file__).with_name('model.pkl')
    with open(out, 'wb') as f:
        pickle.dump({'model': model, 'version': 'sklearn-rf-v2',
                     'features': FEATURES, 'feature_importance': importance}, f)
    (Path(__file__).with_name('metrics.json')).write_text(json.dumps(
        {'mae': round(mae, 2), 'r2': round(r2, 3), 'rows': len(X), 'feature_importance': importance}, indent=2))
    print(f'saved {out.name}  MAE={mae:.2f}  R2={r2:.3f}')
    print('importance:', importance)

if __name__ == '__main__':
    main()
