/**
 * Helpers for editing the signed-in member's own profile after onboarding.
 *
 * PUT /me/profile takes the whole ProfileInput, so every settings screen starts from the current
 * `MyProfile` (GET /me), applies a patch and sends the full body.
 */
import type { MyProfile, ProfileInput } from '@halal-meet/core';

import type { ChildrenStatus, OnboardingDraft } from '@/state/session';

/** Strips the read-only fields of MyProfile (id, age, photoUrl, verifications, strength). */
export function toProfileInput(p: MyProfile): ProfileInput {
  return {
    firstName: p.firstName,
    gender: p.gender,
    birthDate: p.birthDate,
    nationality: p.nationality ?? [],
    country: p.country,
    city: p.city,
    languages: p.languages ?? [],
    heightCm: p.heightCm ?? null,
    maritalStatus: p.maritalStatus,
    hasChildren: p.hasChildren,
    educationLevel: p.educationLevel ?? null,
    profession: p.profession ?? null,
    intention: p.intention,
    halalMode: p.halalMode,
    acceptedModes: p.acceptedModes ?? [p.halalMode],
    about: p.about ?? null,
    photoVisibility: p.photoVisibility,
    openToRelocate: p.openToRelocate ?? false,
    relocateCountries: p.relocateCountries ?? [],
    intlVisibility: p.intlVisibility ?? 'on',
  };
}

/** Keeps the onboarding draft in sync, so a later draft-based save never overwrites settings edits. */
export function draftPatchFromProfile(input: ProfileInput, current: OnboardingDraft): Partial<OnboardingDraft> {
  let children: ChildrenStatus | null = current.children;
  if (!input.hasChildren) children = 'none';
  else if (children === null || children === 'none') children = 'with_me';
  return {
    firstName: input.firstName,
    gender: input.gender,
    birthDate: input.birthDate,
    nationality: input.nationality,
    country: input.country,
    city: input.city,
    languages: input.languages,
    maritalStatus: input.maritalStatus,
    children,
    intention: input.intention,
    halalMode: input.halalMode,
    acceptedModes: input.acceptedModes,
    photoVisibility: input.photoVisibility,
  };
}
