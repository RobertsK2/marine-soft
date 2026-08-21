import { logoutAction } from "@/app/auth/actions";

export default async function LogoutPage() {
  await logoutAction();
  return null;
}
