const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * When each message is due. Each stage has a window [sendAt, expiresAt):
 * the message goes out on the first scan inside the window, and is skipped if the window
 * has passed (e.g. a booking made 3 days out never gets the "week out" message, but does
 * get the "two days" one).
 *
 * Tweak the timings here.
 */
export const STAGES = [
  {
    id: 'week_out',
    window: (b) => ({ sendAt: offset(b.pickupAt, -7 * DAY), expiresAt: offset(b.pickupAt, -2 * DAY) }),
  },
  {
    id: 'two_days',
    window: (b) => ({ sendAt: offset(b.pickupAt, -2 * DAY), expiresAt: offset(arrivalTime(b), -2 * HOUR) }),
  },
  {
    // 2 hours before they land (flight arrival) or, without a flight, before pickup time.
    id: 'day_of',
    window: (b) => ({ sendAt: offset(arrivalTime(b), -2 * HOUR), expiresAt: arrivalTime(b) }),
  },
  {
    // Halfway through the hire. Skipped for hires shorter than 2 days.
    id: 'mid_trip',
    window: (b) => {
      if (b.dropoffAt - b.pickupAt < 2 * DAY) return null;
      const midpoint = new Date((b.pickupAt.getTime() + b.dropoffAt.getTime()) / 2);
      return { sendAt: midpoint, expiresAt: offset(b.dropoffAt, -12 * HOUR) };
    },
  },
];

export function arrivalTime(booking) {
  return booking.arrivalAt ?? booking.pickupAt;
}

function offset(date, ms) {
  return new Date(date.getTime() + ms);
}

/** Stages whose window is open right now for this booking. */
export function dueStages(booking, now = new Date()) {
  if (!booking.pickupAt || !booking.dropoffAt) return [];
  return STAGES.filter((stage) => {
    const w = stage.window(booking);
    return w && now >= w.sendAt && now < w.expiresAt;
  }).map((s) => s.id);
}
