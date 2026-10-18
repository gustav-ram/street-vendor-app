import { useTranslation } from 'react-i18next';
import { dayOffsetOf } from '@streeteats/shared';
import { useFormat } from './useFormat';

/** "Today", "Tomorrow" or the weekday name, for a time on the phone's calendar. */
export function useDayName() {
  const { t } = useTranslation('search');
  const f = useFormat();
  return (iso: string) => {
    const d = dayOffsetOf(iso);
    return d <= 0 ? t('days.today') : d === 1 ? t('days.tomorrow') : f.weekday(new Date(iso).getDay());
  };
}
