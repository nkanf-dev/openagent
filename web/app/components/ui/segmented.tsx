import { cn } from "~/lib/utils"

type Option<T extends string> = {
  value: T
  label: React.ReactNode
}

type Props<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  disabled?: boolean
  className?: string
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className,
}: Props<T>) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-full border border-border/80 bg-background p-1 shadow-xs",
        disabled && "opacity-50",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
