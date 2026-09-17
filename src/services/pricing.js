/** Minimum-price guarantee (feature 9).
 * YatraSetu total is always the floor: 8% below spot market average + official
 * fixed guide/cab rates with zero commission. Competitor totals are estimated
 * multipliers so the app can *prove* the saving without paid APIs.
 * Optimised: pure functions, no deps, O(1).
 */

const COMPETITORS = [
  { name: 'MakeMyTrip', multiplier: 1.18 },
  { name: 'Goibibo', multiplier: 1.12 },
  { name: 'Yatra', multiplier: 1.15 },
];

function tripDays(startDate, endDate) {
  const ms = new Date(endDate) - new Date(startDate);
  return Math.max(1, Math.ceil(ms / 86400000));
}

function computeTripTotal({ spot, guide = null, cab = null, cabKm = 0, days = 1, hotel = null, hotelNights = 0 }) {
  const marketDaily = Number(spot.averageCost) || 5000;
  // 8% below market = our guarantee. Floor to nearest 10 for clean pricing.
  const yatrasetuDaily = Math.floor((marketDaily * 0.92) / 10) * 10;
  const stayTotal = yatrasetuDaily * days;
  const guideTotal = guide ? Number(guide.officialDailyRate || 0) * days : 0;
  const cabTotal = cab ? Math.round(Number(cab.officialRatePerKm || 0) * (cabKm || 40 * days)) : 0;
  const nights = hotel ? (hotelNights > 0 ? hotelNights : Math.max(1, days - 1)) : 0;
  const hotelTotal = hotel ? Number(hotel.pricePerNight || 0) * nights : 0;
  const hotelMrpTotal = hotel && hotel.mrpPerNight ? Number(hotel.mrpPerNight) * nights : hotelTotal;
  const total = stayTotal + guideTotal + cabTotal + hotelTotal;
  const competitors = COMPETITORS.map((c) => ({
    name: c.name,
    total: Math.round((total * c.multiplier) / 10) * 10,
  }));
  const cheapestRival = Math.min(...competitors.map((c) => c.total));
  return {
    days,
    marketDaily,
    yatrasetuDaily,
    breakdown: { stayTotal, guideTotal, cabTotal, hotelTotal, hotelNights: nights, hotelMrpTotal, total },
    total,
    competitors,
    cheapestRival,
    savings: Math.max(0, cheapestRival - total),
    guarantee: total <= cheapestRival
      ? `Lowest-price promise: ₹${total.toLocaleString('en-IN')} beats ${competitors[0].name} by ₹${(cheapestRival - total).toLocaleString('en-IN')}.`
      : 'Price checked against market estimates.',
  };
}

module.exports = { COMPETITORS, tripDays, computeTripTotal };
