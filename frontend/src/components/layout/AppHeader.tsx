import { createStyles } from 'antd-style';
import { useLocation } from 'react-router-dom';
import { useSettingsStore } from '@/store/useSettingsStore';

const useStyles = createStyles(({ css }) => ({
  header: css`
    flex-shrink: 0;
    height: calc(var(--luzzy-appbar-height) + var(--luzzy-safe-area-top));
    padding-top: var(--luzzy-safe-area-top);
    padding-left: var(--luzzy-spacing-md);
    padding-right: var(--luzzy-spacing-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--luzzy-surface);
    color: var(--luzzy-on-surface);
    border-bottom: 1px solid var(--luzzy-outline-variant);
    position: relative;
    z-index: 10;
  `,
  brand: css`
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--luzzy-primary);
    user-select: none;
  `,
  title: css`
    font-size: 17px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
  `,
  actions: css`
    display: flex;
    align-items: center;
    gap: var(--luzzy-spacing-sm);
  `,
  iconBtn: css`
    width: 40px;
    height: 40px;
    border-radius: var(--luzzy-radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--luzzy-on-surface);
    transition: background var(--luzzy-transition);

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
}));

const PAGE_TITLES: Record<string, string> = {
  '/chat': '聊天',
  '/characters': '角色',
  '/tools': '工具',
  '/settings': '设置',
  '/more': '更多',
};

export function AppHeader() {
  const { styles } = useStyles();
  const location = useLocation();
  const theme = useSettingsStore((s) => s.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  const title = PAGE_TITLES[location.pathname] ?? 'LUZZY';

  return (
    <header className={styles.header}>
      <div className={styles.brand}>LUZZY</div>
      <div className={styles.title}>{title}</div>
      <div className={styles.actions}>
        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          aria-label="切换主题"
          type="button"
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
