import { Switch, Route, Router } from "wouter";
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

function AppRouter() {
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
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </SDKProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
