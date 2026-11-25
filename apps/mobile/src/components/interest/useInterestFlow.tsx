import type { ProfileCard } from '@halal-meet/core';
import { useState, type ReactNode } from 'react';

import { useMe, usePass, useSendInterest } from '@/api/hooks';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';

import { AbymSheet } from './AbymSheet';
import { InterestSheet } from './InterestSheet';
import type { AbymAnswers } from './keyFacts';
import { PassSheet, type PassReason } from './PassSheet';

type Step =
  | { kind: 'pass'; card: ProfileCard }
  | { kind: 'abym'; card: ProfileCard; next: 'interest' | 'note' | 'serious' }
  | { kind: 'note'; card: ProfileCard; abym?: AbymAnswers }
  | { kind: 'serious'; card: ProfileCard; abym?: AbymAnswers }
  | null;

export interface InterestFlowOptions {
  /** Hide the card from the feed immediately (feed); the global hooks unhide it on error. */
  optimisticHide?: boolean;
  /** Called after an interest or Serious Interest is accepted by the server. */
  onSent?: (card: ProfileCard, matched: boolean) => void;
  /** Called once "Not for me" is confirmed (before the undo window closes). */
  onPassed?: (card: ProfileCard) => void;
}

/**
 * Orchestrates Not for me (26) → undo toast, I'm interested (25) with Ask Before You Match (24), and
 * Serious Interest. Limits are handled by `useSendInterest` (limit sheet / paywall).
 * Render `sheets` somewhere in the tree.
 */
export function useInterestFlow(opts: InterestFlowOptions = {}) {
  const t = useT();
  const me = useMe();
  const send = useSendInterest();
  const pass = usePass();
  const [step, setStep] = useState<Step>(null);

  const tier = me.data?.entitlements.tier ?? 'free';
  const notesOnInterest = tier !== 'free';
  const close = () => setStep(null);

  const doSend = (card: ProfileCard, level: 'interest' | 'serious', extra: { note?: string; abym?: AbymAnswers } = {}) => {
    if (opts.optimisticHide) useUi.getState().hide(card.id);
    send.mutate(
      {
        body: {
          toId: card.id,
          level,
          note: extra.note,
          abym: extra.abym && Object.keys(extra.abym).length ? extra.abym : undefined,
        },
        card,
      },
      {
        onSuccess: (res) => {
          if (level === 'serious' && !res.matched) {
            useUi.getState().showToast({ message: t('discover.serious.sheetSent'), tone: 'success', durationMs: 2200 });
          }
          opts.onSent?.(card, res.matched);
        },
      },
    );
    close();
  };

  /** "I'm interested". `withNote` opens the note sheet when the plan allows notes on interests. */
  const interested = (card: ProfileCard, { withNote = false }: { withNote?: boolean } = {}) => {
    const note = withNote && notesOnInterest;
    if (card.keyFacts.length > 0) setStep({ kind: 'abym', card, next: note ? 'note' : 'interest' });
    else if (note) setStep({ kind: 'note', card });
    else doSend(card, 'interest');
  };

  const serious = (card: ProfileCard) => {
    if (card.keyFacts.length > 0) setStep({ kind: 'abym', card, next: 'serious' });
    else setStep({ kind: 'serious', card });
  };

  const notForMe = (card: ProfileCard) => setStep({ kind: 'pass', card });

  const confirmPass = (card: ProfileCard, reason?: PassReason) => {
    const ui = useUi.getState();
    close();
    ui.hide(card.id);
    let undone = false;
    ui.showToast({
      message: t('discover.undo.passed', { name: card.firstName }),
      actionLabel: t('discover.undo.action'),
      durationMs: 3000,
      onAction: () => {
        undone = true;
        useUi.getState().unhide(card.id);
        useUi.getState().showToast({ message: t('discover.undo.undone', { name: card.firstName }), durationMs: 2000 });
      },
      onExpire: () => {
        if (undone) return;
        pass.mutate({ toId: card.id, reason });
      },
    });
    opts.onPassed?.(card);
  };

  const sheets: ReactNode = (
    <>
      <PassSheet
        card={step?.kind === 'pass' ? step.card : null}
        onClose={close}
        onConfirm={(reason) => step?.kind === 'pass' && confirmPass(step.card, reason)}
      />
      <AbymSheet
        card={step?.kind === 'abym' ? step.card : null}
        continueLabel={step?.kind === 'abym' && step.next === 'serious' ? t('common.actions.continue') : undefined}
        loading={send.isPending}
        onClose={close}
        onContinue={(abym) => {
          if (step?.kind !== 'abym') return;
          if (step.next === 'interest') doSend(step.card, 'interest', { abym });
          else if (step.next === 'note') setStep({ kind: 'note', card: step.card, abym });
          else setStep({ kind: 'serious', card: step.card, abym });
        }}
      />
      <InterestSheet
        card={step?.kind === 'note' || step?.kind === 'serious' ? step.card : null}
        level={step?.kind === 'serious' ? 'serious' : 'interest'}
        usage={me.data?.usage ?? null}
        loading={send.isPending}
        onClose={close}
        onSend={(note) => {
          if (step?.kind === 'note') doSend(step.card, 'interest', { note, abym: step.abym });
          else if (step?.kind === 'serious') doSend(step.card, 'serious', { note, abym: step.abym });
        }}
      />
    </>
  );

  return { interested, serious, notForMe, sheets, sending: send.isPending, notesOnInterest };
}
