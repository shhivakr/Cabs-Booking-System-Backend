import { z } from 'zod';
import { env } from '../config/env.js';

export const dateRangeQuerySchema = z.object({
  dateRange: z.enum(['today', 'week', 'month', 'quarter', 'year', 'custom']).optional(),
  from: z.string().optional(),
  to: z.string().optional()
}).refine(data => {
  if (data.from && data.to) return true; // custom is explicit if from/to are present
  if (data.dateRange === 'custom') {
    return !!data.from && !!data.to;
  }
  return true;
}, { message: "'from' and 'to' are required when dateRange is 'custom'" })
.refine(data => {
  if (data.from && data.to) {
    return new Date(data.from) <= new Date(data.to);
  }
  return true;
}, { message: "'from' date cannot be after 'to' date" })
.refine(data => {
  if (data.from && isNaN(Date.parse(data.from))) return false;
  if (data.to && isNaN(Date.parse(data.to))) return false;
  return true;
}, { message: "Invalid date format for 'from' or 'to'. Use YYYY-MM-DD" });

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

/**
 * Resolves a date range query into a Prisma Date filter object { gte, lte }
 * using the configured BUSINESS_TIMEZONE.
 */
export const resolveDateRange = (query: DateRangeQuery): { gte: Date, lte: Date } | undefined => {
  if (!query.dateRange && !query.from && !query.to) return undefined;

  const tz = env.BUSINESS_TIMEZONE;
  const now = new Date();
  
  // Format current time in business timezone
  const tzDateStr = now.toLocaleString('en-US', { timeZone: tz });
  const tzDate = new Date(tzDateStr);

  const startOfDay = new Date(tzDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(tzDate);
  endOfDay.setHours(23, 59, 59, 999);

  // If explicit from/to provided, use them as boundaries in business timezone
  if (query.from && query.to) {
    // Parse the input dates (assuming YYYY-MM-DD format) and set to midnight in TZ
    const gte = new Date(`${query.from}T00:00:00.000${getTzOffsetString(tz, new Date(query.from))}`);
    const lte = new Date(`${query.to}T23:59:59.999${getTzOffsetString(tz, new Date(query.to))}`);
    return { gte, lte };
  }

  const range = query.dateRange;

  if (range === 'today') {
    const gte = new Date(`${startOfDay.getFullYear()}-${String(startOfDay.getMonth() + 1).padStart(2, '0')}-${String(startOfDay.getDate()).padStart(2, '0')}T00:00:00.000${getTzOffsetString(tz, now)}`);
    const lte = new Date(`${endOfDay.getFullYear()}-${String(endOfDay.getMonth() + 1).padStart(2, '0')}-${String(endOfDay.getDate()).padStart(2, '0')}T23:59:59.999${getTzOffsetString(tz, now)}`);
    return { gte, lte };
  }

  if (range === 'week') {
    const startOfWeek = new Date(startOfDay);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);
    
    const gte = new Date(`${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}T00:00:00.000${getTzOffsetString(tz, now)}`);
    const lte = new Date(`${endOfDay.getFullYear()}-${String(endOfDay.getMonth() + 1).padStart(2, '0')}-${String(endOfDay.getDate()).padStart(2, '0')}T23:59:59.999${getTzOffsetString(tz, now)}`);
    return { gte, lte };
  }

  if (range === 'month') {
    const startOfMonth = new Date(startOfDay);
    startOfMonth.setDate(1);

    const gte = new Date(`${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000${getTzOffsetString(tz, now)}`);
    const lte = new Date(`${endOfDay.getFullYear()}-${String(endOfDay.getMonth() + 1).padStart(2, '0')}-${String(endOfDay.getDate()).padStart(2, '0')}T23:59:59.999${getTzOffsetString(tz, now)}`);
    return { gte, lte };
  }
  
  if (range === 'quarter') {
    const startOfQuarter = new Date(startOfDay);
    const quarter = Math.floor(startOfQuarter.getMonth() / 3);
    startOfQuarter.setMonth(quarter * 3);
    startOfQuarter.setDate(1);

    const gte = new Date(`${startOfQuarter.getFullYear()}-${String(startOfQuarter.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000${getTzOffsetString(tz, now)}`);
    const lte = new Date(`${endOfDay.getFullYear()}-${String(endOfDay.getMonth() + 1).padStart(2, '0')}-${String(endOfDay.getDate()).padStart(2, '0')}T23:59:59.999${getTzOffsetString(tz, now)}`);
    return { gte, lte };
  }

  if (range === 'year') {
    const startOfYear = new Date(startOfDay);
    startOfYear.setMonth(0, 1);
    
    const gte = new Date(`${startOfYear.getFullYear()}-01-01T00:00:00.000${getTzOffsetString(tz, now)}`);
    const lte = new Date(`${endOfDay.getFullYear()}-${String(endOfDay.getMonth() + 1).padStart(2, '0')}-${String(endOfDay.getDate()).padStart(2, '0')}T23:59:59.999${getTzOffsetString(tz, now)}`);
    return { gte, lte };
  }

  return undefined;
};

// Helper to get offset string (e.g. "+05:30") for a specific timezone and date
function getTzOffsetString(tz: string, date: Date = new Date()): string {
  // Use Intl.DateTimeFormat to extract the localized time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset'
  });
  const parts = formatter.formatToParts(date);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value;
  if (!tzName || tzName === 'GMT') return 'Z';
  return tzName.replace('GMT', '');
}
