import { FileText, Globe2, Languages, Printer, Radar, ServerCog, Share2, Upload } from "lucide-react";

export const navItems = [
  { key: "scanner", href: "/", external: false },
  { key: "logs", href: "/logs", external: false },
  { key: "caseStudy", href: "https://me.itheheda.online", external: true }
] as const;

export const scannerCapabilities = [
  { key: "geoAudit", icon: FileText },
  { key: "crawlerLogs", icon: ServerCog },
  { key: "selfHosted", icon: Radar }
] as const;

export const reportActions = [
  { key: "copyLink", icon: Share2, action: "copy" },
  { key: "printReport", icon: Printer, action: "print" },
  { key: "uploadLogsNext", icon: Upload, action: "logs" }
] as const;

export const languageActions = [
  { locale: "en", labelKey: "switchToEnglish", icon: Languages },
  { locale: "zh", labelKey: "switchToChinese", icon: Globe2 }
] as const;

export const reportSectionRegistry = [
  { id: "executiveSummary", labelKey: "executiveSummary" },
  { id: "scoreMeaning", labelKey: "scoreMeaning" },
  { id: "priorityFindings", labelKey: "priorityFindings" },
  { id: "machineReadableAssets", labelKey: "machineReadableAssets" },
  { id: "auditedPages", labelKey: "auditedPages" },
  { id: "technicalAppendix", labelKey: "technicalAppendix" }
] as const;
