type ContextMeterProps = {
  percent: number
}

export function ContextMeter({ percent }: ContextMeterProps) {
  const clamped = Math.min(100, Math.max(0, percent))
  const radius = 9
  const stroke = 2.5
  const normalizedRadius = radius - stroke / 2
  const circumference = 2 * Math.PI * normalizedRadius
  const offset = circumference - (clamped / 100) * circumference
  const level = clamped >= 92 ? 'high' : clamped >= 75 ? 'medium' : 'low'

  return (
    <div
      className={`assistant-context-meter assistant-context-meter-${level}`}
      title="Estimated share of the model context window used by this request"
    >
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle
          className="assistant-context-meter-track"
          cx="13"
          cy="13"
          r={normalizedRadius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="assistant-context-meter-fill"
          cx="13"
          cy="13"
          r={normalizedRadius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 13 13)"
        />
      </svg>
      <span className="assistant-context-meter-value">{Math.round(clamped)}%</span>
    </div>
  )
}
