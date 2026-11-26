import { z } from 'zod';
import { QUESTIONS_BY_KEY } from '@halal-meet/core';

export const phoneSchema = z.string().regex(/^\+[1-9]\d{6,15}$/, 'phone must be E.164, e.g. +201000000001');

export const otpRequestSchema = z.object({ phone: phoneSchema, channel: z.enum(['sms', 'whatsapp']).optional() });
export const otpVerifySchema = z.object({ phone: phoneSchema, code: z.string().min(4).max(8) });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const gender = z.enum(['male', 'female']);
const halalMode = z.enum(['private', 'guided', 'wali']);
const intention = z.enum(['within_6m', 'within_1y', 'within_2y', 'serious_getting_to_know', 'unsure']);
const maritalStatus = z.enum(['never_married', 'divorced', 'widowed', 'annulled']);
const country = z.string().length(2).or(z.string().min(1).max(3));

export const profileInputSchema = z.object({
  firstName: z.string().min(1).max(80),
  gender,
  birthDate: isoDate,
  nationality: z.array(z.string().min(1).max(3)).min(1),
  country,
  city: z.string().min(1).max(80),
  languages: z.array(z.string().min(1).max(12)).min(1),
  heightCm: z.number().int().min(120).max(230).nullish(),
  maritalStatus,
  hasChildren: z.boolean(),
  educationLevel: z.string().max(120).nullish(),
  profession: z.string().max(120).nullish(),
  intention,
  halalMode,
  acceptedModes: z.array(halalMode).min(1),
  about: z.string().max(2000).nullish(),
  photoVisibility: z.enum(['public', 'matches', 'request', 'family']),
  openToRelocate: z.boolean(),
  relocateCountries: z.array(z.string().min(1).max(3)),
  intlVisibility: z.enum(['on', 'relocating_only', 'off']),
});

const importance = z.enum(['dealbreaker', 'must', 'important', 'flexible']);
const answerSchema = z.object({
  questionKey: z.string().min(1).refine((k) => !!QUESTIONS_BY_KEY[k], 'unknown questionKey'),
  self: z.union([z.string(), z.array(z.string()), z.null()]),
  accept: z.array(z.string()).nullable(),
  importance,
});

export const answersBodySchema = z.object({ answers: z.array(answerSchema).max(200) });

/** PUT /me/profile also accepts an optional `locale` (the mobile client sends it alongside the input). */
export const profileUpdateSchema = profileInputSchema.extend({ locale: z.enum(['en', 'ar']).optional() });

export const preferencesBodySchema = z.object({
  ageMin: z.number().int().min(18).max(99),
  ageMax: z.number().int().min(18).max(99),
  maritalStatuses: z.array(maritalStatus).nullable(),
  acceptChildren: z.boolean(),
  verifiedOnly: z.boolean(),
  languages: z.array(z.string()).nullable(),
  dimensionImportance: z.partialRecord(
    z.enum(['religion', 'family', 'children', 'lifestyle', 'finance', 'career', 'timeline', 'location', 'language']),
    importance,
  ),
});

export const devGrantSchema = z.object({ sku: z.enum(['plus_monthly', 'gold_monthly', 'passport_pass_7d', 'passport_addon_monthly', 'free']) });

export const reportSchema = z.object({
  subjectId: z.string().uuid(),
  category: z.enum(['scam', 'harassment', 'fake_profile', 'inappropriate', 'underage', 'other']),
  details: z.string().max(2000).optional(),
  messageIds: z.array(z.string().uuid()).optional(),
});

export const blockSchema = z.object({ subjectId: z.string().uuid() });

export const feedQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  /** Internal: skip the cached queue and rebuild it (used by tests + "refresh" pull). */
  refresh: z.coerce.boolean().optional(),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

export const messagesQuerySchema = z.object({ before: z.string().datetime().optional() });

export const interestSchema = z.object({
  toId: z.string().uuid(),
  level: z.enum(['interest', 'serious']),
  note: z.string().max(500).optional(),
  abym: z.record(z.string(), z.enum(['compatible', 'not_compatible', 'discuss'])).optional(),
});

export const passSchema = z.object({
  toId: z.string().uuid(),
  reason: z.enum(['religion', 'location', 'age', 'life_plans', 'not_a_fit', 'prefer_not']).optional(),
});

export const sendMessageSchema = z
  .object({
    kind: z.enum(['text', 'topic_card']),
    body: z.string().max(4000).optional(),
    topicKey: z.string().min(1).optional(),
  })
  .refine((v) => (v.kind === 'text' ? !!v.body && v.body.trim().length > 0 : !!v.topicKey), {
    message: 'text messages need body; topic cards need topicKey',
  });

export const answerTopicSchema = z.object({ value: z.string().min(1).max(200) });
export const closeMatchSchema = z.object({
  template: z.enum(['respectful_default', 'custom']),
  message: z.string().max(1000).optional(),
  reason: z.string().max(200).optional(),
});
export const stageReadySchema = z.object({ stage: z.number().int().min(1).max(6) });

export const passportDestinationSchema = z.object({
  country: z.string().length(2).or(z.string().min(1).max(3)),
  city: z.string().max(80).nullish(),
  isWorldwide: z.boolean().optional(),
  purpose: z.enum(['relocate', 'moving', 'visiting', 'spouse_relocates_to_me', 'either']),
  visitFrom: isoDate.nullish(),
  visitTo: isoDate.nullish(),
});

// ───────── Guardians ─────────
const guardianRelationship = z.enum(['father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'other']);
/** All eight permissions must be present (the client always sends the full set). */
export const guardianPermissionsSchema = z.object({
  see_matches: z.boolean(),
  see_reports: z.boolean(),
  read_conversations: z.boolean(),
  participate: z.boolean(),
  join_calls: z.boolean(),
  approve_stages: z.boolean(),
  contact_family: z.boolean(),
  safety_alerts: z.boolean(),
});
export const guardianInviteSchema = z.object({
  name: z.string().trim().min(1).max(60),
  relationship: guardianRelationship,
  permissions: guardianPermissionsSchema,
});
export const guardianUpdateSchema = z
  .object({ permissions: guardianPermissionsSchema.optional(), paused: z.boolean().optional() })
  .refine((b) => b.permissions !== undefined || b.paused !== undefined, { message: 'nothing to update' });
export const guardianOpinionSchema = z.object({
  opinion: z.enum(['support', 'discuss', 'concern']),
  note: z.string().trim().max(500).nullish(),
});
export const guardianApprovalSchema = z.object({ stage: z.union([z.literal(5), z.literal(6)]), decision: z.enum(['approve', 'discuss']) });
export const guardianShareSchema = z.object({ subjectId: z.string().uuid() });
