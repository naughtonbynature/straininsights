import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface SDKContextValue {
  sdk: any | null;
  ready: boolean;
  brandGuide: any | null;
  isStandalone: boolean;
}

const SDKCtx = createContext<SDKContextValue>({ sdk: null, ready: false, brandGuide: null, isStandalone: true });

let sdkRef: any = null;

export function SDKProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [brandGuide, setBrandGuide] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(true);

  useEffect(() => {
    const W = window as any;
    if (!W.HeadySDK) {
      setTimeout(() => setReady(true), 3000);
      return;
    }
    const sdk = new W.HeadySDK();
    sdkRef = sdk;
    const timer = setTimeout(() => { setReady(true); setIsStandalone(true); }, 3000);

    sdk.on("ready", async () => {
      clearTimeout(timer);
      setReady(true);
      setIsStandalone(false);
      try {
        const guide = await sdk.getBrandGuide();
        setBrandGuide(guide);
      } catch {}
    });
  }, []);

  return (
    <SDKCtx.Provider value={{ sdk: sdkRef, ready, brandGuide, isStandalone }}>
      {children}
    </SDKCtx.Provider>
  );
}

export const useSDK = () => useContext(SDKCtx);
