import type { MatchSummary } from '@halal-meet/core';
import { router } from 'expo-router';

import { ListRow, RowGroup, Sheet } from '@/components/ui';
import { useT } from '@/i18n';

export type ChatMenuAction = 'topics' | 'journey' | 'report' | 'block' | 'end';

/** "⋮" menu: view profile, topic library, journey stages, report, block, end respectfully. */
export function ChatMenuSheet({
  visible,
  onClose,
  match,
  onAction,
}: {
  visible: boolean;
  onClose: () => void;
  match: MatchSummary;
  onAction: (a: ChatMenuAction) => void;
}) {
  const t = useT();
  const name = match.other.firstName;
  const active = match.status === 'active';
  const go = (a: ChatMenuAction) => {
    onClose();
    // Let the menu's modal close before the next one opens (stacked RN modals misbehave on iOS).
    setTimeout(() => onAction(a), 250);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('chat.header.menuTitle', { name })} testID="chat-menu">
      <RowGroup>
        <ListRow
          icon="person-outline"
          label={t('chat.header.viewProfile')}
          onPress={() => {
            onClose();
            router.push({ pathname: '/profile/[id]', params: { id: match.other.id } });
          }}
        />
        <ListRow icon="albums-outline" label={t('chat.header.topicLibrary')} onPress={() => go('topics')} />
        <ListRow icon="trail-sign-outline" label={t('chat.header.journey')} onPress={() => go('journey')} />
      </RowGroup>
      <RowGroup>
        <ListRow icon="flag-outline" danger label={t('chat.header.report', { name })} onPress={() => go('report')} />
        <ListRow icon="hand-left-outline" danger label={t('chat.header.block', { name })} onPress={() => go('block')} />
        {active ? <ListRow icon="heart-dislike-outline" label={t('chat.header.end')} onPress={() => go('end')} /> : null}
      </RowGroup>
    </Sheet>
  );
}
