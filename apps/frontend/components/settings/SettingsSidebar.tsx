'use client';

import {
    Building2, Receipt, Printer, ShoppingCart, Clock,
    Bell, Palette, Database, IndianRupee
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SectionId =
    | 'outlet' | 'gst'
    | 'printer' | 'billing' | 'pricing' | 'attendance'
    | 'notifications' | 'preferences' | 'data';

interface NavGroup {
    label: string;
    items: { id: SectionId; label: string; icon: React.ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
    {
        label: 'Pharmacy',
        items: [
            { id: 'outlet', label: 'Outlet Profile', icon: Building2 },
            { id: 'gst', label: 'GST & Tax', icon: Receipt },
        ],
    },
    {
        label: 'Operations',
        items: [
            { id: 'printer', label: 'Printing', icon: Printer },
            { id: 'billing', label: 'Billing', icon: ShoppingCart },
            { id: 'pricing', label: 'Billing & Pricing', icon: IndianRupee },
            { id: 'attendance', label: 'Attendance', icon: Clock },
        ],
    },
    {
        label: 'System',
        items: [
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'preferences', label: 'Preferences', icon: Palette },
            { id: 'data', label: 'Data Management', icon: Database },
        ],
    },
];

interface SettingsSidebarProps {
    active: SectionId;
    onChange: (id: SectionId) => void;
    hasUnsavedChanges: boolean;
}

export function SettingsSidebar({ active, onChange, hasUnsavedChanges }: SettingsSidebarProps) {
    return (
        <div className="w-56 shrink-0 bg-slate-50 py-4 sticky top-0 self-start">
            {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-2">
                    <p className="text-xs text-slate-400 uppercase tracking-wider px-4 py-2 mt-1 font-medium">
                        {group.label}
                    </p>
                    {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = active === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onChange(item.id)}
                                className={cn(
                                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 cursor-pointer text-sm transition-colors text-left',
                                    'w-[calc(100%-1rem)]',
                                    isActive
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                                )}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="flex-1 truncate">{item.label}</span>
                                {hasUnsavedChanges && isActive && (
                                    <span className="text-amber-500 text-xs">●</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

export type { SectionId };
