// Works out whether a customer is arriving at an airport we have a pickup infographic for.
// Add keywords here if your RCM location names differ.
export const AIRPORTS = {
  OOL: {
    name: 'Gold Coast Airport',
    keywords: ['gold coast airport', 'coolangatta', 'ool'],
  },
  BNE: {
    name: 'Brisbane Airport',
    keywords: ['brisbane airport', 'bne', 'brisbane domestic', 'brisbane international'],
  },
};

export function detectAirport(booking) {
  if (booking.arrivalAirport && AIRPORTS[booking.arrivalAirport.toUpperCase()]) {
    return booking.arrivalAirport.toUpperCase();
  }
  const haystack = `${booking.pickupLocation ?? ''}`.toLowerCase();
  for (const [code, airport] of Object.entries(AIRPORTS)) {
    if (airport.keywords.some((k) => new RegExp(`\\b${k}\\b`).test(haystack))) return code;
  }
  return null;
}
