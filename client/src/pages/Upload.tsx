import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FlaskConical, Upload as UploadIcon, FileSpreadsheet, Loader2, Info, Search, TrendingUp, Database } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useSDK } from "@/lib/sdk-context";

export default function UploadPage() {
  const [, navigate] = useLocation();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { sdk, context } = useSDK();
  const [searchQuery, setSearchQuery] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

  // Fetch POS products with lab results
  const { data: posData } = useQuery<{ available: boolean; products: any[] }>({
    queryKey: ["/api/pos-products", context?.teamId || "none"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pos-products");
      return res.json();
    },
    enabled: !!context?.teamId,
  });

  // Search POS products
  const { data: searchResults } = useQuery<{ products: any[] }>({
    queryKey: ["/api/pos-products/search", searchQuery],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pos-products/search?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: searchQuery.length >= 2 && !!context?.teamId,
  });

  // Import a POS product into StrainInsights
  async function importPosProduct(product: any) {
    setImporting(product.productId?.toString());
    try {
      const res = await apiRequest("POST", "/api/results/from-pos", { product });
      const data = await res.json();
      if (data.result?.id) {
        navigate(`/confirm/${data.result.id}`);
      }
    } catch (e: any) {
      setError(e.message || "Import failed");
    }
    setImporting(null);
  }

  // Resume from a pending project
  useEffect(() => {
    const pendingId = (context as any)?.pendingProjectId;
    if (!pendingId || !sdk) return;
    (async () => {
      try {
        const data = await sdk.loadProject(pendingId);
        if (data?.resultIds?.length) {
          // Navigate to results page with the saved result IDs
          if (data.resultIds.length === 1) {
            navigate(`/confirm/${data.resultIds[0]}`);
          } else {
            navigate("/results");
          }
        }
      } catch (e) {
        console.warn("Failed to resume StrainInsights project:", e);
      }
    })();
  }, [sdk, context, navigate]);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      // Step 1: Parse the file
      const parseRes = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
      const parseData = await parseRes.json();
      if (!parseRes.ok) { setError(parseData.message || "Upload failed"); setUploading(false); return; }

      const { results: parsed, sourceType, sourceFilename } = parseData;

      // Step 2: Save all results to tool's SQLite
      const saveRes = await fetch(`${API_BASE}/api/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: parsed, sourceType, sourceFilename }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) { setError(saveData.message || "Save failed"); setUploading(false); return; }

      const saved = saveData.results as Array<{ id: string }>;

      // Step 3: Create a project in the SDK so it appears in the Heady OS dashboard
      if (sdk) {
        try {
          const projectName = sourceFilename || file.name;
          const project = await sdk.createProject(projectName, "straininsights");
          if (project?.id) {
            await sdk.saveProject(project.id, {
              resultIds: saved.map((r) => r.id),
              sourceFilename: projectName,
            });
          }
        } catch (e) {
          // Non-fatal: local results are saved; SDK project creation is best-effort
          console.warn("SDK project creation failed:", e);
        }
      }

      if (saved.length === 1) {
        navigate(`/confirm/${saved[0].id}`);
      } else {
        navigate("/results");
      }
    } catch (e: any) {
      setError(e.message || "Upload failed");
    }
    setUploading(false);
  }, [navigate, sdk]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#0A0A0B" }}>
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <FlaskConical className="w-8 h-8" style={{ color: "#C8FF00" }} />
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#C8FF00" }}>StrainInsights</h1>
        </div>
        <p className="text-sm" style={{ color: "#999" }}>Turn lab results into product content</p>
      </div>

      <div
        className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${dragging ? "border-[#C8FF00] scale-[1.02] bg-[#C8FF00]/5" : "border-[#2A2A2A] hover:border-[#C8FF00]/50"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        data-testid="upload-dropzone"
      >
        <input ref={fileRef} type="file" accept=".pdf,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        {uploading ? (
          <div className="space-y-3">
            <Loader2 className="w-10 h-10 mx-auto animate-spin" style={{ color: "#C8FF00" }} />
            <p className="text-sm" style={{ color: "#F5F5F5" }}>Processing lab results...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <UploadIcon className="w-10 h-10 mx-auto" style={{ color: "#666" }} />
            <p className="text-lg font-medium" style={{ color: "#F5F5F5" }}>Drop your COA here</p>
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-sm" style={{ color: "#666" }}>PDF or CSV</p>
              <Tooltip>
                <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Info className="w-3.5 h-3.5 cursor-help" style={{ color: "#666" }} />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[240px] text-xs" style={{ background: "#1A1A1B", color: "#CCC", border: "1px solid #2A2A2A" }}>
                  <p>Single COA as PDF, or a CSV with up to 50 products. Download the template below for the expected format.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs" style={{ color: "#C8FF00" }}>or click to browse</p>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      {/* POS Products with Lab Results */}
      {posData?.available && posData.products.length > 0 && (
        <div className="w-full max-w-lg mt-8">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4" style={{ color: "#C8FF00" }} />
            <h2 className="text-sm font-medium" style={{ color: "#F5F5F5" }}>POS Products with Lab Data</h2>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5" style={{ color: "#666" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border"
              style={{ background: "#1A1A1B", borderColor: "#2A2A2A", color: "#F5F5F5" }}
              data-testid="input-pos-search"
            />
          </div>

          {/* Search results or top sellers */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {(searchQuery.length >= 2 ? searchResults?.products || [] : posData.products.slice(0, 10)).map((p: any) => (
              <button
                key={p.productId}
                onClick={() => importPosProduct(p)}
                disabled={importing === p.productId?.toString()}
                className="w-full text-left px-3 py-2 rounded-lg border flex items-center gap-3 transition-colors hover:border-[#C8FF00]/50"
                style={{ background: "#1A1A1B", borderColor: "#2A2A2A" }}
                data-testid={`pos-product-${p.productId}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#F5F5F5" }}>{p.productName}</p>
                  <p className="text-xs truncate" style={{ color: "#888" }}>
                    {p.brandName}{p.strain ? ` · ${p.strain}` : ""}{p.strainType ? ` (${p.strainType})` : ""}
                  </p>
                </div>
                {p.hasLabData && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#C8FF00/15", color: "#C8FF00", border: "1px solid #C8FF0033" }}>
                    Lab
                  </span>
                )}
                {p.revenue > 0 && (
                  <span className="text-xs" style={{ color: "#888" }}>
                    ${Math.round(p.revenue).toLocaleString()}
                  </span>
                )}
                {importing === p.productId?.toString() ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#C8FF00" }} />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: "#666" }} />
                )}
              </button>
            ))}
          </div>

          {!searchQuery && posData.products.length > 10 && (
            <p className="text-xs mt-2 text-center" style={{ color: "#666" }}>
              Showing top 10 by revenue · {posData.products.length} products with lab data
            </p>
          )}

          <div className="border-t mt-6 pt-4" style={{ borderColor: "#2A2A2A" }}>
            <p className="text-xs text-center mb-3" style={{ color: "#666" }}>or upload a COA manually</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-6">
        <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
          try {
            const res = await apiRequest("GET", "/api/template.csv");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "straininsights-template.csv";
            a.click(); URL.revokeObjectURL(url);
          } catch {}
        }} data-testid="button-download-template">
          <FileSpreadsheet className="w-3 h-3 mr-1" /> Download CSV Template
        </Button>
      </div>

      <p className="text-xs mt-8 max-w-md text-center" style={{ color: "#666" }}>
        Upload a Certificate of Analysis (COA) PDF or a CSV of lab results. We'll extract cannabinoid and terpene data, then help you generate product descriptions, blog posts, and marketing content.
      </p>
    </div>
  );
}
