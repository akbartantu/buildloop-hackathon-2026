import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { isProjectRepositoryConnected } from "@/lib/projects/project-record";
import { validateSpecificationBundleUpload } from "@/lib/specifications/specification-bundle-upload";
import { validateSpecificationUpload } from "@/lib/specifications/specification-upload";
import { buildSpecificationDownloadArtifact } from "@/lib/specifications/specification-download";

const projectIdSchema = z.object({
  projectId: z.string().uuid(),
});

const uploadSpecificationSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().trim().min(1),
  originalPath: z.string().trim().optional(),
  documentType: z.string().trim().optional(),
  content: z.string(),
});

const uploadSpecificationSetSchema = z.object({
  projectId: z.string().uuid(),
  bundleName: z.string().trim().optional(),
  files: z
    .array(
      z.object({
        filename: z.string().trim().min(1),
        relativePath: z.string().trim().optional(),
        content: z.string(),
      }),
    )
    .min(2),
});

const deleteSpecificationSchema = z.object({
  projectId: z.string().uuid(),
  specificationId: z.string().uuid(),
});

const deleteSpecificationSetSchema = z.object({
  projectId: z.string().uuid(),
  setId: z.string().uuid(),
});

const downloadSpecificationSchema = z.object({
  projectId: z.string().uuid(),
  specificationId: z.string().uuid(),
});

const downloadSpecificationSetFileSchema = z.object({
  projectId: z.string().uuid(),
  setId: z.string().uuid(),
  fileId: z.string().uuid(),
});

export const listProjectSpecifications = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => projectIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const project = await context.projects.getProject(data.projectId, context.auth.userId);
    if (!project) {
      throw new Error("Project not found.");
    }
    return context.specifications.listSpecificationsCatalog(data.projectId, context.auth.userId);
  });

export const uploadProjectSpecification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => uploadSpecificationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const project = await context.projects.getProject(data.projectId, context.auth.userId);
    if (!project) {
      throw new Error("Project not found.");
    }
    if (!isProjectRepositoryConnected(project)) {
      throw new Error("Connect a repository before uploading specifications.");
    }

    const validation = validateSpecificationUpload({
      filename: data.filename,
      content: data.content,
      ...(data.originalPath ? { originalPath: data.originalPath } : {}),
      ...(data.documentType ? { documentType: data.documentType } : {}),
    });
    if (!validation.ok) {
      return { status: "invalid" as const, message: validation.message };
    }

    const record = await context.specifications.createSpecification({
      userId: context.auth.userId,
      projectId: data.projectId,
      filename: validation.filename,
      originalPath: validation.originalPath,
      documentType: validation.documentType,
      content: validation.content,
    });

    return {
      status: "ok" as const,
      kind: "document" as const,
      specification: record,
      importSummary: {
        requirementCount: record.requirementCount ?? 0,
        constraintCount: record.constraintCount ?? 0,
        flowCount: record.flowCount ?? 0,
      },
    };
  });

export const uploadProjectSpecificationSet = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => uploadSpecificationSetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const project = await context.projects.getProject(data.projectId, context.auth.userId);
    if (!project) {
      throw new Error("Project not found.");
    }
    if (!isProjectRepositoryConnected(project)) {
      throw new Error("Connect a repository before uploading specifications.");
    }

    const validation = validateSpecificationBundleUpload({
      files: data.files.map((file) => ({
        filename: file.filename,
        content: file.content,
        ...(file.relativePath ? { relativePath: file.relativePath } : {}),
      })),
      ...(data.bundleName ? { bundleName: data.bundleName } : {}),
    });
    if (!validation.ok) {
      return { status: "invalid" as const, message: validation.message };
    }

    const set = await context.specifications.createSpecificationSet({
      userId: context.auth.userId,
      projectId: data.projectId,
      name: validation.name,
      documentType: validation.documentType,
      summary: validation.summary,
      requirementCount: validation.requirementCount,
      constraintCount: validation.constraintCount,
      flowCount: validation.flowCount,
      files: validation.files,
    });

    return {
      status: "ok" as const,
      kind: "set" as const,
      set,
      importSummary: {
        fileCount: set.fileCount,
        requirementCount: set.requirementCount ?? 0,
        constraintCount: set.constraintCount ?? 0,
        flowCount: set.flowCount ?? 0,
      },
    };
  });

export const deleteProjectSpecification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => deleteSpecificationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const deleted = await context.specifications.deleteSpecification({
      id: data.specificationId,
      projectId: data.projectId,
      userId: context.auth.userId,
    });
    return { status: deleted ? ("ok" as const) : ("not_found" as const) };
  });

export const deleteProjectSpecificationSet = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => deleteSpecificationSetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const deleted = await context.specifications.deleteSpecificationSet({
      id: data.setId,
      projectId: data.projectId,
      userId: context.auth.userId,
    });
    return { status: deleted ? ("ok" as const) : ("not_found" as const) };
  });

export const downloadProjectSpecification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => downloadSpecificationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const project = await context.projects.getProject(data.projectId, context.auth.userId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const artifact = await context.specifications.getSpecificationDownload({
      id: data.specificationId,
      projectId: data.projectId,
      userId: context.auth.userId,
    });
    if (!artifact) {
      return { status: "not_found" as const };
    }

    return {
      status: "ok" as const,
      download: buildSpecificationDownloadArtifact(artifact.filename, artifact.content),
    };
  });

export const downloadProjectSpecificationSetFile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => downloadSpecificationSetFileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const project = await context.projects.getProject(data.projectId, context.auth.userId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const artifact = await context.specifications.getSpecificationSetFileDownload({
      fileId: data.fileId,
      setId: data.setId,
      projectId: data.projectId,
      userId: context.auth.userId,
    });
    if (!artifact) {
      return { status: "not_found" as const };
    }

    return {
      status: "ok" as const,
      download: buildSpecificationDownloadArtifact(artifact.filename, artifact.content),
    };
  });
