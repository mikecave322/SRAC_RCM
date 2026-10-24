// Normalises phone numbers to the digits-only international format WhatsApp expects (e.g. 61412345678).
// Numbers without a country code are assumed to be Australian.
export function normalisePhone(raw, defaultCountryCode = '61') {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = defaultCountryCode + digits.slice(1);
  else if (digits.length <= 9) digits = defaultCountryCode + digits;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
