import React from "react";

export const SDRIllustration = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 200 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="90" fill="url(#sdr-gradient)" fillOpacity="0.1" />
        <path d="M60 100C60 77.9086 77.9086 60 100 60C122.091 60 140 77.9086 140 100" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-primary-500" />
        <path d="M140 100V110C140 126.569 126.569 140 110 140H100" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-primary-500" />
        <circle cx="140" cy="100" r="12" fill="currentColor" className="text-primary-600" />
        <path d="M85 95L95 105L115 85" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500" transform="translate(-5, 10)" />
        <rect x="70" y="70" width="60" height="60" rx="12" stroke="currentColor" strokeWidth="4" className="text-slate-400/50" />
        <defs>
            <linearGradient id="sdr-gradient" x1="100" y1="0" x2="100" y2="200" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
            </linearGradient>
        </defs>
    </svg>
);

export const ManagerIllustration = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 200 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="40" width="120" height="120" rx="16" fill="url(#manager-gradient)" fillOpacity="0.1" />
        <path d="M60 140V110" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-blue-400" />
        <path d="M90 140V90" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-primary-500" />
        <path d="M120 140V70" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-accent-500" />
        <path d="M150 140V100" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-accent-500" />
        <path d="M50 140H150" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-slate-300" />
        <circle cx="160" cy="40" r="20" fill="currentColor" fillOpacity="0.2" className="text-yellow-400" />
        <defs>
            <linearGradient id="manager-gradient" x1="100" y1="40" x2="100" y2="160" gradientUnits="userSpaceOnUse">
                <stop stopColor="#3b82f6" />
                <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
        </defs>
    </svg>
);

export const BDIllustration = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 200 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M40 160L160 40" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="text-slate-300" />
        <path d="M40 140L80 110L110 130L160 60" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500" />
        <circle cx="160" cy="60" r="8" fill="currentColor" className="text-emerald-600" />
        <rect x="50" y="100" width="20" height="60" rx="4" fill="currentColor" className="text-slate-200" />
        <rect x="90" y="80" width="20" height="80" rx="4" fill="currentColor" className="text-slate-300" />
        <rect x="130" y="50" width="20" height="110" rx="4" fill="currentColor" className="text-slate-400" />
        <defs>
            <filter id="shadow" x="0" y="0" width="200" height="200" filterUnits="userSpaceOnUse">
                <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.1" />
            </filter>
        </defs>
    </svg>
);

export const ClientIllustration = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 200 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="50" y="40" width="100" height="120" rx="12" fill="white" stroke="currentColor" strokeWidth="4" className="text-slate-200" />
        <path d="M70 70H130" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-slate-300" />
        <path d="M70 95H130" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-slate-300" />
        <path d="M70 120H110" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-slate-300" />

        <circle cx="150" cy="150" r="35" fill="url(#client-gradient)" />
        <path d="M135 155L145 165L165 140" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />

        <defs>
            <linearGradient id="client-gradient" x1="150" y1="115" x2="150" y2="185" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0ea5e9" />
                <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
        </defs>
    </svg>
);

export const DeveloperIllustration = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 200 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="30" y="50" width="140" height="100" rx="8" fill="#1e293b" />
        <rect x="30" y="50" width="140" height="20" rx="8" fill="#334155" />
        <circle cx="45" cy="60" r="3" fill="#ef4444" />
        <circle cx="55" cy="60" r="3" fill="#f59e0b" />
        <circle cx="65" cy="60" r="3" fill="#10b981" />

        <path d="M50 90L70 110L50 130" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M80 130H100" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />

        <rect x="130" y="110" width="60" height="60" rx="12" fill="url(#dev-gradient)" transform="rotate(15 160 140)" />
        <path d="M145 140L155 130L165 140L175 130" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" transform="rotate(15 160 140)" />

        <defs>
            <linearGradient id="dev-gradient" x1="130" y1="110" x2="190" y2="170" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#ec4899" />
            </linearGradient>
        </defs>
    </svg>
);
