'use client'

import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScheduleHAlertProps {
    hasScheduleH: boolean
    requiresDoctorDetails: boolean
    onAddDoctorDetails?: () => void
}

export function ScheduleHAlert({ hasScheduleH, requiresDoctorDetails, onAddDoctorDetails }: ScheduleHAlertProps) {
    if (!hasScheduleH && !requiresDoctorDetails) return null

    if (requiresDoctorDetails) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 m-4 animate-in fade-in flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-red-800 text-sm">Cart contains Schedule H1/X/Narcotic drugs</h4>
                    <p className="text-xs text-red-600 mt-1">Doctor details REQUIRED to save this bill</p>
                    <button 
                        type="button"
                        onClick={onAddDoctorDetails}
                        className="mt-2 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded px-2 py-1 transition-colors"
                    >
                        Add Doctor Details →
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 m-4 animate-in fade-in flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
                <h4 className="font-semibold text-amber-800 text-sm">Cart contains Schedule H drugs</h4>
                <p className="text-xs text-amber-600 mt-1">Prescription required at dispensing</p>
            </div>
        </div>
    )
}
