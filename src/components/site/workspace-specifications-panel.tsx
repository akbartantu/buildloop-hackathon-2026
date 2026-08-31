import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, FolderOpen, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DemoPanel } from "@/components/site/demo-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/i18n/context";
import {
  deleteProjectSpecification,
  deleteProjectSpecificationSet,
  listProjectSpecifications,
  uploadProjectSpecification,
  uploadProjectSpecificationSet,
} from "@/lib/specifications.functions";
import {
  SPECIFICATION_DOCUMENT_TYPES,
  specificationAuthorityLabel,
  type SpecificationDocumentType,
  type SpecificationRecord,
} from "@/lib/specifications/specification-record";
import type { SpecificationSetWithFiles } from "@/lib/specifications/specification-set-record";

type WorkspaceSpecificationsPanelProps = {
  projectId: string;
  disabled?: boolean;
};

function isSpecKitType(documentType: SpecificationDocumentType): boolean {
  return documentType === "Spec Kit";
}

export function WorkspaceSpecificationsPanel({
  projectId,
  disabled = false,
}: WorkspaceSpecificationsPanelProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fetchSpecifications = useServerFn(listProjectSpecifications);
  const uploadSpecification = useServerFn(uploadProjectSpecification);
  const uploadSpecificationSet = useServerFn(uploadProjectSpecificationSet);
  const removeSpecification = useServerFn(deleteProjectSpecification);
  const removeSpecificationSet = useServerFn(deleteProjectSpecificationSet);
  const [documentType, setDocumentType] = useState<SpecificationDocumentType>("PRD");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const specificationsQuery = useQuery({
    queryKey: ["specifications", projectId],
    queryFn: () => fetchSpecifications({ data: { projectId } }),
  });

  const catalog = specificationsQuery.data ?? { documents: [], sets: [] };
  const documents = catalog.documents;
  const sets = catalog.sets;
  const isEmpty = documents.length === 0 && sets.length === 0;

  async function handleUploadResult(
    result:
      | { status: "invalid"; message: string }
      | {
          status: "ok";
          importSummary: {
            requirementCount: number;
            constraintCount: number;
            flowCount: number;
            fileCount?: number;
          };
          kind: "document" | "set";
        },
  ) {
    if (result.status === "invalid") {
      setUploadError(result.message);
      return;
    }

    if (result.kind === "set" && result.importSummary.fileCount) {
      setUploadSuccess(
        t("specifications.importSetSuccessSummary", {
          files: result.importSummary.fileCount,
          requirements: result.importSummary.requirementCount,
          constraints: result.importSummary.constraintCount,
          flows: result.importSummary.flowCount,
        }),
      );
    } else {
      setUploadSuccess(
        t("specifications.importSuccessSummary", {
          requirements: result.importSummary.requirementCount,
          constraints: result.importSummary.constraintCount,
          flows: result.importSummary.flowCount,
        }),
      );
    }
    await queryClient.invalidateQueries({ queryKey: ["specifications", projectId] });
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0 || uploading || disabled) {
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);

    try {
      const payloads = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          relativePath: file.webkitRelativePath || file.name,
          content: await file.text(),
        })),
      );

      if (isSpecKitType(documentType) && payloads.length >= 2) {
        const result = await uploadSpecificationSet({
          data: {
            projectId,
            files: payloads,
          },
        });
        await handleUploadResult(result);
        return;
      }

      if (payloads.length > 1) {
        setUploadError(t("specifications.singleDocumentOnly"));
        return;
      }

      const file = payloads[0]!;
      const result = await uploadSpecification({
        data: {
          projectId,
          filename: file.filename,
          content: file.content,
          documentType,
          ...(file.relativePath !== file.filename ? { originalPath: file.relativePath } : {}),
        },
      });
      await handleUploadResult(result);
    } catch {
      setUploadError(t("specifications.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList?.length) {
      return;
    }
    await uploadFiles([...fileList]);
  }

  async function handleRemoveDocument(spec: SpecificationRecord) {
    setUploadError(null);
    setUploadSuccess(null);
    try {
      await removeSpecification({
        data: { projectId, specificationId: spec.id },
      });
      await queryClient.invalidateQueries({ queryKey: ["specifications", projectId] });
    } catch {
      setUploadError(t("specifications.removeFailed"));
    }
  }

  async function handleRemoveSet(set: SpecificationSetWithFiles) {
    setUploadError(null);
    setUploadSuccess(null);
    try {
      await removeSpecificationSet({
        data: { projectId, setId: set.id },
      });
      await queryClient.invalidateQueries({ queryKey: ["specifications", projectId] });
    } catch {
      setUploadError(t("specifications.removeFailed"));
    }
  }

  const specKitMode = isSpecKitType(documentType);

  return (
    <DemoPanel title={t("specifications.title")} tourTarget="projects-specifications">
      <p className="mb-4 text-sm text-muted-foreground">{t("specifications.description")}</p>
      <p className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {t("specifications.uploadPrivacyNotice")}
      </p>

      <div className="grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="spec-document-type">{t("specifications.documentType")}</Label>
          <Select
            value={documentType}
            onValueChange={(value) => setDocumentType(value as SpecificationDocumentType)}
            disabled={disabled || uploading}
          >
            <SelectTrigger id="spec-document-type" className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPECIFICATION_DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="spec-file">
            {specKitMode ? t("specifications.uploadSetLabel") : t("specifications.uploadLabel")}
          </Label>
          <Input
            ref={fileInputRef}
            id="spec-file"
            type="file"
            accept=".md,.txt,.json,text/markdown,text/plain,application/json"
            className="mt-2"
            disabled={disabled || uploading}
            multiple={specKitMode}
            onChange={handleFileChange}
          />
          {specKitMode ? (
            <Input
              ref={folderInputRef}
              id="spec-folder"
              type="file"
              className="sr-only"
              disabled={disabled || uploading}
              multiple
              {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={handleFileChange}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 size-4" />
            {uploading ? t("specifications.uploading") : t("specifications.uploadButton")}
          </Button>
          {specKitMode ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || uploading}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpen className="mr-2 size-4" />
              {t("specifications.uploadFolderButton")}
            </Button>
          ) : null}
        </div>
      </div>

      {specKitMode ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("specifications.specKitHint")}</p>
      ) : null}

      {uploadError ? <p className="mt-3 text-sm text-destructive">{uploadError}</p> : null}
      {uploadSuccess ? <p className="mt-3 text-sm text-status-pass">{uploadSuccess}</p> : null}

      <div className="mt-6 space-y-3">
        {specificationsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground">{t("specifications.empty")}</p>
        ) : (
          <>
            {sets.map((set) => (
              <div
                key={set.id}
                className="rounded-md border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <FolderOpen className="size-4 shrink-0" />
                      {t("specifications.setTitle", { name: set.name })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {set.documentType} · {specificationAuthorityLabel(set.documentType)} ·{" "}
                      {t("specifications.fileCount", { count: set.fileCount })} ·{" "}
                      {t(`specifications.status.${set.parseStatus}` as "specifications.status.ready")}
                    </p>
                    {set.summary ? (
                      <p className="mt-2 text-sm text-muted-foreground">{set.summary}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleRemoveSet(set)}
                  >
                    <Trash2 className="mr-1 size-4" />
                    {t("specifications.removeSet")}
                  </Button>
                </div>
                <ul className="mt-4 space-y-2 border-t border-border pt-3">
                  {set.files.map((file) => (
                    <li key={file.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <FileText className="mt-0.5 size-4 shrink-0" />
                      <span>
                        <span className="font-medium text-foreground">{file.relativePath}</span>
                        {file.fileRole !== "other" ? (
                          <span className="ml-2 text-xs uppercase tracking-wide">{file.fileRole}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {documents.map((spec) => (
              <div
                key={spec.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-4"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileText className="size-4 shrink-0" />
                    {spec.filename}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {spec.documentType} · {specificationAuthorityLabel(spec.documentType)} ·{" "}
                    {t(`specifications.status.${spec.parseStatus}` as "specifications.status.ready")}
                  </p>
                  {spec.summary ? (
                    <p className="mt-2 text-sm text-muted-foreground">{spec.summary}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => handleRemoveDocument(spec)}
                >
                  <Trash2 className="mr-1 size-4" />
                  {t("specifications.remove")}
                </Button>
              </div>
            ))}
          </>
        )}
      </div>
    </DemoPanel>
  );
}
