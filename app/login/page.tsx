import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#080c14] text-slate-400 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    <span className="text-xs uppercase tracking-wider font-mono text-slate-500">
                        Chargement du terminal d&apos;authentification...
                    </span>
                </div>
            }
        >
            <LoginForm />
        </Suspense>
    );
}