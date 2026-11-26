import { useMutation } from '@tanstack/react-query';

import { api } from '@/api';
import { tNow } from '@/i18n';
import { useUi } from '@/state/ui';

import { saveDataExport } from './exportData';

/** "Download my data": GET /me/export, then a file download (web) or the share sheet (native). */
export function useDataExport() {
  return useMutation({
    mutationFn: async () => {
      useUi.getState().showToast({ message: tNow('me.privacy.exportPreparing'), durationMs: 1500 });
      const data = await api.privacy.exportData();
      return saveDataExport(data, tNow('me.privacy.exportShareTitle'));
    },
    onSuccess: (result) => {
      if (result === 'downloaded') useUi.getState().showToast({ message: tNow('me.privacy.exportReady'), tone: 'success' });
    },
    onError: () => useUi.getState().showToast({ message: tNow('me.privacy.exportFailed'), tone: 'danger' }),
  });
}
