import { StoreBranch, BranchDaySchedule } from '../types';

export const DEFAULT_BRANCH_SCHEDULE: BranchDaySchedule[] = [
  { day: 'sunday', day_ar: 'الأحد', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'monday', day_ar: 'الاثنين', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'tuesday', day_ar: 'الثلاثاء', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'wednesday', day_ar: 'الأربعاء', is_open: true, open_time: '09:00', close_time: '23:00' },
  { day: 'thursday', day_ar: 'الخميس', is_open: true, open_time: '09:00', close_time: '00:00' },
  { day: 'friday', day_ar: 'الجمعة', is_open: true, open_time: '13:00', close_time: '00:00' },
  { day: 'saturday', day_ar: 'السبت', is_open: true, open_time: '09:00', close_time: '23:00' },
];

export interface BranchStatusResult {
  isOpen: boolean;
  statusLabel: string;
  badgeColor: string;
  reason?: string;
  todaySchedule?: BranchDaySchedule;
  nextOpenTime?: string;
}

export function checkBranchOpenStatus(branch?: StoreBranch | null): BranchStatusResult {
  if (!branch) {
    return {
      isOpen: true,
      statusLabel: 'مفتوح',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      reason: 'مفتوح للطلبات',
    };
  }

  if (branch.status === 'inactive') {
    return {
      isOpen: false,
      statusLabel: 'معطّل',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      reason: 'هذا الفرع خارج الخدمة مؤقتاً',
    };
  }

  // 1. Manual Overrides
  if (branch.manual_override === 'forced_closed') {
    return {
      isOpen: false,
      statusLabel: 'مغلق مؤقتاً',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      reason: 'الفرع مغلق مؤقتاً بقرار من الإدارة',
    };
  }

  if (branch.manual_override === 'forced_open') {
    return {
      isOpen: true,
      statusLabel: 'مفتوح دائماً',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      reason: 'مفتوح باستمرار (تشغيل استثنائي)',
    };
  }

  // 2. Automated Schedule Check (Saudi Time - UTC+3)
  const schedules = (Array.isArray(branch.working_hours) && branch.working_hours.length > 0)
    ? branch.working_hours
    : DEFAULT_BRANCH_SCHEDULE;

  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Riyadh',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);

  let currentHour = 0;
  let currentMinute = 0;
  let weekdayStr = '';
  for (const part of parts) {
    if (part.type === 'hour') currentHour = parseInt(part.value, 10);
    if (part.type === 'minute') currentMinute = parseInt(part.value, 10);
    if (part.type === 'weekday') weekdayStr = part.value.toLowerCase();
  }

  const currentMinutes = currentHour * 60 + currentMinute;

  const dayKey = weekdayStr.startsWith('sun') ? 'sunday' :
                 weekdayStr.startsWith('mon') ? 'monday' :
                 weekdayStr.startsWith('tue') ? 'tuesday' :
                 weekdayStr.startsWith('wed') ? 'wednesday' :
                 weekdayStr.startsWith('thu') ? 'thursday' :
                 weekdayStr.startsWith('fri') ? 'friday' : 'saturday';

  const today = schedules.find((s) => s.day === dayKey) || schedules[0];

  if (!today || !today.is_open) {
    return {
      isOpen: false,
      statusLabel: 'مغلق اليوم',
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      reason: `الفرع مغلق يوم ${today?.day_ar || 'اليوم'} بحسب جدول العمل`,
      todaySchedule: today,
    };
  }

  const [openH, openM] = (today.open_time || '09:00').split(':').map(Number);
  const [closeH, closeM] = (today.close_time || '23:00').split(':').map(Number);
  const openMinutes = openH * 60 + (openM || 0);
  let closeMinutes = closeH * 60 + (closeM || 0);

  let isOpenNow = false;
  if (closeMinutes <= openMinutes) {
    isOpenNow = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  } else {
    isOpenNow = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }

  if (isOpenNow) {
    return {
      isOpen: true,
      statusLabel: 'مفتوح الآن',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      reason: `مفتوح لاستقبال الطلبات حتى ${today.close_time}`,
      todaySchedule: today,
    };
  } else {
    return {
      isOpen: false,
      statusLabel: 'مغلق حالياً',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      reason: `الفرع مغلق حالياً. يفتح عند ${today.open_time}`,
      todaySchedule: today,
      nextOpenTime: today.open_time,
    };
  }
}
