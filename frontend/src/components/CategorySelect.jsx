export default function CategorySelect({ categories, value, onChange, className = 'input' }) {
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">No category</option>
      {value && !categories.some((c) => c.name === value) && <option value={value}>{value}</option>}
      {categories.map((category) => (
        <option key={category.id} value={category.name}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
