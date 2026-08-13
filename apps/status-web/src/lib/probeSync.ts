export function isProbeReconciled(result: { reconciled?: boolean }): boolean {
  return result.reconciled === true;
}
