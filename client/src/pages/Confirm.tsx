import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSDK } from "@/lib/sdk-context";
import type { LabResult } from "@shared/schema";

/**
 * Plausibility check. Mirrors server/pdf-parser.ts `validateLabResult` so the
 * user can immediately see if we parsed the wrong column from a weird COA
 * layout (e.g. mg/g column read as %). Thresholds: cannabinoid >99%,
 * terpene >5%, total terpenes >10%. Over these ⇒ parse almost certainly wrong.
 */
interface ParseWarning { label: string; detail: string }
function checkPlausibility(
  cannabinoids: Record<string, number>,
  terpenes: Record<string, number>,
  totalThc: number | null,
  totalCannabinoids: number | null,
  totalTerpenes: number | null,
): ParseWarning[] {
  const out: ParseWarning[] = [];
  if ((totalThc ?? 0) > 99) out.push({ label: "Total THC", detail: `${(totalThc!).toFixed(1)}% exceeds 99%` });
  if ((totalCannabinoids ?? 0) > 100) out.push({ label: "Total Cannabinoids", detail: `${(totalCannabinoids!).toFixed(1)}% exceeds 100%` });
  if ((totalTerpenes ?? 0) > 10) out.push({ label: "Total Terpenes", detail: `${(totalTerpenes!).toFixed(2)}% exceeds 10%` });
  for (const [k, v] of Object.entries(cannabinoids || {})) {
    if (typeof v === "number" && v > 99) out.push({ label: k.toUpperCase(), detail: `${v.toFixed(1)}% exceeds 99%` });
  }
  for (const [k, v] of Object.entries(terpenes || {})) {
    if (typeof v === "number" && v > 5) out.push({ label: k, detail: `${v.toFixed(2)}% exceeds 5%` });
  }
  return out;
}

function TerpeneBar({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-right" style={{ color: "#F5F5F5" }}>{name}</span>
      <div className="flex-1 h-4 rounded" style={{ background: "#2A2A2A" }}>
        <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: `hsl(73 100% ${50 + (1 - value / max) * 20}%)` }} />
      </div>
      <span className="w-14 text-right font-mono" style={{ color: "#C8FF00" }}>{value.toFixed(2)}%</span>
    </div>
  );
}

function CannabinoidBar({ name, value, color }: { name: string; value: number; color: string }) {
  if (value <= 0) return null;
  const maxDisplay = Math.max(value, 5);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 truncate text-right" style={{ color: "#F5F5F5" }}>{name}</span>
      <div className="flex-1 h-4 rounded" style={{ background: "#2A2A2A" }}>
        <div className="h-full rounded" style={{ width: `${Math.min((value / maxDisplay) * 100, 100)}%`, background: color, minWidth: value > 0 ? "4px" : 0 }} />
      </div>
      <span className="w-14 text-right font-mono" style={{ color: "#F5F5F5" }}>{value.toFixed(2)}%</span>
    </div>
  );
}

