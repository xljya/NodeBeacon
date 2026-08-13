export function getMainContentWidth(value: number): string {
  const width = Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : 100;
  return `${width}%`;
}
