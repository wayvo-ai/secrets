import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert
      variant="destructive"
      className="my-4 border-red-200 bg-red-50 text-red-800"
    >
      <CircleAlert />
      <AlertDescription className="text-red-800">{message}</AlertDescription>
    </Alert>
  );
}
