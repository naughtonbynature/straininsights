import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Globe, Mail, Video, Loader2, FolderOpen } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useSDK } from "@/lib/sdk-context";
import { useEffect, useState } from "react";
import type { LabResult } from "@shared/schema";

function StatusDot({ status }: { status: string }) {
  const color = status === "complete" ? "#22C55E" : status === "sent" ? "#C8FF00" : "#444";
  return <div className="w-2 h-2 rounded-full" style={{ background: color }} />;
}

interface SDKProject {
  id: string;
  name: string;
  createdAt?: string;
  data?: { resultIds?: string[]; sourceFilename?: string };
}

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const { sdk } = useSDK();
  const [sdkProjects, setSdkProjects] = useState<SDKProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const { data: results = [], isLoading } = useQuery<LabResult[]>({
    queryKey: ["/api/results"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/results");
      const data = await r.json();
      return data.results || data;
    },
  });

  // Load SDK projects (My Uploads from Heady OS dashboard)
  useEffect(() => {
    if (!sdk) return;
    setProjectsLoading(true);
    sdk.listProjects("straininsights")
      .then((list: SDKProject[]) => setSdkProjects(list || []))
      .catch((e: any) => console.warn("sdk.listProjects error:", e))
      .finally(() => setProjectsLoading(false));
  }, [sdk]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#C8FF00" }} /></div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "#0A0A0B" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#F5F5F5" }}>Lab Results</h1>
            <p className="text-sm" style={{ color: "#999" }}>{results.length} product{results.length !== 1 ? "s" : ""} processed</p>
          </div>
          <Button size="sm" style={{ background: "#C8FF00", color: "#0A0A0B" }} onClick={() => navigate("/")} data-testid="button-upload-more">
            <Plus className="w-3 h-3 mr-1" /> Upload More
          </Button>
        </div>

        {/* My Uploads — SDK projects from Heady OS dashboard */}
        {(sdkProjects.length > 0 || projectsLoading) && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4" style={{ color: "#C8FF00" }} />
              <h2 className="text-sm font-medium" style={{ color: "#999" }}>My Uploads</h2>
              {projectsLoading && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#666" }} />}
            </div>
            <div className="flex flex-wrap gap-2">
              {sdkProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: "#1A1A1B", border: "1px solid #2A2A2A", color: "#CCC" }}
                >
                  <span>{project.name}</span>
                  {project.data?.resultIds && (
                    <Badge variant="outline" className="text-xs h-4 px-1" style={{ borderColor: "#2A2A2A", color: "#666" }}>
                      {project.data.resultIds.length} result{project.data.resultIds.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm mb-4" style={{ color: "#666" }}>No lab results yet. Upload your first COA to get started.</p>
            <Button style={{ background: "#C8FF00", color: "#0A0A0B" }} onClick={() => navigate("/")} data-testid="button-first-upload">Upload Lab Results</Button>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #2A2A2A" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#1A1A1B" }}>
                  <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: "#999" }}>Product</th>
                  <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: "#999" }}>Strain</th>
                  <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: "#999" }}>Type</th>
                  <th className="text-right px-4 py-3 font-medium text-xs" style={{ color: "#999" }}>THC%</th>
                  <th className="text-left px-4 py-3 font-medium text-xs" style={{ color: "#999" }}>Top Terpene</th>
                  <th className="text-center px-4 py-3 font-medium text-xs" style={{ color: "#999" }}>Workflows</th>
                  <th className="text-right px-4 py-3 font-medium text-xs" style={{ color: "#999" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const terpenes = JSON.parse(r.terpenes || "{}");
                  const topTerp = Object.entries(terpenes).sort(([, a], [, b]) => (b as number) - (a as number))[0];
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer hover:bg-[#1A1A1B] transition-colors"
                      style={{ borderTop: "1px solid #1A1A1B" }}
                      onClick={() => navigate(`/detail/${r.id}`)}
                      data-testid={`row-result-${r.id}`}
                    >
                      <td className="px-4 py-3" style={{ color: "#F5F5F5" }}>{r.productName}</td>
                      <td className="px-4 py-3" style={{ color: "#999" }}>{r.strainName || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs" style={{ borderColor: "#2A2A2A", color: "#999" }}>{r.productType || "—"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "#C8FF00" }}>{r.totalThc?.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#999" }}>
                        {topTerp ? `${topTerp[0]} (${(topTerp[1] as number).toFixed(2)}%)` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="flex items-center gap-1" title="Web"><Globe className="w-3 h-3" style={{ color: "#666" }} /><StatusDot status={r.webDraftStatus || "none"} /></div>
                          <div className="flex items-center gap-1" title="CRM"><Mail className="w-3 h-3" style={{ color: "#666" }} /><StatusDot status={r.crmDraftStatus || "none"} /></div>
                          <div className="flex items-center gap-1" title="UGC"><Video className="w-3 h-3" style={{ color: "#666" }} /><StatusDot status={r.ugcDraftStatus || "none"} /></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" style={{ borderColor: "#C8FF00", color: "#C8FF00" }} onClick={() => navigate(`/detail/${r.id}`)} data-testid={`button-web-${r.id}`}>WEB</Button>
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" style={{ borderColor: "#CA6641", color: "#CA6641" }} onClick={() => navigate(`/detail/${r.id}`)} data-testid={`button-crm-${r.id}`}>CRM</Button>
                          <Button variant="outline" size="sm" className="h-6 text-xs px-2" style={{ borderColor: "#666", color: "#666" }} onClick={() => navigate(`/detail/${r.id}`)} data-testid={`button-ugc-${r.id}`}>UGC</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
