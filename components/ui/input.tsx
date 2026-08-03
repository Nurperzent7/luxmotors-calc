import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-all focus:border-[#C90C07]/50 focus:ring-2 focus:ring-[#C90C07]/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
