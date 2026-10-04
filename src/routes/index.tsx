import { createFileRoute } from "@tanstack/react-router";
import { EditorShell } from "@/components/editor/shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <EditorShell key="plates" />;
}
