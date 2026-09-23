import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen w-full flex items-center justify-center bg-white">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
            }
        >
            <LoginForm />
        </Suspense>
    );
}