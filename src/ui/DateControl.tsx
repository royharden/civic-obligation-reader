export function DateControl({ value, onChange, label = 'As of' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label>{label}<input type="date" value={value} onChange={e => onChange(e.target.value)} /></label>;
}
