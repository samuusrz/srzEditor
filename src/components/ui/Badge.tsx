import type { ReactNode } from 'react'

type Color = 'violet' | 'green' | 'yellow' | 'red' | 'zinc'

const colors: Record<Color, string> = {
  violet: 'bg-violet-900/40 text-violet-300 border-violet-800/50',
  green: 'bg-green-900/40 text-green-300 border-green-800/50',
  yellow: 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50',
  red: 'bg-red-900/40 text-red-300 border-red-800/50',
  zinc: 'bg-zinc-800 text-zinc-400 border-zinc-700',
}

interface BadgeProps {
  children: ReactNode
  color?: Color
}

export function Badge({ children, color = 'zinc' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${colors[color]}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, Color> = {
    draft: 'zinc',
    rendering: 'yellow',
    done: 'green',
    failed: 'red',
  }
  return <Badge color={map[status] ?? 'zinc'}>{status}</Badge>
}
