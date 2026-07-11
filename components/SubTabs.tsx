'use client'

// Segmented sub-tab bar shared by the Activity lists (1v1 / Predictions / Parlays) so all
// three look identical. Optional per-tab badge (used by the 1v1 Disputed count).

export interface SubTabItem {
  key: string
  label: string
  badge?: number
}

interface SubTabsProps {
  tabs: SubTabItem[]
  active: string
  onSelect: (key: string) => void
}

export function SubTabs({ tabs, active, onSelect }: SubTabsProps) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--color-pop-surface)', borderRadius: 'var(--radius-pill)', padding: 4 }}>
      {tabs.map((t) => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.key)}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              background: isActive ? 'var(--color-pop-surface-2)' : 'transparent',
              color: isActive ? 'var(--color-pop-text)' : 'var(--color-pop-muted)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--color-pop-danger)', color: '#fff', borderRadius: 'var(--radius-pill)', padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
