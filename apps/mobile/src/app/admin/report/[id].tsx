import { useLocalSearchParams } from 'expo-router';

import { AdminShell } from '@/components/admin/parts';
import { ReportDetailView } from '@/components/admin/ReportDetail';

/** Report detail as its own page (narrow screens and deep links). */
export default function AdminReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AdminShell back>{id ? <ReportDetailView id={id} /> : null}</AdminShell>;
}
