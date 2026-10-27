export function FixturePicker({ value, onChange, titles }: { value: string; onChange: (id: string) => void; titles: { id: string; title: string }[] }) {
  return <label>Example packet<select value={value} onChange={e => onChange(e.target.value)}>{titles.map(f => <option key={f.id} value={f.id}>{f.id} · {f.title}</option>)}</select></label>;
}
