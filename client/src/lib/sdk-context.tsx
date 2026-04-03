import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";

interface HeadyContext {
  userId: string;
  teamId: string;
  toolSlug?: string;
  hasOwnKeys?: boolean;
}

interface SDKState {
  sdk: any | null;
  context: HeadyContext | null;
  brandGuide: any | null;
  ready: boolean;
}

const SDKContext = createContext<SDKState>({
  sdk: null, context: null, brandGuide: null, ready: false,
});

export function SDKProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SDKState>({
    sdk: null, context: null, brandGuide: null, ready: false,
  });
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    function tryInit() {
      const W = window as any;
      if (!W.HeadySDK) { setTimeout(tryInit, 100); return; }

      const sdk = new W.HeadySDK();
      sdk.on("ready", async (ctx: HeadyContext) => {
        let brandGuide = null;
        try { brandGuide = await sdk.getBrandGuide(); } catch {}
        setState({ sdk, context: ctx, brandGuide, ready: true });
      });

      // Standalone fallback (not in iframe) — ready after 2s with no context
      setTimeout(() => {
        setState((prev) => prev.ready ? prev : { sdk, context: null, brandGuide: null, ready: true });
      }, 2000);
    }
    tryInit();
  }, []);

  return <SDKContext.Provider value={state}>{children}</SDKContext.Provider>;
}

export function useSDK() { return useContext(SDKContext); }
