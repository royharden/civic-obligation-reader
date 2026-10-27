export function UnknownChip({ reason }: { reason: string }) {
  return <span className="chip unknown" title="The supplied text or selected version does not support a known value">unknown · {reason.replaceAll('_', ' ')}</span>;
}
