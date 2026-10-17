import SegmentedControl from './SegmentedControl.jsx'

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文', lang: 'zh-CN' },
]

function LanguageSelector({ value, onChange, disabled = false }) {
  return (
    <SegmentedControl
      legend="Spoken language"
      name="language"
      options={LANGUAGE_OPTIONS}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

export default LanguageSelector
