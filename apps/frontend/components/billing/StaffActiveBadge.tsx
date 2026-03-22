'use client'

import { useBillingStore } from '@/store/billingStore'
import { UserX } from 'lucide-react'
import { RoleBadge } from '@/components/shared/RoleBadge'

export function StaffActiveBadge() {
    const { activeStaff, clearPin } = useBillingStore()

    if (!activeStaff) return null

    return (
        <div data-testid="staff-badge" className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 animate-in slide-in-from-left-2">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-800 tracking-tight">
                    {activeStaff.name}
                </span>
            </div>
            
            <RoleBadge role={activeStaff.role} size="sm" />
            
            {activeStaff.maxDiscount > 0 && (
                <span className="text-xs font-semibold text-green-700 ml-1 bg-green-100 px-1.5 py-0.5 rounded border border-green-200 hidden sm:inline-block">
                    Max disc: {activeStaff.maxDiscount}%
                </span>
            )}
            
            <div className="w-px h-4 bg-green-200 mx-1 hidden sm:block" />
            
            <button
                onClick={clearPin}
                className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-900 hover:bg-green-100/50 px-2 py-1 rounded transition-colors group"
            >
                Change 
                <UserX className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
            </button>
        </div>
    )
}
