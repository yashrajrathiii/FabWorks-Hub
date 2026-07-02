import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile && profile.role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-xl font-semibold">Awaiting approval</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your account was created but hasn't been approved by the owner yet. Ask the admin to
          approve it from the Supabase dashboard.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
