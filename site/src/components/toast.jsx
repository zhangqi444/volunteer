import * as React from "react"
import { cn } from "@/lib/utils"

const Ctx = React.createContext(() => {})

export function ToastProvider({ children }) {
  const [toast, setToast] = React.useState(null)
  const timer = React.useRef()
  const show = React.useCallback((message, { error = false } = {}) => {
    clearTimeout(timer.current)
    setToast({ message, error, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), error ? 5000 : 2600)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 print:hidden">
        {toast && (
          <div key={toast.key} data-testid="toast" className={cn("animate-in fade-in slide-in-from-bottom-2 rounded-full px-4 py-2 text-sm shadow-lg", toast.error ? "bg-destructive text-white" : "bg-foreground text-background")}>
            {toast.message}
          </div>
        )}
      </div>
    </Ctx.Provider>
  )
}
export function useToast() { return React.useContext(Ctx) }
