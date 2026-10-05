import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { EditorClient } from "./EditorClient";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: Props) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  return <EditorClient documentId={id} />;
}
