// weeklyHours: null (always open) or 7 arrays (Sun..Sat) of {open:'HH:MM',close:'HH:MM'} intervals.
function minutes(time) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) && time !== '24:00') throw new Error('invalid_operating_hours');
  const [h, m] = time.split(':').map(Number); return h * 60 + m;
}
export function validateHours(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 7) throw new Error('seven_days_required');
  return value.map(day => {
    if (!Array.isArray(day) || day.length > 4) throw new Error('invalid_operating_hours');
    let end = -1;
    return day.map(interval => {
      const a = minutes(interval?.open), b = minutes(interval?.close);
      if (a >= b || a < end) throw new Error('overlapping_operating_hours');
      end = b; return { open: interval.open, close: interval.close };
    });
  });
}
export function isAfterHours(weeklyHours, timezone, when = new Date()) {
  if (weeklyHours === null || weeklyHours === undefined) return null;
  validateHours(weeklyHours);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(when);
  const get = key => parts.find(p => p.type === key)?.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const at = Number(get('hour')) * 60 + Number(get('minute'));
  return !weeklyHours[day].some(i => at >= minutes(i.open) && at < minutes(i.close));
}
