import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="text-zinc-600 w-12 h-12">{icon}</div>
      <div>
        <p className="text-zinc-300 font-medium">{title}</p>
        {description && <p className="text-zinc-500 text-sm mt-1">{description}</p>}
      </div>
      {action}
    </div>
  )
}
