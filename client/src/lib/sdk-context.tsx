import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";

interface HeadyContext {
  pendingProjectId?: string;
  userId: string;
  teamId: string;
  toolSlug?: string;
  hasOwnKeys?: boolean;
}

interface BrandContext {
  markdown: string;
  version: string;
  hasContent: boolean;
}

interface SDKState {
  sdk: any | null;
  context: HeadyContext | null;
  brandGuide: any | null;
  brandContext: BrandContext | null;
  ready: boolean;
}

const SDKContext = createContext<SDKState>({
  sdk: null, context: null, brandGuide: null, brandContext: null, ready: false,
});

export function SDKProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SDKState>({
    sdk: null, context: null, brandGuide: null, brandContext: null, ready: false,
  });
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    function tryInit() {
      const W = window as any;
      if (!W.HeadySDK) { setTimeout(tryInit, 100); return; }

      const sdk = new W.HeadySDK();
      W._headySDKInstance = sdk;
      sdk.on("ready", async (ctx: HeadyContext) => {
        let brandGuide = null;
        try { brandGuide = await sdk.getBrandGuide(); } catch {}
        let brandContext: BrandContext | null = null;
        try {
          if (typeof sdk.getBrandContext === "function") {
            const r = await sdk.getBrandContext();
            if (r && typeof r.markdown === "string") {
              brandContext = { markdown: r.markdown, version: r.version || "", hasContent: !!r.hasContent };
            }
          }
        } catch {}
        setState({ sdk, context: ctx, brandGuide, brandContext, ready: true });
      });

      // Standalone fallback (not in iframe) — ready after 2s with no context
      setTimeout(() => {
        setState((prev) => prev.ready ? prev : { sdk, context: null, brandGuide: null, brandContext: null, ready: true });
      }, 2000);
    }
    tryInit();
  }, []);

  return <SDKContext.Provider value={state}>{children}</SDKContext.Provider>;
}

export function useSDK() { return useContext(SDKContext); }
