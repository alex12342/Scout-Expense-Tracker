import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { AuthProvider } from "./lib/auth";
import { queryClient } from "./lib/queryClient";
import { ToastProvider } from "./components/ui";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <ToastProvider>
            <App />
          </ToastProvider>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
