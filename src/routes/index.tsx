import { createFileRoute } from "@tanstack/react-router";
import { AsteroidsApp } from "@/game/AsteroidsApp";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <AsteroidsApp />;
}
