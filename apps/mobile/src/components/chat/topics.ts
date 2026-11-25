import { CORE_TOPIC_KEYS, type Gender, type Message } from '@halal-meet/core';

/** ✓ covered (same answers) / ⚠ differs (revealed, different) / pending (card sent, not revealed) / none. */
export type TopicState = 'covered' | 'differs' | 'pending' | 'none';

/** Derives the coverage state of each core topic from the topic cards in this conversation. */
export function topicStates(messages: Message[]): Record<string, TopicState> {
  const out: Record<string, TopicState> = {};
  for (const k of CORE_TOPIC_KEYS) out[k] = 'none';
  for (const m of messages) {
    if (m.kind !== 'topic_card' || !m.topicKey || !m.topicAnswers || !(m.topicKey in out)) continue;
    const a = m.topicAnswers;
    if (a.revealed) out[m.topicKey] = a.mine === a.theirs ? 'covered' : 'differs';
    else if (out[m.topicKey] === 'none') out[m.topicKey] = 'pending';
  }
  return out;
}

/** First core topic not yet raised in this conversation. */
export function nextUncoveredTopic(states: Record<string, TopicState>): string | null {
  return CORE_TOPIC_KEYS.find((k) => states[k] === 'none') ?? null;
}

export function otherGenderOf(g: Gender): Gender {
  return g === 'male' ? 'female' : 'male';
}