export default function ConfirmPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/confirm/:id");
  const id = params?.id || "";
  const { sdk, brandGuide, brandContext } = useSDK();

  const { data: result, isLoading } = useQuery<LabResult>({
    queryKey: ["/api/results", id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/results/${id}`); return r.json(); },
    enabled: !!id,
  });

  const [productName, setProductName] = useState("");
  const [strainName, setStrainName] = useState("");
  const [productType, setProductType] = useState("");
  const [brandName, setBrandName] = useState("");
  const [inited, setInited] = useState(false);

  if (result && !inited) {
    setProductName(result.productName || "");
    setStrainName(result.strainName || "");
    setProductType(result.productType || "flower");
    setBrandName(result.brandName || "");
    setInited(true);
  }

  const generateMutation = useMutation({
    mutationFn: async () => {
      // First update the result with any edits
      await apiRequest("PATCH", `/api/results/${id}`, { productName, strainName, productType, brandName });

      // Send canonical Brand Context markdown (full guide — voice pillars,
      // do/dont rules, jargon policy, TM rules) so generated product copy
      // matches brand voice. Legacy `brandVoice` kept for backwards compat
      // when running standalone or against an older parent.
      const brandContextMarkdown = brandContext?.markdown || "";
      const brandVoice = brandGuide?.voicePillars
        ? (Array.isArray(brandGuide.voicePillars)
            ? brandGuide.voicePillars.join(", ")
            : String(brandGuide.voicePillars))
        : "";

      // Get the 3 prompts from backend (no LLM call there)
      const promptsRes = await apiRequest("POST", `/api/results/${id}/generate-prompts`, {
        brandContext: brandContextMarkdown,
        brandVoice,
      });
      const { productPrompt, strainPrompt, insightPrompt } = await promptsRes.json();

      // Call LLM via SDK (credit-tracked through parent)
      const callSdkLLM = async (prompt: string): Promise<string> => {
        if (sdk) {
          try {
            const res = await sdk.callLLM({
              model: "premium",
              messages: [{ role: "user", content: prompt }],
              maxTokens: 600,
            });
            return res?.content || res?.choices?.[0]?.message?.content || "";
          } catch (e) {
            console.error("sdk.callLLM error:", e);
            return "";
          }
        }
        return "";
      };

      const [productDescription, strainDescription, terpeneInsight] = await Promise.all([
        callSdkLLM(productPrompt),
        callSdkLLM(strainPrompt),
        callSdkLLM(insightPrompt),
      ]);

      // Save generated text back to the result
      await apiRequest("PATCH", `/api/results/${id}`, {
        productDescription,
        strainDescription,
        terpeneInsight,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/results", id] });
      navigate(`/detail/${id}`);
    },
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#C8FF00" }} /></div>;
  if (!result) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: "#999" }}>Result not found</div>;

  const cannabinoids = JSON.parse(result.cannabinoids || "{}");
  const terpenes = JSON.parse(result.terpenes || "{}");
  const sortedTerpenes = Object.entries(terpenes).filter(([, v]) => (v as number) > 0).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 6);
  const maxTerp = sortedTerpenes.length > 0 ? (sortedTerpenes[0][1] as number) : 1;

  const parseWarnings = checkPlausibility(
    cannabinoids,
    terpenes,
    result.totalThc,
    result.totalCannabinoids,
    result.totalTerpenes,
  );

  const cannabinoidEntries = [
    { name: "THC", value: cannabinoids.thc || cannabinoids.d9thc || 0, color: "#C8FF00" },
    { name: "THCA", value: cannabinoids.thca || 0, color: "#a8d900" },
    { name: "CBD", value: cannabinoids.cbd || 0, color: "#4A9EFF" },
    { name: "CBDA", value: cannabinoids.cbda || 0, color: "#3A7ECC" },
    { name: "CBG", value: cannabinoids.cbg || 0, color: "#CA6641" },
    { name: "THCV", value: cannabinoids.thcv || 0, color: "#E8A838" },
    { name: "CBN", value: cannabinoids.cbn || 0, color: "#9B59B6" },
    { name: "CBC", value: cannabinoids.cbc || 0, color: "#1ABC9C" },
    { name: "CBT", value: cannabinoids.cbt || 0, color: "#95A5A6" },
  ].filter(c => c.value > 0);

  return (
    <div className="min-h-screen p-6" style={{ background: "#0A0A0B" }}>
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate("/")} className="flex items-center gap-1 text-xs mb-6 hover:opacity-80" style={{ color: "#999" }}>
          <ArrowLeft className="w-3 h-3" /> Back to Upload
        </button>

        <h1 className="text-xl font-bold mb-1" style={{ color: "#F5F5F5" }}>Confirm Lab Results</h1>
        <p className="text-sm mb-6" style={{ color: "#999" }}>Verify the parsed data before generating content</p>

        {brandGuide && (
          <div className="mb-4 text-xs px-3 py-2 rounded" style={{ background: "#1A1A1B", color: "#C8FF00", border: "1px solid #2A2A2A" }}>
            Brand voice loaded from your brand guide
          </div>
        )}

        {parseWarnings.length > 0 && (
          <div
            className="mb-4 text-xs px-4 py-3 rounded"
            style={{ background: "#2A1F0A", color: "#FFD37A", border: "1px solid #5C4210" }}
            data-testid="parse-warnings"
          >
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold" style={{ color: "#FFC043" }}>
                  We may have parsed this COA incorrectly
                </div>
                <div className="mt-1" style={{ color: "#E0C98A" }}>
                  The values below are implausibly high — likely the wrong column was read from the PDF. Please verify the fields before generating content, or re-upload a clearer COA.
                </div>
              </div>
            </div>
            <ul className="ml-6 list-disc space-y-0.5" style={{ color: "#E0C98A" }}>
              {parseWarnings.map((w, i) => (
                <li key={i}><span className="font-mono">{w.label}</span> — {w.detail}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card style={{ background: "#1A1A1B", borderColor: "#2A2A2A" }}>
            <CardHeader className="pb-3"><CardTitle className="text-sm" style={{ color: "#F5F5F5" }}>Cannabinoid Profile</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-4 mb-3 text-xs" style={{ color: "#999" }}>
                <span>Total THC: <b style={{ color: "#C8FF00" }}>{result.totalThc?.toFixed(1)}%</b></span>
                <span>Total Cannabinoids: <b style={{ color: "#F5F5F5" }}>{result.totalCannabinoids?.toFixed(1)}%</b></span>
              </div>
              {cannabinoidEntries.map(c => <CannabinoidBar key={c.name} {...c} />)}
            </CardContent>
          </Card>

          <Card style={{ background: "#1A1A1B", borderColor: "#2A2A2A" }}>
            <CardHeader className="pb-3"><CardTitle className="text-sm" style={{ color: "#F5F5F5" }}>Dominant Terpenes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs mb-3" style={{ color: "#999" }}>Total Terpenes: <b style={{ color: "#C8FF00" }}>{result.totalTerpenes?.toFixed(2)}%</b></div>
              {sortedTerpenes.map(([name, value]) => (
                <TerpeneBar key={name} name={name} value={value as number} max={maxTerp} />
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6" style={{ background: "#1A1A1B", borderColor: "#2A2A2A" }}>
          <CardContent className="pt-4 grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "#999" }}>Product Name</label>
              <Input value={productName} onChange={e => setProductName(e.target.value)} className="bg-[#0A0A0B] border-[#2A2A2A] text-[#F5F5F5]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "#999" }}>Strain Name</label>
              <Input value={strainName} onChange={e => setStrainName(e.target.value)} className="bg-[#0A0A0B] border-[#2A2A2A] text-[#F5F5F5]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "#999" }}>Product Type</label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger className="bg-[#0A0A0B] border-[#2A2A2A] text-[#F5F5F5]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flower">Flower</SelectItem>
                  <SelectItem value="vape">Vape Cartridge</SelectItem>
                  <SelectItem value="concentrate">Concentrate</SelectItem>
                  <SelectItem value="edible">Edible</SelectItem>
                  <SelectItem value="pre-roll">Pre-Roll</SelectItem>
                  <SelectItem value="topical">Topical</SelectItem>
                  <SelectItem value="tincture">Tincture</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "#999" }}>Brand</label>
              <Input value={brandName} onChange={e => setBrandName(e.target.value)} className="bg-[#0A0A0B] border-[#2A2A2A] text-[#F5F5F5]" />
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full h-12 text-sm font-semibold"
          style={{ background: "#C8FF00", color: "#0A0A0B" }}
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate"
        >
          {generateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Descriptions...</> : <><Sparkles className="w-4 h-4 mr-2" /> Confirm & Generate Descriptions</>}
        </Button>
      </div>
    </div>
  );
}
