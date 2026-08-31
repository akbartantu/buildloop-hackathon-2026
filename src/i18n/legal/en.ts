export const legalEn = {
  privacy: {
    metaTitle: "Privacy Policy — BuildLoop",
    metaDescription:
      "How BuildLoop collects and uses account, workspace, task, specification, and operational data.",
    title: "Privacy Policy",
    intro:
      "This policy explains what BuildLoop may process when you use the public hackathon/demo release. It describes actual product behavior — not legal certification.",
    updated: "Last updated: August 31, 2026. This policy may change as BuildLoop evolves.",
    sections: {
      collected: {
        heading: "Information we may process",
        p1:
          "Depending on how you use BuildLoop, we may process: account identity and profile information (such as display name, email, and sign-in provider metadata from Supabase Auth); workspace/project metadata (such as project name and connected public GitHub repository URL, owner, branch, and commit references); task goals, acceptance criteria, clarification answers, and generated task contracts; uploaded workspace specifications (PRD, FRD, BRD, Architecture, API Spec, ADR, Spec Kit bundles, and other supported technical documents); orchestration run and evidence metadata (status, checks, changed files, checker results, approval records); and limited operational/security logs needed to operate and protect the service.",
        p2:
          "If you join the public pilot waitlist on the landing page, we store the email address you submit, selected role, optional pain-point note (up to 500 characters), consent marker, and submission timestamp in Supabase. The waitlist is not readable through the public site.",
        p3:
          "BuildLoop does not intentionally collect passwords for third-party services, private repository credentials, or payment card data in the current release. Do not submit secrets through tasks or specification uploads.",
      },
      purposes: {
        heading: "Why we use this information",
        p1:
          "We use the above information to authenticate users; provide workspace and project functionality; generate and execute bounded task contracts; analyze repository and specification context for planning; generate or refine acceptance criteria where implemented; run governed orchestration; produce checker/evidence results; maintain audit trails; prevent abuse and security incidents; and operate and improve service reliability.",
        p2:
          "BuildLoop does not use your data for advertising profiles, sell personal data, or operate an ad network in the current release.",
      },
      ai: {
        heading: "AI processing (Google Gemini)",
        p1:
          "Certain BuildLoop features may send task-relevant context to Google Gemini when required for functionality — for example bounded coding worker execution, task interpretation, or semantic planning where implemented. This may include portions of a task goal, contract fields, repository paths, and relevant specification excerpts — not your entire repository by default.",
        p2:
          "BuildLoop is designed to use minimum necessary context for the active task. API keys, internal prompts, and provider-side retention are not exposed in the UI. Google Gemini is a service provider used to operate AI-assisted features; Google ADK is a runtime framework used by BuildLoop and is not itself a separate data store.",
      },
      providers: {
        heading: "Service providers and infrastructure",
        p1:
          "Service providers and infrastructure used to operate BuildLoop may include: Supabase (authentication and Postgres application data); Google Cloud Run (application hosting); Google Firestore (orchestrator runtime/evidence persistence in production); Google Secret Manager (server-side secrets such as service role keys and Gemini API keys); Google Gemini API (AI-assisted worker/planning features); and GitHub (public repository source access).",
        p2:
          "Exact legal processor classifications may vary by deployment. This page describes operational roles rather than claiming formal certification under any privacy regime.",
      },
      github: {
        heading: "Public GitHub repositories",
        p1:
          "BuildLoop currently supports public GitHub repository connection for hackathon/demo scope. When you connect a repository, BuildLoop may inspect repository metadata, clone content into a controlled execution workspace, analyze files for task planning, and use repository state during validation and orchestration.",
        p2:
          "Private repository OAuth is not supported in the current release. BuildLoop does not claim ownership of your repository content. You are responsible for connecting repositories you are authorized to use.",
      },
      specifications: {
        heading: "Uploaded specifications",
        p1:
          "Workspace specifications — including single documents and Spec Kit bundles — are stored as workspace context. Relevant files or sections may influence task planning and appear in Sources Used. They may be processed by AI when necessary for planning or execution assistance.",
        p2:
          "Specifications should not intentionally contain credentials, API keys, passwords, private keys, or production secrets. BuildLoop does not execute uploaded files as code.",
        p3:
          "You are responsible for having authority to upload specification material and for excluding sensitive content from uploads.",
      },
      secrets: {
        heading: "Secrets and credentials",
        p1:
          "Do not enter or upload passwords, API keys, service-account credentials, access tokens, private keys, or production secrets into tasks, clarifications, or specification uploads. BuildLoop includes guardrails for sensitive goals, but you remain responsible for avoiding secret disclosure.",
      },
      waitlist: {
        heading: "Pilot waitlist",
        p1:
          "The landing-page waitlist stores contact and interest information in Supabase for pilot outreach. It is separate from authenticated workspace data.",
        p2:
          "Waitlist submissions do not automatically create an application account.",
      },
      retention: {
        heading: "Data retention",
        p1:
          "BuildLoop may retain account, project, task, contract, approval, specification, and operational records while your account/workspace remains active and as reasonably necessary for security, audit, and service operation.",
        p2:
          "Automatic deletion schedules are not fully self-service in the current release. Retention automation and export tooling may be expanded in future versions.",
      },
      rights: {
        heading: "Your choices and requests",
        p1:
          "Depending on the feature set available to you, you may disconnect a repository, remove uploaded specifications, delete individual specifications or specification sets where supported, switch workspaces, and update profile information in Settings.",
        p2:
          "For access, correction, or deletion requests beyond self-service controls, contact the operator through the public GitHub repository issue tracker listed below. BuildLoop does not promise instant automated deletion of all backend records where retention is required for security or audit.",
      },
      security: {
        heading: "Security practices",
        p1:
          "BuildLoop is designed with human approval for sensitive actions, protected-path enforcement, bounded contracts, workspace isolation (including Supabase row-level security where enabled), server-side secret storage, and evidence/audit records. See the Security Overview for more detail.",
      },
      international: {
        heading: "International use",
        p1:
          "Privacy rights vary by jurisdiction. BuildLoop aims to follow practical principles of transparency, purpose limitation, data minimization, security, and user control. This page does not claim GDPR, UU PDP, CCPA, or other formal compliance certification.",
        p2:
          "If you believe you have privacy rights under applicable law, you may contact the operator using the channel below.",
      },
      contact: {
        heading: "Contact",
        p1:
          "Privacy and security inquiries for this hackathon/demo release can be submitted through the public GitHub repository issue tracker: https://github.com/akbartantu/buildloop-hackathon-2026. A dedicated security contact address may be published before wider production use.",
      },
    },
  },
  cookies: {
    metaTitle: "Cookie & Local Storage Policy — BuildLoop",
    metaDescription:
      "How BuildLoop uses cookies, local storage, and browser caching in the current release.",
    title: "Cookie & Local Storage Policy",
    intro:
      "This page documents browser storage mechanisms BuildLoop actually uses today. BuildLoop does not operate advertising or marketing tracking cookies in the current release.",
    updated: "Last updated: August 31, 2026.",
    sections: {
      overview: {
        heading: "Overview",
        p1:
          "BuildLoop uses a small set of functional browser mechanisms to keep you signed in, remember preferences, and operate the workspace UI. We distinguish cookies, localStorage, and normal browser caching below.",
        p2:
          "Because optional analytics/tracking cookies are not present, BuildLoop does not show a blocking cookie-consent banner in the current release.",
      },
      essential: {
        heading: "Essential cookies and storage",
        p1:
          "Supabase Auth persists session state in browser localStorage using Supabase-managed keys (typically `sb-<project-ref>-auth-token`). This is required for sign-in and session continuity.",
        p2:
          "The application sidebar may store open/closed UI state in a functional cookie named `sidebar_state` (path=/, limited max-age). This supports basic UI behavior only.",
      },
      preferences: {
        heading: "Preference storage",
        p1:
          "BuildLoop stores non-secret preferences in localStorage, including: `buildloop.locale` (language selection), `buildloop.activeProjectId` (active workspace selection), `buildloop-connected-repository` (connected repository display metadata in local/demo flows), and `buildloop.productTour.completed.v2` (onboarding tour completion).",
        p2:
          "These values are functional preferences or UI state — not advertising profiles.",
      },
      auth: {
        heading: "Authentication sessions",
        p1:
          "Session tokens are handled by the Supabase client library. BuildLoop does not manually copy session tokens into custom UI fields or expose service-role keys to the browser.",
        p2:
          "Sign-out clears the Supabase session according to provider behavior.",
      },
      noTracking: {
        heading: "No advertising or analytics cookies",
        p1:
          "The current BuildLoop release does not load third-party advertising pixels, marketing analytics SDKs, or optional tracking cookies.",
        p2:
          "If optional analytics are added in the future, BuildLoop should load them only with appropriate consent controls.",
      },
      cache: {
        heading: "Browser and CDN caching",
        p1:
          "Static application assets (JavaScript, CSS, icons) may be cached by your browser or a CDN/proxy according to normal HTTP cache headers. This temporary caching is not the same as storing your task or specification content in the browser.",
        p2:
          "Server-side persistence for tasks, specifications, and orchestration evidence lives in Supabase, Firestore, or local development stores — not in browser cache.",
      },
      manage: {
        heading: "Managing storage",
        p1:
          "You can clear site data through browser settings, sign out to reset auth storage, or remove local preference keys via browser developer tools. Clearing auth storage will sign you out.",
        p2:
          "Removing preference keys resets language, active workspace selection, or tour completion state.",
      },
    },
  },
  security: {
    metaTitle: "Security Overview — BuildLoop",
    metaDescription:
      "Security boundaries, governance controls, and reporting guidance for BuildLoop.",
    title: "Data & Security Overview",
    intro:
      "BuildLoop is designed for governed autonomous software delivery. This overview describes security-relevant behavior in the current hackathon/demo release — not certification.",
    updated: "Last updated: August 31, 2026.",
    sections: {
      overview: {
        heading: "Scope",
        p1:
          "BuildLoop coordinates bounded task execution with human approval for sensitive or irreversible actions. Security controls combine product policy, infrastructure configuration, and operational practices.",
        p2:
          "This page does not claim SOC 2, ISO 27001, PCI, GDPR, UU PDP, or penetration-test certification unless separately documented with evidence.",
      },
      approval: {
        heading: "Human approval gates",
        p1:
          "Actions such as commit, push, merge, and deploy require explicit human approval before BuildLoop continues. Sensitive goals may be blocked at preflight rather than executed automatically.",
        p2:
          "Approval records are part of the product audit trail.",
      },
      bounded: {
        heading: "Bounded execution and verification",
        p1:
          "Tasks run against locked contracts with defined scope, acceptance criteria, protected paths, and a maximum correction attempt limit. An independent checker evaluates results; the worker does not decide its own PASS outcome.",
        p2:
          "When evidence is insufficient, BuildLoop should surface FAILED, BLOCKED, or human-review states rather than silent success.",
      },
      isolation: {
        heading: "Workspace and data isolation",
        p1:
          "Workspaces are tied to connected repository identity. Application data is scoped by authenticated user and project identifiers. Supabase row-level security policies restrict specification, project, and task access to the owning user where enabled.",
        p2:
          "Orchestrator runtime and evidence may be stored separately (for example Firestore in production) from relational product data in Supabase.",
      },
      infrastructure: {
        heading: "Infrastructure and secrets",
        p1:
          "Production deployments may use Google Cloud Run, Cloud IAM, Secret Manager, Firestore, and Supabase. Server-side secrets such as Supabase service role keys and Gemini API keys are intended to remain on the server — not in client bundles or UI.",
        p2:
          "GitHub access in the current release focuses on public repository URLs and clone operations within task execution boundaries.",
      },
      logging: {
        heading: "Logging and error handling",
        p1:
          "Operational logs should prefer safe metadata (error codes, phases, identifiers) rather than full task bodies, specification content, authorization headers, or secrets.",
        p2:
          "If you believe logs expose sensitive data, report it through the contact channel below.",
      },
      governance: {
        heading: "Cyber governance principles",
        p1:
          "BuildLoop is designed around least privilege, human-in-the-loop control for irreversible actions, separation of execution and verification, traceability through contracts and evidence, bounded autonomy, secure-by-default UI behavior, explicit protected paths, provenance via Sources Used, and minimum necessary context for planning.",
        p2:
          "These are engineering goals — not guarantees against all misuse or misconfiguration.",
      },
      headers: {
        heading: "Web security headers",
        p1:
          "BuildLoop applies reasonable default HTTP security headers where supported by the application server (such as `X-Content-Type-Options`, `Referrer-Policy`, frame protection, and a conservative `Permissions-Policy`).",
        p2:
          "A strict Content-Security-Policy is not enforced in a way that would break Supabase auth, Vite assets, or required runtime behavior without testing.",
      },
      limitations: {
        heading: "Known limitations",
        p1:
          "This hackathon/demo release supports public GitHub repositories, not private OAuth repository access. Self-service full account erasure may require operator assistance.",
        p2:
          "Security maturity, retention automation, and formal third-party review remain ongoing work.",
      },
      reporting: {
        heading: "Report a security concern",
        p1:
          "Suspected vulnerabilities or security issues for this release can be reported through the public GitHub repository issue tracker: https://github.com/akbartantu/buildloop-hackathon-2026. Please avoid posting secrets or live credentials in public issues.",
        p2:
          "A dedicated security contact address may be published before wider production use.",
      },
    },
  },
} as const;
