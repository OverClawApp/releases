interface Props {
  label: string
  type?: string
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean
}

export default function AuthInput({ label, type = 'text', placeholder, value, onChange, disabled }: Props) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
        style={{
          background: 'var(--bg-page)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  )
}
