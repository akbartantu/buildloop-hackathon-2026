import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, FolderOpen, Trash2, Upload, X } from "lucide-react";
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
  downloadProjectSpecification,
  downloadProjectSpecificationSetFile,
  listProjectSpecifications,
  uploadProjectSpecification,
  uploadProjectSpecificationSet,
} from "@/lib/specifications.functions";
import { triggerSpecificationDownload } from "@/lib/specifications/specification-download";
import {
  canSubmitPendingUpload,
  pendingFilesFromSelection,
  replacePendingSelection,
  resolvePendingUploadAction,
  type PendingSpecificationFile,
} from "@/lib/specifications/specification-pending-upload";
import {
  SPECIFICATION_DOCUMENT_TYPES,
  specificationAuthorityLabel,
  type SpecificationDocumentType,
  type SpecificationRecord,
} from "@/lib/specifications/specification-record";
import type {
  SpecificationSetFileRecord,
  SpecificationSetWithFiles,
} from "@/lib/specifications/specification-set-record";

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
  const downloadSpecification = useServerFn(downloadProjectSpecification);
  const downloadSpecificationSetFile = useServerFn(downloadProjectSpecificationSetFile);
  const [documentType, setDocumentType] = useState<SpecificationDocumentType>("PRD");
  const [pendingFiles, setPendingFiles] = useState<PendingSpecificationFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const specificationsQuery = useQuery({
    queryKey: ["specifications", projectId],
    queryFn: () => fetchSpecifications({ data: { projectId } }),
  });

  const catalog = specificationsQuery.data ?? { documents: [], sets: [] };
  const documents = catalog.documents;
  const sets = catalog.sets;
  const isEmpty = documents.length === 0 && sets.length === 0;
  const specKitMode = isSpecKitType(documentType);
  const canUpload = canSubmitPendingUpload({
    pending: pendingFiles,
    documentType,
    uploading,
    disabled,
  });

  function resetFileInputs() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }

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

    setPendingFiles([]);
    resetFileInputs();

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

  async function uploadPendingFiles() {
    if (!canUpload) {
      return;
    }

    const resolution = resolvePendingUploadAction(pendingFiles, documentType);
    if (resolution.mode === "invalid") {
      if (resolution.reason === "multiple-single-document") {
        setUploadError(t("specifications.singleDocumentOnly"));
      }
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);
    setDownloadError(null);
    setUploading(true);

    try {
      if (resolution.mode === "set") {
        const result = await uploadSpecificationSet({
          data: {
            projectId,
            files: pendingFiles.map((file) => ({
              filename: file.filename,
              content: file.content,
              ...(file.relativePath !== file.filename ? { relativePath: file.relativePath } : {}),
            })),
          },
        });
        await handleUploadResult(result);
        return;
      }

      const file = pendingFiles[0]!;
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
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList?.length) {
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);
    setDownloadError(null);

    try {
      const incoming = await pendingFilesFromSelection([...fileList]);
      setPendingFiles(replacePendingSelection(incoming, specKitMode));
    } catch {
      setUploadError(t("specifications.uploadFailed"));
    } finally {
      event.target.value = "";
    }
  }

  function handleClearPending() {
    setPendingFiles([]);
    resetFileInputs();
    setUploadError(null);
  }

  async function handleRemoveDocument(spec: SpecificationRecord) {
    setUploadError(null);
    setUploadSuccess(null);
    setDownloadError(null);
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
    setDownloadError(null);
    try {
      await removeSpecificationSet({
        data: { projectId, setId: set.id },
      });
      await queryClient.invalidateQueries({ queryKey: ["specifications", projectId] });
    } catch {
      setUploadError(t("specifications.removeFailed"));
    }
  }

  async function handleDownloadDocument(spec: SpecificationRecord) {
    const downloadKey = `document:${spec.id}`;
    setDownloadError(null);
    setDownloadingKey(downloadKey);
    try {
      const result = await downloadSpecification({
        data: { projectId, specificationId: spec.id },
      });
      if (result.status !== "ok") {
        setDownloadError(t("specifications.downloadFailed"));
        return;
      }
      triggerSpecificationDownload(result.download);
    } catch {
      setDownloadError(t("specifications.downloadFailed"));
    } finally {
      setDownloadingKey(null);
    }
  }

  async function handleDownloadSetFile(set: SpecificationSetWithFiles, file: SpecificationSetFileRecord) {
    const downloadKey = `set-file:${file.id}`;
    setDownloadError(null);
    setDownloadingKey(downloadKey);
    try {
      const result = await downloadSpecificationSetFile({
        data: { projectId, setId: set.id, fileId: file.id },
      });
      if (result.status !== "ok") {
        setDownloadError(t("specifications.downloadFailed"));
        return;
      }
      triggerSpecificationDownload(result.download);
    } catch {
      setDownloadError(t("specifications.downloadFailed"));
    } finally {
      setDownloadingKey(null);
    }
  }

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
            onValueChange={(value) => {
              setDocumentType(value as SpecificationDocumentType);
              setPendingFiles([]);
              resetFileInputs();
              setUploadError(null);
            }}
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
            className="sr-only"
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
          <div className="mt-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
            {pendingFiles.length > 0 ? (
              <ul className="space-y-1">
                {pendingFiles.map((file) => (
                  <li key={`${file.relativePath}:${file.filename}`} className="truncate text-foreground">
                    {file.relativePath}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("specifications.noFileSelected")}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText className="mr-2 size-4" />
            {t("specifications.chooseFileButton")}
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
          {pendingFiles.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || uploading}
              onClick={handleClearPending}
            >
              <X className="mr-2 size-4" />
              {t("specifications.clearPending")}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canUpload}
            onClick={() => void uploadPendingFiles()}
          >
            <Upload className="mr-2 size-4" />
            {uploading ? t("specifications.uploading") : t("specifications.uploadButton")}
          </Button>
        </div>
      </div>

      {specKitMode ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("specifications.specKitHint")}</p>
      ) : null}

      {uploadError ? <p className="mt-3 text-sm text-destructive">{uploadError}</p> : null}
      {uploadSuccess ? <p className="mt-3 text-sm text-status-pass">{uploadSuccess}</p> : null}
      {downloadError ? <p className="mt-3 text-sm text-destructive">{downloadError}</p> : null}

      <div className="mt-6 space-y-3">
        {specificationsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground">{t("specifications.empty")}</p>
        ) : (
          <>
            {sets.map((set) => (
              <div key={set.id} className="rounded-md border border-border p-4">
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
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0" />
                        <span>
                          <span className="font-medium text-foreground">{file.relativePath}</span>
                          {file.fileRole !== "other" ? (
                            <span className="ml-2 text-xs uppercase tracking-wide">{file.fileRole}</span>
                          ) : null}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled || downloadingKey === `set-file:${file.id}`}
                        onClick={() => void handleDownloadSetFile(set, file)}
                      >
                        <Download className="mr-1 size-4" />
                        {downloadingKey === `set-file:${file.id}`
                          ? t("specifications.downloading")
                          : t("specifications.download")}
                      </Button>
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
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || downloadingKey === `document:${spec.id}`}
                    onClick={() => void handleDownloadDocument(spec)}
                  >
                    <Download className="mr-1 size-4" />
                    {downloadingKey === `document:${spec.id}`
                      ? t("specifications.downloading")
                      : t("specifications.download")}
                  </Button>
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
              </div>
            ))}
          </>
        )}
      </div>
    </DemoPanel>
  );
}
