import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { ReactNode } from 'react'

const baseClass = `
  w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2
  text-sm text-zinc-100 placeholder-zinc-500
  focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500
  transition-colors
`

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseClass} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className={`${baseClass} resize-none ${props.className ?? ''}`}
    />
  )
}

interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}
