import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, RefreshCw, Globe, Mail, Video, Loader2, Check, FlaskConical } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LabResult } from "@shared/schema";

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  if (value <= 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-right" style={{ color: "#F5F5F5" }}>{label}</span>
      <div className="flex-1 h-3 rounded" style={{ background: "#2A2A2A" }}>
        <div className="h-full rounded" style={{ width: `${Math.min((value / max) * 100, 100)}%`, background: color, minWidth: "3px" }} />
      </div>
      <span className="w-14 text-right font-mono text-xs" style={{ color }}>{value.toFixed(2)}%</span>
    </div>
  );
}

export default function DetailPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/detail/:id");
  const id = params?.id || "";
  const { toast } = useToast();
  const [regenerating, setRegenerating] = useState("");

  const { data: result, isLoading } = useQuery<LabResult>({
    queryKey: ["/api/results", id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/results/${id}`); return r.json(); },
    enabled: !!id,
  });

  const handoffMutation = useMutation({
    mutationFn: async (type: string) => {
      const r = await apiRequest("POST", `/api/results/${id}/handoff/${type}`);
      return r.json();
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/results", id] });
      toast({ title: `Draft: ${type.toUpperCase()} sent`, description: "Content request queued for Neural" });
    },
  });

  const handleRegenerate = async () => {
    setRegenerating("all");
    try {
      await apiRequest("POST", `/api/results/${id}/generate`);
      queryClient.invalidateQueries({ queryKey: ["/api/results", id] });
    } catch {}
    setRegenerating("");
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const handleSave = async (field: string, value: string) => {
    await apiRequest("PATCH", `/api/results/${id}`, { [field]: value });
    queryClient.invalidateQueries({ queryKey: ["/api/results", id] });
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#C8FF00" }} /></div>;
  if (!result) return <div className="min-h-screen flex items-center justify-center" style={{ color: "#999" }}>Not found</div>;

  const cannabinoids = JSON.parse(result.cannabinoids || "{}");
  const terpenes = JSON.parse(result.terpenes || "{}");
  const sortedTerps = Object.entries(terpenes).filter(([, v]) => (v as number) > 0).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 8);
  const maxTerp = sortedTerps.length > 0 ? (sortedTerps[0][1] as number) : 1;
  const cannEntries = [
    { label: "THC", value: cannabinoids.thc || cannabinoids.d9thc || 0, color: "#C8FF00" },
    { label: "THCA", value: cannabinoids.thca || 0, color: "#a8d900" },
    { label: "CBD", value: cannabinoids.cbd || 0, color: "#4A9EFF" },
    { label: "CBG", value: cannabinoids.cbg || 0, color: "#CA6641" },
    { label: "THCV", value: cannabinoids.thcv || 0, color: "#E8A838" },
    { label: "CBN", value: cannabinoids.cbn || 0, color: "#9B59B6" },
    { label: "CBC", value: cannabinoids.cbc || 0, color: "#1ABC9C" },
  ].filter(c => c.value > 0);
  const maxCann = Math.max(...cannEntries.map(c => c.value), 1);

  const workflows = [
    { type: "web", label: "Draft: WEB", desc: "Send to Web Copywriter for a Product Spotlight blog post", icon: Globe, color: "#C8FF00", status: result.webDraftStatus },
    { type: "crm", label: "Draft: CRM", desc: "Send to Email & SMS Copywriter for a campaign", icon: Mail, color: "#CA6641", status: result.crmDraftStatus },
    { type: "ugc", label: "Draft: UGC", desc: "Send to UGC Script Writer for social content", icon: Video, color: "#F5F5F5", status: result.ugcDraftStatus },
  ];

  return (
    <div className="min-h-screen p-6" style={{ background: "#0A0A0B" }}>
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate("/results")} className="flex items-center gap-1 text-xs mb-6 hover:opacity-80" style={{ color: "#999" }}>
          <ArrowLeft className="w-3 h-3" /> Back to Results
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#F5F5F5" }}>{result.productName}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "#999" }}>
            {result.strainName && <span>{result.strainName}</span>}
            {result.brandName && <span>• {result.brandName}</span>}
            {result.testDate && <span>• Tested {result.testDate}</span>}
            {result.labName && <span>• {result.labName}</span>}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card style={{ background: "#1A1A1B", borderColor: "#2A2A2A" }}>
            <CardHeader className="pb-2"><CardTitle className="text-xs" style={{ color: "#999" }}>Cannabinoids</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {cannEntries.map(c => <Bar key={c.label} {...c} max={maxCann} />)}
            </CardContent>
          </Card>
          <Card style={{ background: "#1A1A1B", borderColor: "#2A2A2A" }}>
            <CardHeader className="pb-2"><CardTitle className="text-xs" style={{ color: "#999" }}>Terpenes</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {sortedTerps.map(([name, value]) => <Bar key={name} label={name} value={value as number} max={maxTerp} color="#C8FF00" />)}
            </CardContent>
          </Card>
        </div>

        {result.terpeneInsight && (
          <Card className="mb-6" style={{ background: "#1A1A1B", borderColor: "#2A2A2A", borderLeft: "3px solid #C8FF00" }}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2" style={{ color: "#F5F5F5" }}><FlaskConical className="w-4 h-4" style={{ color: "#C8FF00" }} /> Terpene & Cannabinoid Insight</CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs" style={{ color: "#999" }} onClick={handleRegenerate} disabled={!!regenerating}>
                  <RefreshCw className={`w-3 h-3 mr-1 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
                </Button>
              </div>
            </CardHeader>
            <CardContent><p className="text-sm leading-relaxed" style={{ color: "#CCC" }}>{result.terpeneInsight}</p></CardContent>
          </Card>
        )}

        {[
          { field: "productDescription", title: "Product Description", value: result.productDescription },
          { field: "strainDescription", title: "Strain Description", value: result.strainDescription },
        ].map(({ field, title, value }) => value ? (
          <Card key={field} className="mb-4" style={{ background: "#1A1A1B", borderColor: "#2A2A2A" }}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm" style={{ color: "#F5F5F5" }}>{title}</CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-xs" style={{ color: "#999" }} onClick={() => handleCopy(value, title)}><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                defaultValue={value}
                onBlur={(e) => handleSave(field, e.target.value)}
                className="bg-[#0A0A0B] border-[#2A2A2A] text-[#CCC] text-sm min-h-[100px]"
              />
              <p className="text-xs mt-1" style={{ color: "#666" }}>{value.split(/\s+/).length} words</p>
            </CardContent>
          </Card>
        ) : null)}

        <div className="space-y-3 mt-8">
          <h3 className="text-sm font-medium" style={{ color: "#999" }}>Send to Neural</h3>
          {workflows.map(wf => (
            <Card key={wf.type} className="cursor-pointer hover:opacity-90 transition-opacity" style={{ background: "#1A1A1B", borderColor: wf.color, borderWidth: "1px" }}
              onClick={() => wf.status !== "sent" && handoffMutation.mutate(wf.type)}>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <wf.icon className="w-4 h-4" style={{ color: wf.color }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#F5F5F5" }}>{wf.label}</p>
                    <p className="text-xs" style={{ color: "#999" }}>{wf.desc}</p>
                  </div>
                </div>
                {wf.status === "sent" ? (
                  <div className="flex items-center gap-1 text-xs" style={{ color: "#22C55E" }}><Check className="w-3 h-3" /> Sent</div>
                ) : handoffMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: wf.color }} />
                ) : (
                  <span className="text-xs" style={{ color: wf.color }}>Send →</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
