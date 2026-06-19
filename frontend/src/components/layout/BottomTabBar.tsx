import { createStyles } from 'antd-style';
import { useLocation, useNavigate } from 'react-router-dom';
import type { TabItem } from '@/types';

const useStyles = createStyles(({ css }) => ({
  tabbar: css`
    flex-shrink: 0;
    height: calc(var(--luzzy-tabbar-height) + var(--luzzy-safe-area-bottom));
    padding-bottom: var(--luzzy-safe-area-bottom);
    display: flex;
    align-items: stretch;
    background: var(--luzzy-surface);
    border-top: 1px solid var(--luzzy-outline-variant);
    position: relative;
    z-index: 10;
  `,
  tab: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--luzzy-on-surface-variant);
    transition: color var(--luzzy-transition);
    user-select: none;
    -webkit-tap-highlight-color: transparent;

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  tabActive: css`
    color: var(--luzzy-primary);
  `,
  tabIcon: css`
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  tabLabel: css`
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  `,
}));

const TABS: TabItem[] = [
  { key: 'chat', label: '聊天', icon: 'chat', path: '/chat' },
  { key: 'characters', label: '角色', icon: 'characters', path: '/characters' },
  { key: 'tools', label: '工具', icon: 'tools', path: '/tools' },
  { key: 'settings', label: '设置', icon: 'settings', path: '/settings' },
  { key: 'more', label: '更多', icon: 'more', path: '/more' },
];

export function BottomTabBar() {
  const { styles, cx } = useStyles();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className={styles.tabbar}>
      {TABS.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <button
            key={tab.key}
            type="button"
            className={cx(styles.tab, active && styles.tabActive)}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
          >
            <span className={styles.tabIcon}>
              <TabIcon name={tab.icon} active={active} />
            </span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? 'var(--luzzy-primary)' : 'var(--luzzy-on-surface-variant)';
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'chat':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'characters':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'tools':
      return (
        <svg {...common}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.5" fill={color} />
          <circle cx="12" cy="12" r="1.5" fill={color} />
          <circle cx="19" cy="12" r="1.5" fill={color} />
        </svg>
      );
    default:
      return null;
  }
}
