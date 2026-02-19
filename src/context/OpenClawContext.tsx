import { createContext, useContext, type ReactNode } from 'react';
import { useOpenClaw } from '../hooks/useOpenClaw';

type OpenClawContextType = ReturnType<typeof useOpenClaw>;

const OpenClawContext = createContext<OpenClawContextType | null>(null);

export function OpenClawProvider({ children }: { children: ReactNode }) {
  const value = useOpenClaw();
  return <OpenClawContext.Provider value={value}>{children}</OpenClawContext.Provider>;
}

export function useOpenClawContext(): OpenClawContextType {
  const ctx = useContext(OpenClawContext);
  if (!ctx) throw new Error('useOpenClawContext must be inside OpenClawProvider');
  return ctx;
}
