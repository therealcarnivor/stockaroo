export default function StoreSelect({ stores, value, onChange, className = 'input' }) {
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">No store</option>
      {/* Keeps a legacy value selectable if it is no longer in the curated list. */}
      {value && !stores.some((s) => s.name === value) && <option value={value}>{value}</option>}
      {stores.map((store) => (
        <option key={store.id} value={store.name}>
          {store.name}
        </option>
      ))}
    </select>
  );
}
