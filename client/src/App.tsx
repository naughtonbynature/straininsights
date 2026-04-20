import { Switch, Route, Router } from "wouter";
import { useSDK } from "@/lib/sdk-context";
import { useEffect, useRef } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SDKProvider } from "@/lib/sdk-context";
import NotFound from "@/pages/not-found";
import UploadPage from "@/pages/Upload";
import ConfirmPage from "@/pages/Confirm";
import ResultsPage from "@/pages/Results";
import DetailPage from "@/pages/Detail";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { BrandBar } from "@/components/BrandBar";

// ── Error Boundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to Heady OS via SDK if available
    const W = window as any;
    if (W.HeadySDK) {
      try {
        const sdk = new W.HeadySDK();
        sdk.reportError({
          title: "Component crash: StrainInsights",
          description: error.message,
          stackTrace: errorInfo?.componentStack || error.stack,
          severity: "high",
          currentPage: window.location.href,
        });
      } catch {
        // Ignore errors in error reporting
      }
    }
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-6"
          style={{ background: "#0A0A0B", color: "#F5F5F5" }}
        >
          <p className="text-lg font-semibold mb-2" style={{ color: "#C8FF00" }}>Something went wrong</p>
          <p className="text-sm mb-6" style={{ color: "#999" }}>{this.state.error?.message}</p>
          <button
            className="text-xs px-4 py-2 rounded"
            style={{ background: "#C8FF00", color: "#0A0A0B", fontWeight: 600 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

function AppRouter() {
  const { sdk, context, ready } = useSDK();
  const resumeAttempted = useRef(false);

  useEffect(() => {
    const pid = (context as any)?.pendingProjectId;
    if (!pid || !sdk || !ready || resumeAttempted.current) return;
    resumeAttempted.current = true;
    sdk.loadProject(pid).then((project: any) => {
      const data = project?.data || project;
      if (!data) return;
      // StrainInsights saves resultIds — navigate to results page
      if (data.resultIds?.length > 0) {
        window.location.hash = "#/results";
      }
    }).catch((e: any) => console.warn("Resume failed:", e));
  }, [sdk, context, ready]);

  return (
    <Switch>
      <Route path="/" component={UploadPage} />
      <Route path="/confirm/:id" component={ConfirmPage} />
      <Route path="/results" component={ResultsPage} />
      <Route path="/detail/:id" component={DetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <SDKProvider>
          <BrandBar />
          <ErrorBoundary>
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </ErrorBoundary>
        </SDKProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
