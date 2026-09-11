export default function BrandSelect({ brands, value, onChange, className = 'input' }) {
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">No brand</option>
      {/* Keeps a legacy value selectable if it is no longer in the curated list. */}
      {value && !brands.some((b) => b.name === value) && <option value={value}>{value}</option>}
      {brands.map((brand) => (
        <option key={brand.id} value={brand.name}>
          {brand.name}
        </option>
      ))}
    </select>
  );
}
