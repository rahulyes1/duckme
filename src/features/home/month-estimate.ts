/** Rough month-end total at the average daily pace so far. Pure. */
export const FIRST_ESTIMATE_DAY = 5;

export function monthEstimate(spent: number, ref: Date): { total: number; daysAfterToday: number } | null {
  const days = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  // A few days (or nothing spent) is too little to project from.
  if (ref.getDate() < FIRST_ESTIMATE_DAY || spent <= 0) return null;
  return { total: Math.round((spent / ref.getDate()) * days), daysAfterToday: days - ref.getDate() };
}
