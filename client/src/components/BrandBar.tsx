import { useSDK } from "@/lib/sdk-context";
import { Link2, Link2Off, Palette } from "lucide-react";

export function BrandBar() {
  const { brandGuide, context, ready } = useSDK();

  if (!ready) return null;

  const brandName = brandGuide?.companyName || brandGuide?.brandName;
  const connected = !!context?.userId;
  const accentColor = brandGuide?.colorAccent || brandGuide?.colorPrimary;

  return (
    <div
      className="flex items-center justify-between px-4 py-1.5 text-xs shrink-0"
      style={{
        background: "#111113",
        borderBottom: "1px solid #1E1E20",
        color: "#888",
        minHeight: 28,
      }}
    >
      <div className="flex items-center gap-2">
        {connected ? (
          <Link2 className="w-3 h-3" style={{ color: "#4ade80" }} />
        ) : (
          <Link2Off className="w-3 h-3" style={{ color: "#666" }} />
        )}
        {brandName ? (
          <span className="flex items-center gap-1.5">
            <span style={{ color: "#aaa" }}>Brand:</span>
            <span className="font-medium" style={{ color: "#e5e5e5" }}>{brandName}</span>
            {accentColor && (
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: accentColor, border: "1px solid rgba(255,255,255,0.15)" }}
              />
            )}
          </span>
        ) : connected ? (
          <span style={{ color: "#777" }}>No brand guide set — <span style={{ color: "#999" }}>complete onboarding in Heady OS</span></span>
        ) : (
          <span style={{ color: "#666" }}>Not connected to Heady OS</span>
        )}
      </div>
      {brandGuide?.fontHeadline && (
        <span className="hidden sm:flex items-center gap-1.5" style={{ color: "#666" }}>
          <Palette className="w-3 h-3" />
          {brandGuide.fontHeadline}
        </span>
      )}
    </div>
  );
}
