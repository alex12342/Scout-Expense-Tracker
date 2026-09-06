import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { cn } from "./cn";

interface ToastMessage {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (message: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const idRef = useRef(0);

  const toast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info") => {
      const id = ++idRef.current;
      setMessages((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }, 4000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "animate-rise rounded-lg border px-4 py-3 text-sm shadow-lift",
              m.type === "success" && "border-moss bg-moss-soft text-pine-deep",
              m.type === "error" && "border-ember bg-ember-soft text-ember",
              m.type === "info" && "border-line bg-surface text-ink",
            )}
          >
            {m.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
