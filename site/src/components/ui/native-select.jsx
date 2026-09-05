import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** The platform's own <select>, styled like the Input. Used on touch devices, where the
 *  system picker is more reliable and easier to use than a custom dropdown.
 *  No vertical padding and 16px text: iOS sizes select text itself and would clip it
 *  inside a padded fixed-height box, and 16px keeps Safari from zooming the page on focus. */
function NativeSelect({ className, size = "default", children, ...props }) {
  return (
    <div className={cn("relative w-full", className)} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "border-input dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive w-full appearance-none truncate rounded-md border bg-transparent py-0 pr-9 pl-3 text-base leading-none shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-10 data-[size=sm]:h-9"
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-50" />
    </div>
  )
}

export { NativeSelect }
