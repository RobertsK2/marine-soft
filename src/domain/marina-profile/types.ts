import type { Database } from "@/types/database";

export type MarinaProfileRow = Database["public"]["Tables"]["marinas"]["Row"];

export type MarinaProfile = Pick<
  MarinaProfileRow,
  | "contact_email"
  | "contact_phone"
  | "id"
  | "local_language"
  | "name"
  | "public_description"
  | "public_description_local"
  | "slug"
  | "timezone"
  | "updated_at"
  | "website_url"
>;

export type MarinaProfileInput = {
  contactEmail: string | null;
  contactPhone: string | null;
  localLanguage: string | null;
  name: string;
  publicDescription: string | null;
  publicDescriptionLocal: string | null;
  timezone: string;
  websiteUrl: string | null;
};

export type MarinaProfileFieldErrors = Partial<
  Record<keyof MarinaProfileInput, string>
>;

export type MarinaProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: MarinaProfileFieldErrors;
};
