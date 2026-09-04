import type { IntegrationStatus, ReadinessState } from "@/domain/integration-status/types";
import type { PricingConfiguration } from "@/domain/pricing/types";

export type PublicationProfile = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  publicDescription: string | null;
  isPublic: boolean;
  updatedAt: string;
};

export type PublicationReadinessItem = {
  key: "profile" | "pricing" | "stripe" | "postmark" | "worker";
  label: string;
  state: ReadinessState;
  detail: string;
  href: string;
};

export type PublicationReadiness = {
  ready: boolean;
  items: PublicationReadinessItem[];
};

export type PublicationSettings = {
  profile: PublicationProfile;
  pricing: PricingConfiguration | null;
  integrations: IntegrationStatus;
  readiness: PublicationReadiness;
};

export type PublicationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

