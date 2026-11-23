export type WeeklyHours = null | { open: string; close: string }[][];
export function validateHours(value: unknown): WeeklyHours;
export function isAfterHours(weeklyHours: unknown, timezone: string, when?: Date): boolean | null;
