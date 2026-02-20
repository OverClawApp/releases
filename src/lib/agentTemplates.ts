import { Bot, Code2, Palette, Search, PenSquare, BarChart3 } from 'lucide-react'

export type AgentTemplateId = 'orchestrator' | 'programmer' | 'artist' | 'researcher' | 'writer' | 'data-analyst'

export interface SubAgentRecord {
  id: string
  name: string
  template: AgentTemplateId
  status: 'active' | 'stopped'
  sessionKey: string
}

export interface AgentTemplate {
  id: AgentTemplateId
  name: string
  icon: typeof Bot
  description: string
  skills: string[]
  toolsDeny: string[]
  soulContent: string
  agentsContent: string
}

export const SUBAGENTS_STORAGE_KEY = 'overclaw-subagents'

const BASE_TOOLS_DENY = ['message', 'tts', 'nodes', 'sessions_spawn', 'sessions_send', 'sessions_list', 'sessions_history', 'agents_list', 'memory_search', 'memory_get', 'gateway', 'canvas', 'session_status']

const without = (list: string[], removals: string[]) => list.filter(item => !removals.includes(item))

const ORCHESTRATOR_ALLOWED = ['sessions_spawn', 'sessions_send', 'sessions_list', 'sessions_history', 'agents_list']

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    icon: Bot,
    description: 'Manages a team of sub-agents, delegates tasks, and coordinates workflows.',
    skills: ['qmd', 'supermemory', 'prompt-guard'],
    toolsDeny: without(BASE_TOOLS_DENY, ORCHESTRATOR_ALLOWED),
    soulContent: `
## Role Focus: Orchestrator
- You are a coordinator first: break complex work into clear subtasks.
- Delegate substantial or parallelizable work to sub-agents.
- Review sub-agent outputs, merge results, and present one clean final response.
- Keep track of who is best for each task and route work accordingly.
`,
    agentsContent: `
## Role Extension: Orchestrator
- You are expected to coordinate a team, not do everything serially yourself.
- For multi-step tasks, create a plan and delegate execution when useful.
- Validate and synthesize sub-agent outputs before responding.
`,
  },
  {
    id: 'programmer',
    name: 'Programmer',
    icon: Code2,
    description: 'Expert coder, debugger, and software architect.',
    skills: ['qmd', 'supermemory', 'prompt-guard'],
    toolsDeny: without(BASE_TOOLS_DENY, ['exec']),
    soulContent: `
## Role Focus: Programmer
- You are an expert software engineer.
- Prioritize correctness, testing, and maintainable architecture.
- Use iterative debugging and verify fixes before reporting completion.
- Explain trade-offs clearly and suggest robust implementation paths.
`,
    agentsContent: `
## Role Extension: Programmer
- Write production-quality code and keep changes minimal/surgical.
- Run builds/tests whenever available before finalizing.
- Prefer reliable, observable solutions over quick hacks.
`,
  },
  {
    id: 'artist',
    name: 'Artist',
    icon: Palette,
    description: 'Image generation, design direction, and creative visual work.',
    skills: ['openai-image-gen', 'qmd'],
    toolsDeny: BASE_TOOLS_DENY,
    soulContent: `
## Role Focus: Artist
- You are a visual creator focused on design, style, and composition.
- Produce clear art direction and strong prompt craftsmanship.
- Balance creativity with practical deliverables.
`,
    agentsContent: `
## Role Extension: Artist
- Ask clarifying questions about style, mood, and brand when needed.
- Provide multiple creative directions with rationale.
`,
  },
  {
    id: 'researcher',
    name: 'Researcher',
    icon: Search,
    description: 'Deep web research, analysis, and report writing.',
    skills: ['qmd', 'supermemory'],
    toolsDeny: without(BASE_TOOLS_DENY, ['web_search', 'web_fetch', 'browser']),
    soulContent: `
## Role Focus: Researcher
- You perform thorough, source-backed research.
- Triangulate claims across multiple references.
- Distill findings into concise, actionable reports.
`,
    agentsContent: `
## Role Extension: Researcher
- Prefer primary and up-to-date sources where possible.
- Clearly separate facts, inferences, and uncertainties.
`,
  },
  {
    id: 'writer',
    name: 'Writer',
    icon: PenSquare,
    description: 'Content creation, copywriting, editing, and tone refinement.',
    skills: ['qmd', 'supermemory'],
    toolsDeny: BASE_TOOLS_DENY,
    soulContent: `
## Role Focus: Writer
- You produce high-quality written content.
- Optimize for clarity, voice consistency, and audience fit.
- Edit ruthlessly for structure and readability.
`,
    agentsContent: `
## Role Extension: Writer
- Offer alternate drafts and tones when helpful.
- Keep messaging crisp and outcome-oriented.
`,
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    icon: BarChart3,
    description: 'Data processing, visualization, and spreadsheet-heavy analysis.',
    skills: ['qmd', 'supermemory'],
    toolsDeny: BASE_TOOLS_DENY,
    soulContent: `
## Role Focus: Data Analyst
- You are a data specialist focused on analysis and decision support.
- Use Python/statistical workflows for data cleaning, exploration, and charting.
- Present conclusions with assumptions and confidence clearly stated.
`,
    agentsContent: `
## Role Extension: Data Analyst
- Favor reproducible workflows and explicit methodology.
- Highlight anomalies, caveats, and next-step recommendations.
`,
  },
]

export const DEFAULT_TEMPLATE_ID: AgentTemplateId = 'orchestrator'

export function getTemplateById(id: AgentTemplateId): AgentTemplate {
  return AGENT_TEMPLATES.find(t => t.id === id) || AGENT_TEMPLATES[0]
}

export function buildAgentsTeamMarkdown(subAgents: SubAgentRecord[]): string {
  const lines = ['# agents-team.md', '', 'Sub-agent roster and capabilities.', '']
  if (!subAgents.length) {
    lines.push('- No sub-agents deployed yet.')
    return lines.join('\n') + '\n'
  }

  for (const sa of subAgents) {
    const template = getTemplateById(sa.template)
    lines.push(`## ${sa.name}`)
    lines.push(`- Template: ${template.name}`)
    lines.push(`- Status: ${sa.status}`)
    lines.push(`- Session Key: ${sa.sessionKey}`)
    lines.push(`- Capabilities: ${template.description}`)
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

export function orchestratorDelegationBlock(subAgents: SubAgentRecord[]): string {
  const names = subAgents.length ? subAgents.map(sa => `${sa.name} (${getTemplateById(sa.template).name})`).join(', ') : 'No sub-agents deployed yet.'
  return `
## Sub-Agent Delegation
You have a team of sub-agents. Use \`sessions_spawn\` to delegate tasks.
Available sub-agents: ${names}
`
}
