import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
