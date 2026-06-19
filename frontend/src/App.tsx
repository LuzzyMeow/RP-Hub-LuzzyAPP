import { Component, useEffect, Suspense, lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'antd-style';
import { useSettingsStore } from '@/store/useSettingsStore';
import { MobileLayout } from '@/components/layout/MobileLayout';

const ChatPage = lazy(() =>
  import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })),
);
const CharactersPage = lazy(() =>
  import('@/pages/CharactersPage').then((m) => ({ default: m.CharactersPage })),
);
const ToolsPage = lazy(() =>
  import('@/pages/ToolsPage').then((m) => ({ default: m.ToolsPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const MorePage = lazy(() =>
  import('@/pages/MorePage').then((m) => ({ default: m.MorePage })),
);

/** 应用级错误边界状态 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** 应用级错误边界组件 */
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>页面出错了</h2>
          <p style={{ color: '#d32f2f', marginBottom: 16, wordBreak: 'break-word' }}>
            {this.state.error?.message ?? '未知错误'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#1976d2',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 懒加载占位 */
function PageLoading(): ReactNode {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--luzzy-on-surface-variant)',
      }}
    >
      加载中...
    </div>
  );
}

export function App() {
  const theme = useSettingsStore((s) => s.theme);

  // 同步主题到 <html data-theme>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <ThemeProvider appearance={theme} themeMode={theme}>
      <ErrorBoundary>
        <MobileLayout>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/chat" replace />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/characters" element={<CharactersPage />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/more" element={<MorePage />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </Suspense>
        </MobileLayout>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
