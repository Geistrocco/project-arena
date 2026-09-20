export function suggestedGroupSizes(teamCount: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2) return [];
  let groupCount = Math.max(1, Math.round(teamCount / 4));
  while (Math.ceil(teamCount / groupCount) > 5) groupCount += 1;
  while (groupCount > 1 && Math.floor(teamCount / groupCount) < 3) groupCount -= 1;
  const base = Math.floor(teamCount / groupCount);
  const larger = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < larger ? 1 : 0));
}

export function validGroupSizes(sizes: number[], teamCount: number) {
  return sizes.length >= 1 && sizes.length <= 64 && sizes.every((size) => Number.isInteger(size) && size >= 2 && size <= 16)
    && sizes.reduce((sum, size) => sum + size, 0) === teamCount;
}
