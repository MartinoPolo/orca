import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        dot: 'bg-background text-foreground border-border shadow-xs dark:bg-secondary dark:border-white/20',
        destructive:
          'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline:
          'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
        /** The chip naming the machine a workspace runs on — quieter and squarer than `secondary`,
         *  so it reads as context beside a workspace name rather than as a status of its own. */
        hostContext:
          'h-4 rounded border-border bg-accent px-1.5 text-[10px] leading-none text-muted-foreground dark:border-border/50 dark:bg-accent/80',
        priorityP1:
          'h-4 min-w-6 rounded border-session-priority-p1-border bg-session-priority-p1 px-1 text-[9px] font-semibold leading-none text-session-priority-p1-foreground',
        priorityP2:
          'h-4 min-w-6 rounded border-session-priority-p2-border bg-session-priority-p2 px-1 text-[9px] font-semibold leading-none text-session-priority-p2-foreground',
        priorityP3:
          'h-4 min-w-6 rounded border-session-priority-p3 bg-session-priority-p3 px-1 text-[9px] font-semibold leading-none text-white',
        priorityP4:
          'h-4 min-w-6 rounded border-session-priority-p4-border bg-session-priority-p4 px-1 text-[9px] font-semibold leading-none text-session-priority-p4-foreground',
        priorityP5:
          'h-4 min-w-6 rounded border-session-priority-p5-border bg-session-priority-p5 px-1 text-[9px] font-semibold leading-none text-session-priority-p5-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
