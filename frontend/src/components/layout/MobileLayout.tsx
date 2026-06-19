import { type ReactNode } from 'react';
import { createStyles } from 'antd-style';
import { AppHeader } from './AppHeader';
import { BottomTabBar } from './BottomTabBar';

const useStyles = createStyles(({ css }) => ({
  layout: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--luzzy-background);
    color: var(--luzzy-on-background);
    overflow: hidden;
  `,
  content: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  `,
}));

interface MobileLayoutProps {
  children: ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const { styles } = useStyles();

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.content}>{children}</main>
      <BottomTabBar />
    </div>
  );
}
