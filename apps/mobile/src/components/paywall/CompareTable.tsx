import type { PlanTier } from '@halal-meet/core';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

import { COMPARED_TIERS, cellValue, limitsFor, orderedRows, rowLabel } from './planRows';

/**
 * Plan comparison (spec 01 §65) built from core `PLAN_LIMITS`. Each feature is a label line followed by
 * one value per plan, which stays readable on a phone; rows relevant to the trigger come first.
 */
export function CompareTable({ trigger, current, selected }: { trigger: string; current: PlanTier; selected: PlanTier | null }) {
  const t = useT();
  const { rows, highlighted } = orderedRows(trigger);

  return (
    <View style={styles.table} testID="paywall-compare">
      <View style={[styles.valuesRow, styles.headRow]}>
        {COMPARED_TIERS.map((tier) => (
          <View key={tier} style={[styles.cell, tier === selected && styles.cellSelected]}>
            <Text variant="small" weight="bold" center color={tier === 'gold' ? '#8A6A22' : tier === 'plus' ? colors.primary : colors.text}>
              {t(`paywall.compare.headers.${tier}`)}
            </Text>
            {tier === current ? (
              <Text variant="caption" center color={colors.textMuted}>
                {t('paywall.current')}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {rows.map((row, i) => {
        const hi = highlighted.has(row);
        return (
          <View key={row} style={[styles.row, i > 0 && styles.sep, hi && styles.rowHi]}>
            <Text variant="small" weight="semibold" color={hi ? colors.primary : colors.text}>
              {rowLabel(t, row)}
            </Text>
            <View style={styles.valuesRow}>
              {COMPARED_TIERS.map((tier) => {
                const v = cellValue(t, row, limitsFor(tier));
                return (
                  <View key={tier} style={[styles.cell, tier === selected && styles.cellSelected]}>
                    <Text variant="caption" center color={v.off ? colors.textSubtle : colors.text}>
                      {v.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  headRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: palette.sand100 },
  row: { gap: spacing.xs, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  rowHi: { backgroundColor: colors.primaryTint },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  valuesRow: { flexDirection: 'row', gap: spacing.xs },
  cell: { flex: 1, paddingVertical: 2, paddingHorizontal: 2, borderRadius: radii.sm, justifyContent: 'center' },
  cellSelected: { backgroundColor: 'rgba(47, 122, 100, 0.08)' },
});
