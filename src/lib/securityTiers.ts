export type SecurityTier = 'sandboxed' | 'restricted' | 'standard' | 'full';

export interface TierConfig {
  label: string;
  description: string;
  icon: string;
  toolsDeny: string[];
  execSecurity: 'deny' | 'allowlist' | 'full';
  execAsk: 'off' | 'on-miss' | 'always';
  elevated: boolean;
  color: string;
}

export interface RateLimitConfig {
  maxCommandsPerMinute: number;
  maxTokensPerHour: number;
  enabled: boolean;
}

export const SECURITY_TIERS: Record<SecurityTier, TierConfig> = {
  sandboxed: {
    label: 'Sandboxed',
    description: 'Read-only agent. No exec, no file writes, no browser control.',
    icon: '🔒',
    toolsDeny: ['exec', 'process', 'write', 'edit', 'browser', 'nodes'],
    execSecurity: 'deny',
    execAsk: 'always',
    elevated: false,
    color: '#EF4444',
  },
  restricted: {
    label: 'Restricted',
    description: 'Allowlisted commands only. No elevated access, no destructive operations.',
    icon: '🛡️',
    toolsDeny: ['nodes'],
    execSecurity: 'allowlist',
    execAsk: 'on-miss',
    elevated: false,
    color: '#F59E0B',
  },
  standard: {
    label: 'Standard',
    description: 'Default security. Human approval for dangerous operations.',
    icon: '⚡',
    toolsDeny: [],
    execSecurity: 'allowlist',
    execAsk: 'on-miss',
    elevated: false,
    color: '#3B82F6',
  },
  full: {
    label: 'Full Control',
    description: 'All tools enabled. Elevated access allowed. Use with caution.',
    icon: '🔓',
    toolsDeny: [],
    execSecurity: 'full',
    execAsk: 'off',
    elevated: true,
    color: '#10B981',
  },
};

export const DEFAULT_RATE_LIMITS: Record<SecurityTier, RateLimitConfig> = {
  sandboxed: { maxCommandsPerMinute: 5, maxTokensPerHour: 10000, enabled: true },
  restricted: { maxCommandsPerMinute: 15, maxTokensPerHour: 50000, enabled: true },
  standard: { maxCommandsPerMinute: 30, maxTokensPerHour: 100000, enabled: true },
  full: { maxCommandsPerMinute: 60, maxTokensPerHour: 500000, enabled: true },
};

export function tierToConfigPatch(tier: SecurityTier): object {
  const t = SECURITY_TIERS[tier];
  return {
    tools: {
      deny: t.toolsDeny,
      exec: {
        security: t.execSecurity,
        ask: t.execAsk,
        host: tier === 'sandboxed' ? 'sandbox' : 'gateway',
      },
    },
  };
}
