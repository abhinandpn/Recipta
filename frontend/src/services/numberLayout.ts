export type NumberArrangement =
  | 'across-sheet'
  | 'cut-stack'
  | 'same-number'
  | 'custom-pattern'
  | 'linked-cut-stack'
  | 'linked-across-sheet';

export interface NumberLayoutPlan {
  pageCount: number;
  groupKeys: string[];
  numberIndexFor: (pageIndex: number, positionIndex: number) => number;
}

/**
 * Creates one source of truth for preview and PDF number placement.
 *
 * Cut & Stack deliberately uses balanced ranges. For example, 100 numbers
 * over 3 positions becomes 34 / 33 / 33, rather than 34 / 34 / 32. This
 * prevents the final two sheets from containing an empty third position.
 */
export function createNumberLayoutPlan(
  numberCount: number,
  positionCount: number,
  arrangement: NumberArrangement,
  patternGroups?: string[],
): NumberLayoutPlan {
  const safePositionCount = Math.max(1, positionCount);
  const groups = Array.from({ length: safePositionCount }, (_, index) => patternGroups?.[index] || String(index + 1));
  const groupKeys = [...new Set(groups)];
  const usesGroups = arrangement === 'custom-pattern'
    || arrangement === 'linked-cut-stack'
    || arrangement === 'linked-across-sheet';
  const groupCount = usesGroups ? groupKeys.length : safePositionCount;
  const pageCount = arrangement === 'same-number'
    ? numberCount
    : Math.ceil(numberCount / Math.max(1, groupCount));

  const groupIndexFor = (positionIndex: number) => {
    if (!usesGroups) return positionIndex;
    return groupKeys.indexOf(groups[positionIndex] || String(positionIndex + 1));
  };

  const balancedRangeStart = (groupIndex: number) => {
    const baseSize = Math.floor(numberCount / groupCount);
    const remainder = numberCount % groupCount;
    return groupIndex * baseSize + Math.min(groupIndex, remainder);
  };

  const balancedRangeSize = (groupIndex: number) => {
    const baseSize = Math.floor(numberCount / groupCount);
    return baseSize + (groupIndex < numberCount % groupCount ? 1 : 0);
  };

  return {
    pageCount,
    groupKeys,
    numberIndexFor: (pageIndex, positionIndex) => {
      const groupIndex = groupIndexFor(positionIndex);
      if (arrangement === 'same-number') return pageIndex;
      if (arrangement === 'custom-pattern' || arrangement === 'linked-across-sheet') {
        return pageIndex * groupCount + groupIndex;
      }
      if (arrangement === 'cut-stack' || arrangement === 'linked-cut-stack') {
        return pageIndex < balancedRangeSize(groupIndex)
          ? balancedRangeStart(groupIndex) + pageIndex
          : -1;
      }
      return pageIndex * safePositionCount + positionIndex;
    },
  };
}
