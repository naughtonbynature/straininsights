import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { FlaskConical, Upload as UploadIcon, FileSpreadsheet, Loader2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useSDK } from "@/lib/sdk-context";

export default function UploadPage() {
  const [, navigate] = useLocation();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { sdk } = useSDK();

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
